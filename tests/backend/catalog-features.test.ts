import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import sharp from "sharp";
import {
  locationSearchSchema,
  mapLocationSchema,
  propertyDetailSchema,
  propertyQuerySchema,
  propertyTreeQuerySchema,
  propertyTreeSchema,
  propertyUpdateSchema,
} from "../../src/domain/catalog";
import { createApiHandlers } from "../../src/server/api/handlers";
import { CatalogRepository } from "../../src/server/data/catalog-repository";
import { NominatimLocationSearch } from "../../src/server/integration/nominatim";
import {
  MAX_PHOTO_BYTES,
  PropertyPhotoStore,
} from "../../src/server/integration/property-photos";

const logger = () => {};
const manualDescription =
  "This manually written description has been reviewed against the current property facts before use.";
const request = (path: string) => new Request(`http://127.0.0.1:3000${path}`);
const googleMap = {
  source: "google-maps",
  label: "Oxford city centre",
  url: "https://www.google.com/maps/place/Oxford",
  latitude: null,
  longitude: null,
} satisfies NonNullable<ReturnType<typeof mapLocationSchema.parse>>;

test("tree aggregates exactly the paged property filters without returning leaves, including new GB cities", async () => {
  const repository = new CatalogRepository(":memory:");
  try {
    const api = createApiHandlers({
      repository,
      backend: { kind: "unconfigured" },
      logger,
    });
    const tree = propertyTreeSchema.parse(
      await (await api.propertyTree(request("/api/properties/tree"))).json(),
    );
    assert.equal(tree.total, 60);
    assert.equal(tree.groups.length, 6);
    assert.ok(
      tree.groups.every(
        (group) => Object.keys(group).sort().join(",") === "city,country,total",
      ),
    );
    const filters = { q: "Court", type: "apartment", minBeds: 1 };
    const aggregate = repository.propertyTree(
      propertyTreeQuerySchema.parse(filters),
    );
    assert.equal(
      aggregate.total,
      repository.listProperties(propertyQuerySchema.parse(filters)).total,
    );
    for (const group of aggregate.groups)
      assert.equal(
        group.total,
        repository.listProperties(
          propertyQuerySchema.parse({ ...filters, city: group.city }),
        ).total,
      );
    repository.updateProperty("property-001", {
      sourceVersion: 1,
      city: "Oxford",
    });
    const oxford = repository.propertyTree(
      propertyTreeQuerySchema.parse({ city: "Oxford" }),
    );
    assert.deepEqual(oxford, {
      groups: [{ country: "GB", city: "Oxford", total: 1 }],
      total: 1,
    });
    assert.equal(
      (await api.propertyTree(request("/api/properties/tree?pageSize=25")))
        .status,
      400,
    );
  } finally {
    repository.close();
  }
});

test("map/manual fields validate official URLs, survive SQL reads and invalidate reviews", () => {
  const repository = new CatalogRepository(":memory:");
  try {
    const before = repository.getProperty("property-001");
    assert.equal(before.property.manualLocation, true);
    assert.equal(before.property.mapLocation, null);
    assert.throws(
      () =>
        repository.updateProperty(before.property.id, {
          sourceVersion: 1,
          manualLocation: false,
        }),
      { code: "MAP_LOCATION_REQUIRED" },
    );
    assert.deepEqual(repository.getProperty(before.property.id), before);
    repository.updateListing("listing-001", {
      revision: 1,
      description: manualDescription,
      status: "reviewed",
    });
    const saved = repository.updateProperty(before.property.id, {
      sourceVersion: 1,
      manualLocation: false,
      mapLocation: googleMap,
      city: "Oxford",
      address: "Oxford city centre",
    });
    assert.equal(saved.property.manualLocation, false);
    assert.deepEqual(saved.property.mapLocation, googleMap);
    assert.equal(repository.getListing("listing-001").property.city, "Oxford");
    assert.equal(repository.getListing("listing-001").listing.status, "draft");
    assert.equal(
      Object.hasOwn(
        propertyUpdateSchema.parse({
          sourceVersion: 2,
          name: "Renamed property",
        }),
        "mapLocation",
      ),
      false,
    );
    assert.equal(
      mapLocationSchema.safeParse({
        ...googleMap,
        url: "https://google.com.attacker.example/maps",
      }).success,
      false,
    );
    assert.equal(
      mapLocationSchema.safeParse({
        ...googleMap,
        url: "https://www.google.com/url?next=https://attacker.example",
      }).success,
      false,
    );
    assert.equal(
      mapLocationSchema.safeParse({ ...googleMap, latitude: 51.7 }).success,
      false,
    );
    assert.equal(
      mapLocationSchema.safeParse({
        ...googleMap,
        url: "https://maps.app.goo.gl/example",
      }).success,
      true,
    );
  } finally {
    repository.close();
  }
});

test("existing SQLite catalogs gain location columns without losing properties, listings or references", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldnotes-migration-test-"));
  const path = join(directory, "catalog.sqlite");
  const seeded = new CatalogRepository(path);
  seeded.close();
  const legacy = new DatabaseSync(path);
  try {
    legacy.exec(
      "ALTER TABLE properties DROP COLUMN manualLocation; ALTER TABLE properties DROP COLUMN mapLocation;",
    );
  } finally {
    legacy.close();
  }
  const migrated = new CatalogRepository(path);
  try {
    assert.equal(
      migrated.listProperties(propertyQuerySchema.parse({})).total,
      60,
    );
    const detail = migrated.getProperty("property-001");
    assert.equal(detail.property.manualLocation, true);
    assert.equal(detail.property.mapLocation, null);
    assert.equal(detail.listings[0]?.reference, "FN-L001");
  } finally {
    migrated.close();
    await rm(directory, { recursive: true, force: true });
  }
});

function multipart(
  bytes: Buffer,
  sourceVersion: number,
  name = "../../original-name.jpg",
) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
    name,
  );
  form.append("sourceVersion", String(sourceVersion));
  return new Request(
    "http://127.0.0.1:3000/api/properties/property-001/photo",
    { method: "POST", body: form },
  );
}

test("multipart photo upload decodes/re-encodes WebP, strips metadata, serves safe names and invalidates review", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldnotes-photo-test-"));
  const repository = new CatalogRepository(":memory:");
  const photos = new PropertyPhotoStore(join(directory, "uploads"));
  try {
    repository.updateListing("listing-001", {
      revision: 1,
      description: manualDescription,
      status: "reviewed",
    });
    const api = createApiHandlers({
      repository,
      photos,
      backend: { kind: "unconfigured" },
      logger,
    });
    const original = await sharp({
      create: { width: 64, height: 48, channels: 3, background: "#356044" },
    })
      .withExif({ IFD0: { Artist: "Discard this original metadata" } })
      .jpeg()
      .toBuffer();
    assert.ok((await sharp(original).metadata()).exif);
    const response = await api.uploadPhoto(
      multipart(original, 1),
      "property-001",
    );
    assert.equal(response.status, 200);
    const detail = propertyDetailSchema.parse(await response.json());
    assert.equal(detail.property.sourceVersion, 2);
    assert.equal(detail.listings[0]?.status, "draft");
    const filename = detail.property.imagePath.slice("/api/photos/".length);
    assert.match(filename, /^[0-9a-f-]{36}\.webp$/);
    assert.deepEqual(await readdir(join(directory, "uploads")), [filename]);
    const image = await api.photo(request(detail.property.imagePath), filename);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/webp");
    const metadata = await sharp(
      Buffer.from(await image.arrayBuffer()),
    ).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 64);
    assert.equal(metadata.exif, undefined);
    assert.equal(
      (await api.uploadPhoto(multipart(original, 1), "property-001")).status,
      409,
    );
    assert.deepEqual(await readdir(join(directory, "uploads")), [filename]);
    assert.equal(
      (
        await api.photo(
          request("/api/photos/not-a-photo"),
          "../../package.json",
        )
      ).status,
      404,
    );
  } finally {
    repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("photo boundary rejects HTML/SVG, oversize files, excessive pixels and cleans files after revision races", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "fieldnotes-photo-reject-test-"),
  );
  const repository = new CatalogRepository(":memory:");
  const photos = new PropertyPhotoStore(join(directory, "uploads"));
  try {
    const api = createApiHandlers({
      repository,
      photos,
      backend: { kind: "unconfigured" },
      logger,
    });
    for (const text of [
      "<svg xmlns='http://www.w3.org/2000/svg'><rect width='1' height='1'/></svg>",
      "<!doctype html><script>alert(1)</script>",
    ])
      assert.equal(
        (await api.uploadPhoto(multipart(Buffer.from(text), 1), "property-001"))
          .status,
        400,
      );
    assert.equal(
      (
        await api.uploadPhoto(
          multipart(Buffer.alloc(MAX_PHOTO_BYTES + 1), 1),
          "property-001",
        )
      ).status,
      413,
    );
    const huge = await sharp({
      create: { width: 4096, height: 4096, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await assert.rejects(photos.write(huge), { code: "INVALID_PHOTO" });
    class RacingStore extends PropertyPhotoStore {
      override async write(bytes: Buffer) {
        const stored = await super.write(bytes);
        repository.updateProperty("property-001", {
          sourceVersion: 1,
          name: "A change during processing",
        });
        return stored;
      }
    }
    const racing = createApiHandlers({
      repository,
      photos: new RacingStore(join(directory, "uploads")),
      backend: { kind: "unconfigured" },
      logger,
    });
    const original = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "green" },
    })
      .jpeg()
      .toBuffer();
    assert.equal(
      (await racing.uploadPhoto(multipart(original, 1), "property-001")).status,
      409,
    );
    assert.deepEqual(await readdir(join(directory, "uploads")), []);
    assert.equal(
      repository.getProperty("property-001").property.imagePath,
      "/images/alder.jpg",
    );
  } finally {
    repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

const upstreamPlace = {
  place_id: 123,
  display_name: "Oxford, Oxfordshire, England, United Kingdom",
  lat: "51.752",
  lon: "-1.258",
  address: { city: "Oxford", country_code: "gb" },
};

test("location HTTP search uses approved transport, shared SQL cache/rate gate and no query logs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldnotes-location-test-"));
  const path = join(directory, "catalog.sqlite");
  const one = new CatalogRepository(path);
  const two = new CatalogRepository(path);
  let now = 10000;
  let calls = 0;
  const logs: unknown[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls += 1;
    const url = new URL(String(input));
    assert.equal(url.hostname, "nominatim.openstreetmap.org");
    assert.equal(url.searchParams.get("countrycodes"), "gb");
    assert.equal(init?.redirect, "error");
    assert.match(
      new Headers(init?.headers).get("user-agent") ?? "",
      /Fieldnotes/,
    );
    return Response.json([
      upstreamPlace,
      {
        ...upstreamPlace,
        place_id: 124,
        address: { city: "Boston", country_code: "us" },
      },
      { ...upstreamPlace, place_id: 125, address: { country_code: "gb" } },
    ]);
  };
  try {
    const a = createApiHandlers({
      repository: one,
      backend: { kind: "unconfigured" },
      locations: new NominatimLocationSearch({
        enabled: true,
        cache: one,
        fetcher,
        now: () => now,
      }),
      logger: (entry) => logs.push(entry),
    });
    const b = createApiHandlers({
      repository: two,
      backend: { kind: "unconfigured" },
      locations: new NominatimLocationSearch({
        enabled: true,
        cache: two,
        fetcher,
        now: () => now,
      }),
      logger: (entry) => logs.push(entry),
    });
    const response = await a.locations(request("/api/locations?q=Oxford"));
    assert.equal(response.status, 200);
    const result = locationSearchSchema.parse(await response.json());
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0]?.city, "Oxford");
    assert.equal(result.attribution, "© OpenStreetMap contributors");
    assert.equal(
      (await b.locations(request("/api/locations?q=oxford"))).status,
      200,
    );
    assert.equal(calls, 1);
    const limited = await b.locations(request("/api/locations?q=London"));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");
    assert.equal(calls, 1);
    now += 1000;
    assert.equal(
      (await b.locations(request("/api/locations?q=London"))).status,
      200,
    );
    assert.equal(calls, 2);
    assert.equal(JSON.stringify(logs).includes("London"), false);
    assert.equal(JSON.stringify(logs).includes("Oxford"), false);
    assert.equal(
      (
        await a.locations(
          request("/api/locations?q=Oxford&url=https://attacker.example"),
        )
      ).status,
      400,
    );
  } finally {
    one.close();
    two.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("disabled, malformed, oversized and failing location providers fail safely without external calls", async () => {
  const repository = new CatalogRepository(":memory:");
  let calls = 0;
  let now = 10000;
  try {
    const disabled = new NominatimLocationSearch({
      enabled: false,
      cache: repository,
      fetcher: async () => {
        calls++;
        return Response.json([]);
      },
    });
    await assert.rejects(disabled.search("London"), {
      code: "LOCATION_SEARCH_DISABLED",
    });
    assert.equal(calls, 0);
    for (const payload of [
      "not JSON",
      "x".repeat(262145),
      JSON.stringify([{ ...upstreamPlace, lat: "999" }]),
    ]) {
      const provider = new NominatimLocationSearch({
        enabled: true,
        cache: repository,
        now: () => now,
        fetcher: async () => new Response(payload),
      });
      await assert.rejects(provider.search(`London ${now}`), {
        code: "LOCATION_SEARCH_UNAVAILABLE",
        status: 502,
      });
      now += 1000;
    }
    assert.throws(
      () =>
        new NominatimLocationSearch({
          enabled: true,
          cache: repository,
          endpoint: "http://attacker.example/search",
        }),
    );
  } finally {
    repository.close();
  }
});
