import type { ListingRow } from "../../domain/catalog";
import { AppError } from "./errors";
import type { GenerationOptions, ListingProvider } from "./provider";
import type { PropertyDetails } from "./types";
import { parseDraft, type ProposalRequest } from "./validation";

export function createDraftGenerator(provider: ListingProvider) {
  return {
    async generate(facts: PropertyDetails, options?: GenerationOptions) {
      return parseDraft(await provider.generate(facts, options), facts);
    },
  };
}
interface ListingReader {
  getListing(id: string): ListingRow;
}
export function createListingService({
  repository,
  provider,
}: {
  repository: ListingReader;
  provider: ListingProvider;
}) {
  const generator = createDraftGenerator(provider);
  return {
    async generateProposal(
      id: string,
      expected: ProposalRequest,
      options?: GenerationOptions,
    ) {
      const before = repository.getListing(id);
      if (
        before.listing.revision !== expected.revision ||
        before.property.sourceVersion !== expected.sourceVersion
      ) {
        throw new AppError(
          "REVISION_CONFLICT",
          "The listing or property changed. Reload before asking for a proposal.",
          409,
        );
      }
      if (before.listing.status === "archived")
        throw new AppError(
          "LISTING_ARCHIVED",
          "Reopen the listing as a draft before requesting a proposal.",
        );
      const { property } = before;
      const facts: PropertyDetails = {
        location: `${property.city}, UK`,
        beds: property.beds,
        baths: property.baths,
        sizeSqm: property.sizeSqm,
        amenities: [...property.amenities],
      };
      const draft = await generator.generate(facts, options);
      const after = repository.getListing(id);
      if (
        after.listing.revision !== before.listing.revision ||
        after.property.sourceVersion !== property.sourceVersion
      ) {
        throw new AppError(
          "REVISION_CONFLICT",
          "The listing or property changed during generation. Your saved listing is unchanged; request a fresh proposal.",
          409,
        );
      }
      return {
        draft,
        baseRevision: before.listing.revision,
        baseFactsVersion: property.sourceVersion,
      };
    },
  };
}
