import { z } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}
const errorSchema = z.object({
  error: z.object({ message: z.string(), code: z.string() }),
});
export async function api<T>(
  url: string,
  schema: z.ZodType<T>,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      signal: options.signal,
      headers:
        options.body === undefined
          ? undefined
          : { "Content-Type": "application/json" },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new ApiError(
      "Could not reach the server. Retry when connected.",
      0,
      "NETWORK_ERROR",
    );
  }
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(value);
    throw new ApiError(
      parsed.success
        ? parsed.data.error.message
        : "The request could not be completed. Please retry.",
      response.status,
      parsed.success ? parsed.data.error.code : "REQUEST_FAILED",
    );
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ApiError(
      "The server returned an invalid response. Please retry.",
      502,
      "INVALID_RESPONSE",
    );
  return parsed.data;
}
