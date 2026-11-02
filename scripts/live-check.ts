import assert from "node:assert/strict";
import {
  generationProposalSchema,
  listingPageSchema,
  listingRowSchema,
} from "../src/domain/catalog";
import { parseDraft } from "../src/server/domain/validation";

const origin = new URL(process.env.APP_URL ?? "http://127.0.0.1:3000").origin;
const headers = { "Content-Type": "application/json", Origin: origin };
const page = listingPageSchema.parse(
  await (await fetch(`${origin}/api/listings?status=draft&pageSize=10`)).json(),
);
const row = page.items[0];
assert.ok(row, "Create a draft listing before running the live model check.");
const before = listingRowSchema.parse(
  await (await fetch(`${origin}/api/listings/${row.listing.id}`)).json(),
);
const response = await fetch(
  `${origin}/api/listings/${row.listing.id}/generate`,
  {
    method: "POST",
    headers,
    body: JSON.stringify({
      revision: before.listing.revision,
      sourceVersion: before.property.sourceVersion,
    }),
    signal: AbortSignal.timeout(125000),
  },
);
assert.equal(
  response.status,
  200,
  `Generation failed with HTTP ${response.status}. Check the running server's model configuration.`,
);
const proposal = generationProposalSchema.parse(await response.json());
const draft = parseDraft(proposal.draft, {
  location: `${before.property.city}, UK`,
  beds: before.property.beds,
  baths: before.property.baths,
  sizeSqm: before.property.sizeSqm,
  amenities: before.property.amenities,
});
const after = listingRowSchema.parse(
  await (await fetch(`${origin}/api/listings/${row.listing.id}`)).json(),
);
assert.deepEqual(
  after,
  before,
  "Generating a proposal must not save or overwrite the listing.",
);
process.stdout.write(
  `${JSON.stringify({ result: "passed", model: proposal.model, elapsedMs: proposal.elapsedMs, baseRevision: proposal.baseRevision, baseFactsVersion: proposal.baseFactsVersion, listingUnchanged: true, description: draft.description })}\n`,
);
