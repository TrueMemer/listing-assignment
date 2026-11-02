import { createHash } from "node:crypto";
import { z } from "zod";
import {
  citySchema,
  locationSearchSchema,
  type LocationResult,
  type LocationSearch,
} from "../../domain/catalog";
import { AppError } from "../domain/errors";

interface LocationCache {
  readLocationCache(key: string, now: number): LocationSearch | null;
  writeLocationCache(
    key: string,
    payload: LocationSearch,
    expiresAt: number,
    now: number,
  ): void;
  reserveLocationRequest(now: number): boolean;
}
export interface NominatimOptions {
  enabled: boolean;
  cache: LocationCache;
  endpoint?: string;
  userAgent?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}
const rawResultsSchema = z
  .array(
    z.object({
      place_id: z.union([z.string(), z.number()]),
      display_name: z.string().max(5000),
      lat: z
        .string()
        .min(1)
        .transform(Number)
        .pipe(z.number().min(-90).max(90)),
      lon: z
        .string()
        .min(1)
        .transform(Number)
        .pipe(z.number().min(-180).max(180)),
      address: z.record(z.string(), z.unknown()),
    }),
  )
  .max(5);
const attribution = {
  attribution: "© OpenStreetMap contributors",
  attributionUrl: "https://www.openstreetmap.org/copyright",
} satisfies Pick<LocationSearch, "attribution" | "attributionUrl">;

function clean(value: string, max: number) {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);
}

/** Explicit user searches only. SQLite shares the cache and 1/sec gate across callers. */
export class NominatimLocationSearch {
  private readonly endpoint: URL;
  private readonly userAgent: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(private readonly options: NominatimOptions) {
    this.endpoint = new URL(
      options.endpoint ?? "https://nominatim.openstreetmap.org/search",
    );
    if (
      this.endpoint.protocol !== "https:" ||
      this.endpoint.username ||
      this.endpoint.password ||
      this.endpoint.search ||
      this.endpoint.hash
    )
      throw new Error(
        "NOMINATIM_SEARCH_URL must be an approved HTTPS endpoint without credentials or query parameters.",
      );
    this.userAgent =
      options.userAgent?.trim() ||
      "Fieldnotes-Property-Assistant/1.0 (explicit location search; local assessment)";
    if (
      this.userAgent.length < 12 ||
      this.userAgent.length > 240 ||
      /[\r\n]/.test(this.userAgent)
    )
      throw new Error("NOMINATIM_USER_AGENT must identify this application.");
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 8000;
    if (
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < 100 ||
      this.timeoutMs > 15000
    )
      throw new Error("Invalid location lookup timeout.");
  }

  async search(query: string): Promise<LocationSearch> {
    if (!this.options.enabled)
      throw new AppError(
        "LOCATION_SEARCH_DISABLED",
        "Location search is not enabled. Enter the address manually or paste an official map link.",
        503,
      );
    const key = createHash("sha256")
      .update(
        `${this.endpoint.href}\0${query.trim().toLocaleLowerCase("en-GB")}`,
      )
      .digest("hex");
    const now = this.now();
    const cached = this.options.cache.readLocationCache(key, now);
    if (cached) return cached;
    if (!this.options.cache.reserveLocationRequest(now))
      throw new AppError(
        "LOCATION_RATE_LIMITED",
        "Please wait a second before searching again.",
        429,
      );
    const url = new URL(this.endpoint);
    url.search = new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      limit: "5",
      countrycodes: "gb",
      "accept-language": "en",
    }).toString();
    try {
      const response = await this.fetcher(url, {
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
      });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error("Location provider unavailable");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 262144) {
            await reader.cancel();
            throw new Error("Location response too large");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const raw = rawResultsSchema.parse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      const results: LocationResult[] = [];
      for (const place of raw) {
        if (place.address.country_code !== "gb") continue;
        const city = [
          place.address.city,
          place.address.town,
          place.address.village,
          place.address.municipality,
          place.address.hamlet,
        ].find(
          (value) =>
            typeof value === "string" && citySchema.safeParse(value).success,
        );
        if (typeof city !== "string") continue;
        const label = clean(place.display_name, 240);
        if (!label) continue;
        results.push({
          id: String(place.place_id),
          label,
          address: clean(place.display_name, 160),
          city: city.trim(),
          latitude: place.lat,
          longitude: place.lon,
          url: `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${place.lat}/${place.lon}`,
        });
      }
      const result = locationSearchSchema.parse({ results, ...attribution });
      this.options.cache.writeLocationCache(key, result, now + 86400000, now);
      return result;
    } catch {
      throw new AppError(
        "LOCATION_SEARCH_UNAVAILABLE",
        "Location search is unavailable. Your address is unchanged; use manual entry or try again later.",
        502,
      );
    }
  }
}
