import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRepository } from "../../src/server/data/catalog-repository";
import { AppError } from "../../src/server/domain/errors";
import {
  createDraftGenerator,
  createListingService,
} from "../../src/server/domain/listing-service";
import type { PropertyDetails } from "../../src/server/domain/types";
import { parseDraft } from "../../src/server/domain/validation";
import { MockListingProvider } from "../../src/server/integration/mock-provider";

const facts: PropertyDetails = {
  location: "London, UK",
  beds: 2,
  baths: 1,
  sizeSqm: 74,
  amenities: ["balcony", "lift", "storage"],
};
const description =
  "This property in London, UK has two bedrooms, one bathroom and a floor area of 74 square metres. It also has a balcony, lift and storage.";
const firstDescription =
  "This property in London, UK has one bedroom, one bathroom and 55 square metres of space. Confirmed amenities include a balcony, lift and storage.";

test("draft generation uses the injected adapter and validates its output", async () => {
  const provider = new MockListingProvider(JSON.stringify({ description }));
  assert.deepEqual(await createDraftGenerator(provider).generate(facts), {
    description,
  });
  assert.deepEqual(provider.calls, [facts]);
});

test("optional AI returns a proposal from stored facts without saving or replacing manual copy", async () => {
  const repo = new CatalogRepository(":memory:");
  try {
    const before = repo.getListing("listing-001");
    const provider = new MockListingProvider({ description: firstDescription });
    const service = createListingService({ repository: repo, provider });
    const proposal = await service.generateProposal(before.listing.id, {
      revision: before.listing.revision,
      sourceVersion: before.property.sourceVersion,
    });
    assert.equal(proposal.draft.description, firstDescription);
    assert.equal(proposal.baseRevision, before.listing.revision);
    assert.equal(proposal.baseFactsVersion, before.property.sourceVersion);
    assert.deepEqual(repo.getListing(before.listing.id), before);
    assert.deepEqual(Object.keys(provider.calls[0] ?? {}).sort(), [
      "amenities",
      "baths",
      "beds",
      "location",
      "sizeSqm",
    ]);
    assert.equal(
      JSON.stringify(provider.calls).includes(before.property.address),
      false,
    );
  } finally {
    repo.close();
  }
});

test("stale listing version is rejected before the adapter is called", async () => {
  const repo = new CatalogRepository(":memory:");
  try {
    const provider = new MockListingProvider({ description: firstDescription });
    const service = createListingService({ repository: repo, provider });
    await assert.rejects(
      service.generateProposal("listing-001", {
        revision: 99,
        sourceVersion: 1,
      }),
      { code: "REVISION_CONFLICT", status: 409 },
    );
    assert.equal(provider.calls.length, 0);
  } finally {
    repo.close();
  }
});

test("fact changes during inference discard obsolete proposals and never overwrite saved content", async () => {
  const repo = new CatalogRepository(":memory:");
  try {
    let finish: (output: unknown) => void = () => {};
    const output = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    const service = createListingService({
      repository: repo,
      provider: { generate: () => output },
    });
    const pending = service.generateProposal("listing-001", {
      revision: 1,
      sourceVersion: 1,
    });
    repo.updateProperty("property-001", { sourceVersion: 1, beds: 3 });
    finish({ description: firstDescription });
    await assert.rejects(pending, { code: "REVISION_CONFLICT", status: 409 });
    assert.equal(repo.getListing("listing-001").listing.description, "");
  } finally {
    repo.close();
  }
});

test("invalid model JSON, HTML, extra fields and unsupported claims fail safely", () => {
  for (const output of [
    "not JSON",
    { description: "short" },
    { description, extra: "hidden" },
    { description: `<p>${description}</p>` },
    { description: description.replace("two bedrooms", "three bedrooms") },
    {
      description: description.replace("74 square metres", "75 square metres"),
    },
    { description: `${description} Available now for £100.` },
    { description: `${description} This studio is ready.` },
  ]) {
    assert.throws(
      () => parseDraft(output, facts),
      (error) => error instanceof AppError && error.status === 502,
    );
  }
});
