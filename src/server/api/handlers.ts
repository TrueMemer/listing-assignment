import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  listingCreateSchema,
  listingQuerySchema,
  listingUpdateSchema,
  propertyQuerySchema,
  propertyUpdateSchema,
  propertyTreeQuerySchema,
  locationSearchQuerySchema,
  type LocationSearch,
} from "../../domain/catalog";
import type { CatalogRepository } from "../data/catalog-repository";
import { AppError } from "../domain/errors";
import { createListingService } from "../domain/listing-service";
import type { ListingProvider } from "../domain/provider";
import { proposalRequestSchema } from "../domain/validation";
import {
  PropertyPhotoStore,
  readPhotoUpload,
} from "../integration/property-photos";

type Backend =
  | {
      kind: "configured";
      provider: ListingProvider;
      model: string;
      mode: "codex" | "chat";
    }
  | { kind: "unconfigured" };
type LogEntry = {
  requestId: string;
  event: string;
  elapsedMs: number;
  code?: string;
  status?: number;
  model?: string;
};
export interface ApiOptions {
  repository: CatalogRepository | null;
  backend: Backend;
  publicOrigin?: string;
  logger?: (entry: LogEntry) => void;
  now?: () => number;
  photos?: PropertyPhotoStore;
  locations?: { search(query: string): Promise<LocationSearch> };
}
const API_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function parsePublicOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("PUBLIC_ORIGIN must be one HTTPS origin.");
  return url.origin;
}

function checkOrigin(request: Request, publicOrigin: string | undefined) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  let hostUrl: URL;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    throw new AppError(
      "INVALID_HOST",
      "Use the configured application address.",
      403,
    );
  }
  if (
    hostUrl.username ||
    hostUrl.password ||
    hostUrl.pathname !== "/" ||
    hostUrl.search ||
    hostUrl.hash
  ) {
    throw new AppError(
      "INVALID_HOST",
      "Use the configured application address.",
      403,
    );
  }
  // Next can normalize Request.url to an internal hostname. Validate the wire
  // Host instead, while refusing arbitrary DNS names even on a loopback socket.
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(hostUrl.hostname);
  const publicUrl = publicOrigin ? new URL(publicOrigin) : undefined;
  const approvedPublicHost =
    publicUrl &&
    new URL(`${publicUrl.protocol}//${host}`).host === publicUrl.host;
  if (!local && !approvedPublicHost)
    throw new AppError(
      "INVALID_HOST",
      "Use the configured application address.",
      403,
    );
  const allowedOrigin = local
    ? new URL(`${url.protocol}//${host}`).origin
    : publicOrigin;
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== allowedOrigin && origin !== publicOrigin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new AppError("INVALID_ORIGIN", "This request is not allowed.", 403);
  }
}

async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    throw new AppError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Send property details as JSON.",
      415,
    );
  }
  if (Number(request.headers.get("content-length")) > 32768)
    throw new AppError(
      "BODY_TOO_LARGE",
      "Property details are too large.",
      413,
    );
  if (!request.body)
    throw new AppError("INVALID_JSON", "Property details must be valid JSON.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        throw new AppError(
          "BODY_TOO_LARGE",
          "Property details are too large.",
          413,
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("INVALID_BODY", "The request body could not be read.");
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("INVALID_JSON", "Property details must be valid JSON.");
  }
}

function parseBoundary<T extends z.ZodType>(
  schema: T,
  value: unknown,
  label: string,
): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".");
    throw new AppError(
      "INVALID_INPUT",
      `Check ${label}${field ? `, ${field}` : ""}. ${issue?.message ?? "Unsupported input."}`,
    );
  }
  return parsed.data;
}
function queryInput(request: Request): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(values, key))
      throw new AppError(
        "INVALID_INPUT",
        "Use each query parameter at most once.",
      );
    values[key] = value;
  }
  return values;
}

/** Manual listing management works whether or not an AI provider is connected. */
export function createApiHandlers(options: ApiOptions) {
  const publicOrigin = parsePublicOrigin(options.publicOrigin);
  const now = options.now ?? Date.now;
  const logger =
    options.logger ??
    ((entry) => process.stdout.write(`${JSON.stringify(entry)}\n`));
  const backend = options.backend;
  const repository = () => {
    if (!options.repository)
      throw new AppError(
        "DATABASE_UNAVAILABLE",
        "The catalog is unavailable. Check server storage and retry.",
        503,
      );
    return options.repository;
  };
  const service =
    backend.kind === "configured" && options.repository
      ? createListingService({
          repository: options.repository,
          provider: backend.provider,
        })
      : undefined;
  let active = false;
  let windowStart = now();
  let attempts = 0;
  const json = (
    body: unknown,
    requestId: string,
    status = 200,
    extra: Record<string, string> = {},
  ) =>
    Response.json(body, {
      status,
      headers: { ...API_HEADERS, "X-Request-Id": requestId, ...extra },
    });
  async function handle(
    request: Request,
    work: (requestId: string, started: number) => Response | Promise<Response>,
  ): Promise<Response> {
    const requestId = randomUUID();
    const started = performance.now();
    try {
      checkOrigin(request, publicOrigin);
      return await work(requestId, started);
    } catch (error) {
      const safe =
        error instanceof AppError
          ? error
          : new AppError(
              "INTERNAL_ERROR",
              "The request could not be completed. Please retry.",
              500,
            );
      logger({
        requestId,
        event: "request_failed",
        elapsedMs: Math.round(performance.now() - started),
        code: safe.code,
        status: safe.status,
      });
      return json(
        { error: { code: safe.code, message: safe.message }, requestId },
        requestId,
        safe.status,
        safe.status === 429
          ? {
              "Retry-After": ["LOCATION_RATE_LIMITED", "PHOTO_BUSY"].includes(
                safe.code,
              )
                ? "1"
                : "60",
            }
          : {},
      );
    }
  }
  return {
    propertyTree: (request: Request) =>
      handle(request, (requestId) =>
        json(
          repository().propertyTree(
            parseBoundary(
              propertyTreeQuerySchema,
              queryInput(request),
              "property tree filters",
            ),
          ),
          requestId,
        ),
      ),
    locations: (request: Request) =>
      handle(request, async (requestId) => {
        const { q } = parseBoundary(
          locationSearchQuerySchema,
          queryInput(request),
          "location search",
        );
        if (!options.locations)
          throw new AppError(
            "LOCATION_SEARCH_DISABLED",
            "Location search is not enabled. Enter the address manually or paste an official map link.",
            503,
          );
        return json(await options.locations.search(q), requestId);
      }),
    uploadPhoto: (request: Request, id: string) =>
      handle(request, async (requestId) => {
        if (!options.photos)
          throw new AppError(
            "PHOTO_STORAGE_UNAVAILABLE",
            "Photo storage is unavailable. Please retry later.",
            503,
          );
        const upload = await readPhotoUpload(request);
        const catalog = repository();
        const current = catalog.getProperty(id).property;
        if (current.sourceVersion !== upload.sourceVersion)
          throw new AppError(
            "REVISION_CONFLICT",
            "The property changed. Reload it before uploading a photo.",
            409,
          );
        const stored = await options.photos.write(upload.bytes);
        try {
          return json(
            catalog.updatePropertyPhoto(
              id,
              upload.sourceVersion,
              stored.imagePath,
            ),
            requestId,
          );
        } catch (error) {
          await options.photos.remove(stored.filename).catch(() => {});
          throw error;
        }
      }),
    photo: (request: Request, filename: string) =>
      handle(request, async (requestId) => {
        if (!options.photos)
          throw new AppError("NOT_FOUND", "This photo was not found.", 404);
        const bytes = await options.photos.read(filename);
        return new Response(new Uint8Array(bytes), {
          headers: {
            ...API_HEADERS,
            "Content-Type": "image/webp",
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Disposition": 'inline; filename="property-photo.webp"',
            "X-Request-Id": requestId,
          },
        });
      }),
    status: (request: Request) =>
      handle(request, (requestId) =>
        json(
          backend.kind === "configured"
            ? { ready: true, model: backend.model, mode: backend.mode }
            : { ready: false, model: null, mode: "unconfigured" },
          requestId,
        ),
      ),
    properties: (request: Request) =>
      handle(request, (requestId) =>
        json(
          repository().listProperties(
            parseBoundary(
              propertyQuerySchema,
              queryInput(request),
              "property filters",
            ),
          ),
          requestId,
        ),
      ),
    property: (request: Request, id: string) =>
      handle(request, async (requestId) => {
        const catalog = repository();
        const result =
          request.method === "PATCH"
            ? catalog.updateProperty(
                id,
                parseBoundary(
                  propertyUpdateSchema,
                  await readJson(request),
                  "property details",
                ),
              )
            : catalog.getProperty(id);
        return json(result, requestId);
      }),
    listings: (request: Request) =>
      handle(request, async (requestId) => {
        const catalog = repository();
        if (request.method === "POST")
          return json(
            catalog.createListing(
              parseBoundary(
                listingCreateSchema,
                await readJson(request),
                "listing details",
              ),
            ),
            requestId,
            201,
          );
        return json(
          catalog.listListings(
            parseBoundary(
              listingQuerySchema,
              queryInput(request),
              "listing filters",
            ),
          ),
          requestId,
        );
      }),
    listing: (request: Request, id: string) =>
      handle(request, async (requestId) => {
        const catalog = repository();
        const result =
          request.method === "PATCH"
            ? catalog.updateListing(
                id,
                parseBoundary(
                  listingUpdateSchema,
                  await readJson(request),
                  "listing details",
                ),
              )
            : catalog.getListing(id);
        return json(result, requestId);
      }),
    generate: (request: Request, id: string) =>
      handle(request, async (requestId, started) => {
        const expected = parseBoundary(
          proposalRequestSchema,
          await readJson(request),
          "generation request",
        );
        if (backend.kind !== "configured" || !service)
          throw new AppError(
            "AI_NOT_CONFIGURED",
            "AI proposals are unavailable. You can still write and save the listing yourself.",
            503,
          );
        if (active)
          throw new AppError(
            "BUSY",
            "Another proposal is being generated. Please try again shortly.",
            429,
          );
        if (now() - windowStart >= 60000) {
          windowStart = now();
          attempts = 0;
        }
        if (attempts >= 12)
          throw new AppError(
            "RATE_LIMITED",
            "The demo limit has been reached. Please try again in one minute.",
            429,
          );
        attempts += 1;
        active = true;
        try {
          const proposal = await service.generateProposal(id, expected, {
            signal: request.signal,
          });
          const elapsedMs = Math.round(performance.now() - started);
          logger({
            requestId,
            event: "generation_success",
            elapsedMs,
            model: backend.model,
          });
          return json(
            { ...proposal, requestId, model: backend.model, elapsedMs },
            requestId,
          );
        } finally {
          active = false;
        }
      }),
  };
}
