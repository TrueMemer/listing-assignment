import type { GenerationOptions, ListingProvider } from "../domain/provider";
import type { PropertyDetails } from "../domain/types";

/** Test-only adapter. The runtime never selects this implementation. */
export class MockListingProvider implements ListingProvider {
  readonly calls: PropertyDetails[] = [];

  constructor(private readonly output: unknown) {}

  async generate(
    details: PropertyDetails,
    _options?: GenerationOptions,
  ): Promise<unknown> {
    this.calls.push(structuredClone(details));
    return this.output;
  }
}
