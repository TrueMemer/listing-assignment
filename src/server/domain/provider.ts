import type { PropertyDetails } from "./types";

export interface GenerationOptions {
  signal?: AbortSignal;
}

/** Model responses stay untrusted until the domain parser accepts them. */
export interface ListingProvider {
  generate(
    details: PropertyDetails,
    options?: GenerationOptions,
  ): Promise<unknown>;
}
