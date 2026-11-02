import "server-only";
import { resolve } from "node:path";
import { createApiHandlers, type ApiOptions } from "./api/handlers";
import { CatalogRepository } from "./data/catalog-repository";
import { AppError } from "./domain/errors";
import { ChatListingProvider } from "./integration/chat-provider";
import {
  CodexListingProvider,
  findCodexBinary,
} from "./integration/codex-provider";
import { PropertyPhotoStore } from "./integration/property-photos";
import { NominatimLocationSearch } from "./integration/nominatim";

function configuredBackend(): ApiOptions["backend"] {
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? "60000");
  const selected = process.env.AI_PROVIDER?.trim() || "codex";
  if (selected === "codex") {
    const binary = findCodexBinary(process.env.CODEX_BIN?.trim() || undefined);
    if (!binary) return { kind: "unconfigured" };
    const model = process.env.CODEX_MODEL?.trim() || undefined;
    return {
      kind: "configured",
      provider: new CodexListingProvider({ binary, model, timeoutMs }),
      model: model ?? "Codex CLI",
      mode: "codex",
    };
  }
  if (selected !== "chat")
    throw new Error("AI_PROVIDER must be codex or chat.");
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!baseUrl || !model) return { kind: "unconfigured" };
  return {
    kind: "configured",
    provider: new ChatListingProvider({
      baseUrl,
      model,
      apiKey: process.env.AI_API_KEY ?? "",
      timeoutMs,
    }),
    model,
    mode: "chat",
  };
}
function createRuntime() {
  let repository: CatalogRepository | null = null;
  try {
    repository = new CatalogRepository(
      resolve(
        /* turbopackIgnore: true */
        process.env.FIELDNOTES_DB_PATH?.trim() || ".data/fieldnotes.sqlite",
      ),
    );
  } catch {
    process.stderr.write(
      `${JSON.stringify({ event: "catalog_initialization_failed" })}\n`,
    );
  }
  let backend: ApiOptions["backend"];
  try {
    backend = configuredBackend();
  } catch {
    process.stderr.write(
      `${JSON.stringify({ event: "ai_configuration_invalid" })}\n`,
    );
    backend = { kind: "unconfigured" };
  }
  const photos = new PropertyPhotoStore(
    resolve(
      /* turbopackIgnore: true */ process.env.FIELDNOTES_UPLOAD_DIR?.trim() ||
        ".data/uploads",
    ),
  );
  let locations: NominatimLocationSearch | undefined;
  if (repository) {
    try {
      locations = new NominatimLocationSearch({
        enabled: process.env.LOCATION_SEARCH_ENABLED?.trim() === "true",
        cache: repository,
        endpoint: process.env.NOMINATIM_SEARCH_URL?.trim() || undefined,
        userAgent: process.env.NOMINATIM_USER_AGENT?.trim() || undefined,
      });
    } catch {
      process.stderr.write(
        `${JSON.stringify({ event: "location_search_configuration_invalid" })}\n`,
      );
    }
  }
  try {
    return {
      repository,
      api: createApiHandlers({
        repository,
        backend,
        photos,
        locations,
        publicOrigin: process.env.PUBLIC_ORIGIN?.trim() || undefined,
      }),
    };
  } catch {
    process.stderr.write(
      `${JSON.stringify({ event: "public_origin_configuration_invalid" })}\n`,
    );
    return {
      repository,
      api: createApiHandlers({
        repository,
        backend: { kind: "unconfigured" },
        photos,
        locations,
      }),
    };
  }
}
declare global {
  var fieldnotesServerRuntime: ReturnType<typeof createRuntime> | undefined;
}
function getRuntime() {
  return (globalThis.fieldnotesServerRuntime ??= createRuntime());
}
export function getApi() {
  return getRuntime().api;
}
export function getCatalogRepository() {
  const repository = getRuntime().repository;
  if (!repository)
    throw new AppError(
      "DATABASE_UNAVAILABLE",
      "The catalog is unavailable. Check server storage and retry.",
      503,
    );
  return repository;
}
