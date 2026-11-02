import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  generationProposalSchema,
  listingPageSchema,
  listingRowSchema,
  propertyPageSchema,
} from "../../src/domain/catalog";
import {
  createApiHandlers,
  type ApiOptions,
} from "../../src/server/api/handlers";
import { CatalogRepository } from "../../src/server/data/catalog-repository";
import { MockListingProvider } from "../../src/server/integration/mock-provider";

const description =
  "This property in London, UK has one bedroom, one bathroom and 55 square metres of space. Confirmed amenities include a balcony, lift and storage.";
const expected = { revision: 1, sourceVersion: 1 };
const logger = () => {};
function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`http://127.0.0.1:3000${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function setup(
  t: TestContext,
  backend: ApiOptions["backend"] = { kind: "unconfigured" },
  now?: () => number,
) {
  const repository = new CatalogRepository(":memory:");
  t.after(() => repository.close());
  return {
    repository,
    api: createApiHandlers({ repository, backend, logger, now }),
  };
}
function fakeBackend(): ApiOptions["backend"] {
  return {
    kind: "configured",
    provider: new MockListingProvider({ description }),
    model: "test-model",
    mode: "codex",
  };
}

test("manual creation/edit and SQL pages work without a model or browser storage", async (t) => {
  const { api, repository } = setup(t);
  const propertyResponse = await api.properties(
    request("/api/properties?page=2&pageSize=10"),
  );
  const page = propertyPageSchema.parse(await propertyResponse.json());
  assert.equal(page.total, 60);
  assert.equal(page.page, 2);
  assert.equal(page.items.length, 10);
  const listingPage = listingPageSchema.parse(
    await (await api.listings(request("/api/listings?purpose=sale"))).json(),
  );
  assert.ok(listingPage.items.every((row) => row.listing.purpose === "sale"));
  const response = await api.listings(
    request("/api/listings", "POST", {
      propertyId: "property-001",
      purpose: "rent",
      priceMinor: null,
      currency: "GBP",
      title: "Manual listing",
      description: "",
    }),
  );
  assert.equal(response.status, 201);
  const created = listingRowSchema.parse(await response.json());
  assert.equal(created.listing.status, "draft");
  assert.equal(created.listing.description, "");
  const saved = await api.listing(
    request(`/api/listings/${created.listing.id}`, "PATCH", {
      revision: 1,
      description,
      priceMinor: 123456,
      currency: "EUR",
    }),
    created.listing.id,
  );
  assert.equal(saved.status, 200);
  assert.equal(
    repository.getListing(created.listing.id).listing.currency,
    "EUR",
  );
  const inference = await api.generate(
    request(`/api/listings/${created.listing.id}/generate`, "POST", {
      revision: 2,
      sourceVersion: 1,
    }),
    created.listing.id,
  );
  assert.equal(inference.status, 503);
  assert.equal((await inference.json()).error.code, "AI_NOT_CONFIGURED");
  assert.equal(
    repository.getListing(created.listing.id).listing.description,
    description,
  );
});

test("proposal API returns base versions and leaves the SQL listing untouched", async (t) => {
  const { api, repository } = setup(t, fakeBackend());
  const before = repository.getListing("listing-001");
  const response = await api.generate(
    request("/api/listings/listing-001/generate", "POST", expected),
    "listing-001",
  );
  assert.equal(response.status, 200);
  const proposal = generationProposalSchema.parse(await response.json());
  assert.equal(proposal.draft.description, description);
  assert.equal(proposal.baseRevision, 1);
  assert.equal(proposal.baseFactsVersion, 1);
  assert.deepEqual(repository.getListing("listing-001"), before);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await (await api.status(request("/api/status"))).json(), {
    ready: true,
    model: "test-model",
    mode: "codex",
  });
});

test("Next-normalized URL uses actual loopback Host and Origin while hostile hosts stay blocked", async (t) => {
  const { api } = setup(t, fakeBackend());
  const normalized = new Request(
    "http://localhost:3000/api/listings/listing-001/generate",
    {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify(expected),
    },
  );
  assert.equal((await api.generate(normalized, "listing-001")).status, 200);
  for (const host of [
    "attacker.example",
    "attacker.example:3000",
    "evil@localhost:3000",
    "127.0.0.1:3000/extra",
  ]) {
    const response = await api.status(
      new Request("http://localhost:3000/api/status", { headers: { host } }),
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "INVALID_HOST");
  }
  assert.equal(
    (
      await api.status(
        request("/api/status", "GET", undefined, {
          origin: "http://127.0.0.1:4000",
        }),
      )
    ).status,
    403,
  );
});

test("typed filters, unknown fields, invalid money and stale revisions fail at the API boundary", async (t) => {
  const { api } = setup(t);
  const invalidStudio = await api.property(
    request("/api/properties/property-001", "PATCH", {
      sourceVersion: 1,
      type: "studio",
    }),
    "property-001",
  );
  assert.equal(invalidStudio.status, 400);
  assert.equal(
    (await invalidStudio.json()).error.code,
    "INVALID_PROPERTY_FACTS",
  );
  for (const query of [
    "pageSize=7",
    "type=castle",
    "page=0",
    "unknown=1",
    "q=a&q=b",
  ])
    assert.equal(
      (await api.properties(request(`/api/properties?${query}`))).status,
      400,
    );
  for (const body of [
    { revision: 1, priceMinor: 1.23 },
    { revision: 1, propertyId: "property-002" },
    { revision: 1, status: "published" },
  ]) {
    assert.equal(
      (
        await api.listing(
          request("/api/listings/listing-001", "PATCH", body),
          "listing-001",
        )
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await api.listing(
        request("/api/listings/listing-001", "PATCH", {
          revision: 999,
          title: "Stale save",
        }),
        "listing-001",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api.property(
        request("/api/properties/property-001", "PATCH", {
          sourceVersion: 999,
          beds: 4,
        }),
        "property-001",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api.property(
        request("/api/properties/no-such-property"),
        "no-such-property",
      )
    ).status,
    404,
  );
});

test("cross-site, media type, malformed JSON and oversized bodies are rejected safely", async (t) => {
  const { api } = setup(t);
  const cases = [
    [
      request(
        "/api/listings",
        "POST",
        {},
        { origin: "https://attacker.example" },
      ),
      403,
    ],
    [
      request("/api/listings", "POST", {}, { "sec-fetch-site": "cross-site" }),
      403,
    ],
    [
      request("/api/listings", "POST", {}, { "content-type": "text/plain" }),
      415,
    ],
    [
      new Request("http://localhost:3000/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      400,
    ],
    [request("/api/listings", "POST", { text: "x".repeat(40000) }), 413],
  ] satisfies [Request, number][];
  for (const [req, status] of cases)
    assert.equal((await api.listings(req)).status, status);
});

test("generation concurrency releases after completion and unexpected errors reveal no internals", async (t) => {
  let finish: (output: unknown) => void = () => {};
  const output = new Promise<unknown>((resolve) => {
    finish = resolve;
  });
  const { api } = setup(t, {
    kind: "configured",
    model: "test",
    mode: "chat",
    provider: { generate: () => output },
  });
  const first = api.generate(
    request("/api/listings/listing-001/generate", "POST", expected),
    "listing-001",
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(
    (
      await api.generate(
        request("/api/listings/listing-001/generate", "POST", expected),
        "listing-001",
      )
    ).status,
    429,
  );
  finish({ description });
  assert.equal((await first).status, 200);
  assert.equal(
    (
      await api.generate(
        request("/api/listings/listing-001/generate", "POST", expected),
        "listing-001",
      )
    ).status,
    200,
  );
  const broken = setup(t, {
    kind: "configured",
    model: "test",
    mode: "chat",
    provider: {
      generate: async () => {
        throw new Error("secret transport detail");
      },
    },
  }).api;
  const response = await broken.generate(
    request("/api/listings/listing-001/generate", "POST", expected),
    "listing-001",
  );
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes("secret"), false);
});

test("request quota expires after its window", async (t) => {
  let now = 0;
  const { api } = setup(t, fakeBackend(), () => now);
  for (let index = 0; index < 12; index++)
    assert.equal(
      (
        await api.generate(
          request("/api/listings/listing-001/generate", "POST", expected),
          "listing-001",
        )
      ).status,
      200,
    );
  assert.equal(
    (
      await api.generate(
        request("/api/listings/listing-001/generate", "POST", expected),
        "listing-001",
      )
    ).status,
    429,
  );
  now = 60001;
  assert.equal(
    (
      await api.generate(
        request("/api/listings/listing-001/generate", "POST", expected),
        "listing-001",
      )
    ).status,
    200,
  );
});
