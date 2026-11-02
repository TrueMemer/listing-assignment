import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  listingCreateSchema,
  listingQuerySchema,
  propertyQuerySchema,
} from "../../src/domain/catalog";
import { CatalogRepository } from "../../src/server/data/catalog-repository";

const description =
  "A manually written property description that the agent has checked against the current source facts.";

test("SQL returns 60 seeded properties in distinct pages and filters before pagination", () => {
  const repo = new CatalogRepository(":memory:");
  try {
    const one = repo.listProperties(propertyQuerySchema.parse({}));
    const two = repo.listProperties(propertyQuerySchema.parse({ page: 2 }));
    assert.equal(one.total, 60);
    assert.equal(one.pageCount, 6);
    assert.equal(one.items.length, 10);
    assert.equal(
      one.items.some((item) => two.items.some((other) => other.id === item.id)),
      false,
    );
    const filtered = repo.listProperties(
      propertyQuerySchema.parse({
        city: "London",
        type: "house",
        minBeds: 3,
        pageSize: 25,
      }),
    );
    assert.ok(filtered.total > 0);
    assert.ok(
      filtered.items.every(
        (item) =>
          item.city === "London" && item.type === "house" && item.beds >= 3,
      ),
    );
    assert.equal(
      repo.listProperties(propertyQuerySchema.parse({ q: "%' OR 1=1 --" }))
        .total,
      0,
    );
    assert.equal(
      repo.listProperties(propertyQuerySchema.parse({ q: "%" })).total,
      0,
    );
    assert.equal(
      repo.listProperties(propertyQuerySchema.parse({ page: 999 })).items
        .length,
      0,
    );
  } finally {
    repo.close();
  }
});

test("one property owns independent rent and sale listings; listing filters use SQL", () => {
  const repo = new CatalogRepository(":memory:");
  try {
    const detail = repo.getProperty("property-001");
    assert.equal(detail.listings.length, 2);
    assert.deepEqual(detail.listings.map((item) => item.purpose).sort(), [
      "rent",
      "sale",
    ]);
    const page = repo.listListings(
      listingQuerySchema.parse({
        propertyId: detail.property.id,
        purpose: "sale",
        q: "London",
      }),
    );
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.listing.purpose, "sale");
    const drafts = repo.listListings(
      listingQuerySchema.parse({ status: "draft", pageSize: 50 }),
    );
    assert.ok(drafts.items.every((item) => item.listing.status === "draft"));
    assert.equal(repo.listListings(listingQuerySchema.parse({})).pageCount, 3);
  } finally {
    repo.close();
  }
});

test("manual empty/unpriced drafts persist across reopen without reseeding or a model", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldnotes-db-test-"));
  const path = join(directory, "catalog.sqlite");
  let repo = new CatalogRepository(path);
  try {
    const created = repo.createListing(
      listingCreateSchema.parse({
        propertyId: "property-001",
        purpose: "rent",
        priceMinor: null,
        currency: "GBP",
        title: "My manual draft",
        description: "",
      }),
    );
    assert.equal(created.listing.description, "");
    assert.equal(created.listing.priceMinor, null);
    const saved = repo.updateListing(created.listing.id, {
      revision: created.listing.revision,
      description,
    });
    const competing = new CatalogRepository(path);
    try {
      const stale = competing.getListing(saved.listing.id).listing;
      repo.updateListing(saved.listing.id, {
        revision: stale.revision,
        title: "Saved in another session",
      });
      assert.throws(
        () =>
          competing.updateListing(stale.id, {
            revision: stale.revision,
            title: "Obsolete edit",
          }),
        { code: "REVISION_CONFLICT", status: 409 },
      );
    } finally {
      competing.close();
    }
    repo.close();
    repo = new CatalogRepository(path);
    assert.equal(
      repo.getListing(saved.listing.id).listing.description,
      description,
    );
    assert.equal(repo.listProperties(propertyQuerySchema.parse({})).total, 60);
    assert.equal(repo.listListings(listingQuerySchema.parse({})).total, 25);
  } finally {
    repo.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("listing references increment across independent connections and persist without rewriting legacy references", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldnotes-sequence-test-"));
  const path = join(directory, "catalog.sqlite");
  const first = new CatalogRepository(path);
  const second = new CatalogRepository(path);
  const input = listingCreateSchema.parse({
    propertyId: "property-001",
    purpose: "rent",
    priceMinor: null,
    currency: "GBP",
    title: "Manual listing",
    description: "",
  });
  try {
    // Simulate the extra UUID-reference draft from the previous implementation
    // before this database has a sequence. It must not affect numeric refs.
    const legacy = new DatabaseSync(path);
    try {
      legacy.exec(
        "INSERT INTO listings SELECT 'legacy-listing','FN-LA3FD2CC3',propertyId,purpose,priceMinor,currency,title,description,status,revision,reviewedFactsVersion,reviewedAt,createdAt,updatedAt FROM listings WHERE id='listing-001'",
      );
    } finally {
      legacy.close();
    }
    const one = first.createListing(input).listing;
    const two = second.createListing(input).listing;
    assert.equal(one.reference, "FN-L025");
    assert.equal(two.reference, "FN-L026");
    assert.notEqual(one.id, two.id);
    assert.match(one.id, /^[0-9a-f-]{36}$/);
  } finally {
    first.close();
    second.close();
  }
  const reopened = new CatalogRepository(path);
  try {
    assert.equal(
      reopened.getListing("legacy-listing").listing.reference,
      "FN-LA3FD2CC3",
    );
    assert.equal(reopened.createListing(input).listing.reference, "FN-L027");
    assert.equal(
      reopened.getListing("listing-024").listing.reference,
      "FN-L024",
    );
  } finally {
    reopened.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("studio updates enforce zero bedrooms after merging partial changes", () => {
  const repo = new CatalogRepository(":memory:");
  try {
    const before = repo.getProperty("property-001");
    assert.throws(
      () =>
        repo.updateProperty(before.property.id, {
          sourceVersion: 1,
          type: "studio",
        }),
      { code: "INVALID_PROPERTY_FACTS", status: 400 },
    );
    assert.deepEqual(repo.getProperty(before.property.id), before);
    const studio = repo.updateProperty(before.property.id, {
      sourceVersion: 1,
      type: "studio",
      beds: 0,
    });
    assert.equal(studio.property.type, "studio");
    assert.equal(studio.property.beds, 0);
    assert.throws(
      () =>
        repo.updateProperty(before.property.id, {
          sourceVersion: studio.property.sourceVersion,
          beds: 2,
        }),
      { code: "INVALID_PROPERTY_FACTS", status: 400 },
    );
    assert.equal(
      repo.getProperty(before.property.id).property.sourceVersion,
      studio.property.sourceVersion,
    );
    const apartment = repo.updateProperty(before.property.id, {
      sourceVersion: studio.property.sourceVersion,
      type: "apartment",
      beds: 2,
    });
    assert.equal(apartment.property.beds, 2);
  } finally {
    repo.close();
  }
});

test("source-fact changes invalidate every linked review atomically and preserve copy", () => {
  const repo = new CatalogRepository(":memory:");
  try {
    const original = repo.getProperty("property-001");
    const reviewed = original.listings.map(
      (item) =>
        repo.updateListing(item.id, {
          revision: item.revision,
          description,
          status: "reviewed",
        }).listing,
    );
    assert.ok(reviewed.every((item) => item.status === "reviewed"));
    const changed = repo.updateProperty(original.property.id, {
      sourceVersion: original.property.sourceVersion,
      beds: 4,
    });
    assert.equal(changed.property.sourceVersion, 2);
    assert.ok(
      changed.listings.every(
        (item) =>
          item.status === "draft" &&
          item.reviewedFactsVersion === null &&
          item.reviewedAt === null &&
          item.description === description,
      ),
    );
    for (const old of reviewed) {
      assert.equal(
        changed.listings.find((item) => item.id === old.id)?.revision,
        old.revision + 1,
      );
      assert.throws(
        () =>
          repo.updateListing(old.id, {
            revision: old.revision,
            status: "reviewed",
          }),
        { code: "REVISION_CONFLICT", status: 409 },
      );
    }
    assert.throws(
      () =>
        repo.updateProperty(original.property.id, {
          sourceVersion: 1,
          beds: 5,
        }),
      { code: "REVISION_CONFLICT", status: 409 },
    );
  } finally {
    repo.close();
  }
});

test("editing reviewed listing resets only its review; missing price does not block review", () => {
  const repo = new CatalogRepository(":memory:");
  try {
    const original = repo.getListing("listing-001");
    assert.throws(
      () =>
        repo.updateListing(original.listing.id, {
          revision: 1,
          status: "reviewed",
        }),
      { code: "REVIEW_REQUIRES_DESCRIPTION" },
    );
    const reviewed = repo.updateListing(original.listing.id, {
      revision: 1,
      description,
      status: "reviewed",
    });
    assert.equal(reviewed.listing.status, "reviewed");
    assert.equal(reviewed.listing.priceMinor, null);
    const edited = repo.updateListing(original.listing.id, {
      revision: reviewed.listing.revision,
      title: "Changed title",
    });
    assert.equal(edited.listing.status, "draft");
    assert.equal(edited.listing.reviewedAt, null);
    assert.equal(repo.getListing("listing-002").listing.revision, 1);
  } finally {
    repo.close();
  }
});

test("nullable prices sort last in both directions and zero remains an actual price", () => {
  const repo = new CatalogRepository(":memory:");
  try {
    repo.createListing(
      listingCreateSchema.parse({
        propertyId: "property-001",
        purpose: "sale",
        priceMinor: 0,
        currency: "GBP",
        title: "Zero price",
        description: "",
      }),
    );
    for (const sort of ["price-asc", "price-desc"]) {
      const page = repo.listListings(
        listingQuerySchema.parse({ sort, pageSize: 50 }),
      );
      assert.equal(page.items.at(-1)?.listing.priceMinor, null);
      assert.equal(
        page.items.filter((item) => item.listing.priceMinor === null).length,
        1,
      );
      if (sort === "price-asc")
        assert.equal(page.items[0]?.listing.priceMinor, 0);
    }
  } finally {
    repo.close();
  }
});
