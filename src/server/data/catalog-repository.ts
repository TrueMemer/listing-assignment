import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  cities,
  listingSchema,
  locationSearchSchema,
  photoFilenameSchema,
  propertySchema,
  propertyTreeSchema,
  type Listing,
  type ListingCreate,
  type ListingPage,
  type ListingQuery,
  type ListingRow,
  type ListingUpdate,
  type Property,
  type PropertyDetail,
  type PropertyPage,
  type PropertyQuery,
  type PropertyUpdate,
  type PropertyTree,
  type PropertyTreeQuery,
  type LocationSearch,
} from "../../domain/catalog";
import { AppError } from "../domain/errors";

const propertyJson = `json_object('id',p.id,'reference',p.reference,'name',p.name,'address',p.address,'city',p.city,'country',p.country,'type',p.type,'beds',p.beds,'baths',p.baths,'sizeSqm',p.sizeSqm,'amenities',json(p.amenities),'imagePath',p.imagePath,'sourceVersion',p.sourceVersion,'updatedAt',p.updatedAt,'manualLocation',json(CASE WHEN p.manualLocation=1 THEN 'true' ELSE 'false' END),'mapLocation',json(p.mapLocation))`;
const listingProjection = `l.*, ${propertyJson} AS propertyJson`;
const propertyOrder: Record<PropertyQuery["sort"], string> = {
  "name-asc": "p.name COLLATE NOCASE ASC, p.id ASC",
  "updated-desc": "p.updatedAt DESC, p.id ASC",
  "area-asc": "p.sizeSqm ASC, p.id ASC",
  "area-desc": "p.sizeSqm DESC, p.id ASC",
};
const listingOrder: Record<ListingQuery["sort"], string> = {
  "updated-desc": "l.updatedAt DESC, l.id ASC",
  "title-asc": "l.title COLLATE NOCASE ASC, l.id ASC",
  "price-asc": "l.priceMinor IS NULL ASC, l.priceMinor ASC, l.id ASC",
  "price-desc": "l.priceMinor IS NULL ASC, l.priceMinor DESC, l.id ASC",
};

function readProperty(row: Record<string, unknown>): Property {
  return propertySchema.parse({
    ...row,
    manualLocation: row.manualLocation === 1,
    mapLocation:
      typeof row.mapLocation === "string"
        ? JSON.parse(row.mapLocation)
        : row.mapLocation,
    amenities:
      typeof row.amenities === "string"
        ? JSON.parse(row.amenities)
        : row.amenities,
  });
}

function readListingRow(row: Record<string, unknown>): ListingRow {
  const { propertyJson: encodedProperty, ...listing } = row;
  if (typeof encodedProperty !== "string")
    throw new Error("Invalid property record");
  return {
    listing: listingSchema.parse(listing),
    property: propertySchema.parse(JSON.parse(encodedProperty)),
  };
}

function searchPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
}

function propertyFilter(query: PropertyTreeQuery) {
  const conditions: string[] = [];
  const values: SQLInputValue[] = [];
  if (query.q) {
    conditions.push(
      "(p.name LIKE ? ESCAPE '\\' OR p.address LIKE ? ESCAPE '\\' OR p.city LIKE ? ESCAPE '\\' OR p.reference LIKE ? ESCAPE '\\')",
    );
    values.push(...Array<SQLInputValue>(4).fill(searchPattern(query.q)));
  }
  if (query.city) {
    conditions.push("p.city=?");
    values.push(query.city);
  }
  if (query.type) {
    conditions.push("p.type=?");
    values.push(query.type);
  }
  if (query.minBeds !== undefined) {
    conditions.push("p.beds>=?");
    values.push(query.minBeds);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
}

function pagination<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

/** SQL owns filtering, pagination, revision checks and review invalidation. */
export class CatalogRepository {
  private readonly db: DatabaseSync;

  constructor(path: string, options: { seed?: boolean } = {}) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path, {
      timeout: 5000,
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
    });
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    this.migrate();
    if (options.seed !== false) this.seed();
  }

  close() {
    this.db.close();
  }

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS catalog_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_sequences (name TEXT PRIMARY KEY, value INTEGER NOT NULL CHECK(value>=0)) STRICT;
      CREATE TABLE IF NOT EXISTS location_cache (key TEXT PRIMARY KEY,payload TEXT NOT NULL,expiresAt INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS properties (
        id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        address TEXT NOT NULL, city TEXT NOT NULL, country TEXT NOT NULL CHECK(country='GB'),
        type TEXT NOT NULL CHECK(type IN ('apartment','house','studio')),
        beds INTEGER NOT NULL CHECK(beds BETWEEN 0 AND 10), baths REAL NOT NULL,
        sizeSqm REAL NOT NULL, amenities TEXT NOT NULL CHECK(json_valid(amenities)),
        imagePath TEXT NOT NULL, sourceVersion INTEGER NOT NULL CHECK(sourceVersion>0), updatedAt TEXT NOT NULL,
        manualLocation INTEGER NOT NULL DEFAULT 1 CHECK(manualLocation IN (0,1)), mapLocation TEXT CHECK(mapLocation IS NULL OR json_valid(mapLocation)),
        CHECK(type!='studio' OR beds=0)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, propertyId TEXT NOT NULL REFERENCES properties(id),
        purpose TEXT NOT NULL CHECK(purpose IN ('rent','sale')), priceMinor INTEGER CHECK(priceMinor>=0),
        currency TEXT NOT NULL CHECK(currency IN ('GBP','EUR','USD')), title TEXT NOT NULL, description TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft','reviewed','archived')), revision INTEGER NOT NULL CHECK(revision>0),
        reviewedFactsVersion INTEGER, reviewedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        CHECK((status='reviewed' AND reviewedFactsVersion IS NOT NULL AND reviewedAt IS NOT NULL) OR (status!='reviewed' AND reviewedFactsVersion IS NULL AND reviewedAt IS NULL))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS properties_filters ON properties(city,type,beds);
      CREATE INDEX IF NOT EXISTS listings_property ON listings(propertyId);
      CREATE INDEX IF NOT EXISTS listings_filters ON listings(status,purpose,updatedAt);
    `);
    const columns = this.db.prepare("PRAGMA table_info(properties)").all();
    if (!columns.some((column) => column.name === "manualLocation"))
      this.db.exec(
        "ALTER TABLE properties ADD COLUMN manualLocation INTEGER NOT NULL DEFAULT 1 CHECK(manualLocation IN (0,1))",
      );
    if (!columns.some((column) => column.name === "mapLocation"))
      this.db.exec(
        "ALTER TABLE properties ADD COLUMN mapLocation TEXT CHECK(mapLocation IS NULL OR json_valid(mapLocation))",
      );
  }

  private seed() {
    this.transaction(() => {
      if (
        this.db
          .prepare(
            "SELECT value FROM catalog_metadata WHERE key='seed_version'",
          )
          .get()
      )
        return;
      const insertProperty = this.db.prepare(
        "INSERT INTO properties(id,reference,name,address,city,country,type,beds,baths,sizeSqm,amenities,imagePath,sourceVersion,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      );
      const types: Property["type"][] = ["apartment", "house", "studio"];
      const images = [
        "/images/alder.jpg",
        "/images/willow.jpg",
        "/images/rowan-interior.jpg",
      ];
      const names = [
        "Alder Court",
        "Willow House",
        "Rowan Place",
        "Birch Terrace",
        "Maple Court",
        "Elm House",
        "Oak Place",
        "Cedar Court",
        "Ash Terrace",
        "Hazel House",
      ];
      const seeded: Property[] = [];
      const timestamp = "2026-11-01T09:00:00.000Z";
      for (let index = 0; index < 60; index++) {
        const type =
          types[Math.floor(index / cities.length) % types.length] ??
          "apartment";
        const city = cities[index % cities.length] ?? "London";
        const beds =
          type === "studio"
            ? 0
            : type === "house"
              ? 3 + (index % 2)
              : 1 + (index % 3);
        const property = propertySchema.parse({
          id: `property-${String(index + 1).padStart(3, "0")}`,
          reference: `FN-P${String(index + 1).padStart(3, "0")}`,
          name: `${names[index % names.length]} ${Math.floor(index / names.length) + 1}`,
          address: `${index + 10} Example Lane`,
          city,
          country: "GB",
          type,
          beds,
          baths: type === "house" ? 2 : 1,
          sizeSqm: type === "studio" ? 32 + (index % 15) : 55 + index * 2,
          amenities:
            type === "house"
              ? ["garden", "parking"]
              : type === "studio"
                ? ["furnished", "lift"]
                : ["balcony", "lift", "storage"],
          imagePath: images[index % images.length],
          sourceVersion: 1,
          updatedAt: timestamp,
        });
        insertProperty.run(
          property.id,
          property.reference,
          property.name,
          property.address,
          property.city,
          property.country,
          property.type,
          property.beds,
          property.baths,
          property.sizeSqm,
          JSON.stringify(property.amenities),
          property.imagePath,
          property.sourceVersion,
          property.updatedAt,
        );
        seeded.push(property);
      }
      const insertListing = this.db.prepare(
        "INSERT INTO listings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      );
      for (let index = 0; index < 24; index++) {
        const property = seeded[index === 1 ? 0 : index - (index > 1 ? 1 : 0)];
        if (!property) throw new Error("Missing seed property");
        const purpose = index % 4 === 1 ? "sale" : "rent";
        const description =
          index % 4 === 0
            ? ""
            : `This ${property.type} in ${property.city} has ${property.beds} bedrooms, ${property.baths} bathroom${property.baths === 1 ? "" : "s"} and ${property.sizeSqm} square metres of space. Confirmed amenities include ${property.amenities.join(", ")}.`;
        const status =
          index % 7 === 2 && description
            ? "reviewed"
            : index % 9 === 8
              ? "archived"
              : "draft";
        insertListing.run(
          `listing-${String(index + 1).padStart(3, "0")}`,
          `FN-L${String(index + 1).padStart(3, "0")}`,
          property.id,
          purpose,
          index === 0
            ? null
            : purpose === "rent"
              ? 125000 + index * 2500
              : 28000000 + index * 500000,
          "GBP",
          `${property.name} in ${property.city}`,
          description,
          status,
          1,
          status === "reviewed" ? 1 : null,
          status === "reviewed" ? timestamp : null,
          timestamp,
          timestamp,
        );
      }
      this.db
        .prepare("INSERT INTO catalog_metadata VALUES('seed_version','1')")
        .run();
    });
  }

  propertyTree(query: PropertyTreeQuery): PropertyTree {
    const { where, values } = propertyFilter(query);
    const groups = this.db
      .prepare(
        `SELECT p.country,p.city,COUNT(*) AS total FROM properties p ${where} GROUP BY p.country,p.city ORDER BY p.country,p.city COLLATE NOCASE`,
      )
      .all(...values);
    return propertyTreeSchema.parse({
      groups,
      total: groups.reduce((total, group) => total + Number(group.total), 0),
    });
  }

  listProperties(query: PropertyQuery): PropertyPage {
    const { where, values } = propertyFilter(query);
    const total = Number(
      this.db
        .prepare(`SELECT COUNT(*) AS total FROM properties p ${where}`)
        .get(...values)?.total ?? 0,
    );
    const rows = this.db
      .prepare(
        `SELECT p.*, (SELECT COUNT(*) FROM listings l WHERE l.propertyId=p.id) AS listingCount FROM properties p ${where} ORDER BY ${propertyOrder[query.sort]} LIMIT ? OFFSET ?`,
      )
      .all(...values, query.pageSize, (query.page - 1) * query.pageSize);
    const items = rows.map((row) => {
      const { listingCount, ...property } = row;
      return { ...readProperty(property), listingCount: Number(listingCount) };
    });
    return pagination(items, total, query.page, query.pageSize);
  }

  listListings(query: ListingQuery): ListingPage {
    const conditions: string[] = [];
    const values: SQLInputValue[] = [];
    if (query.q) {
      conditions.push(
        "(l.title LIKE ? ESCAPE '\\' OR l.reference LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR p.city LIKE ? ESCAPE '\\')",
      );
      values.push(...Array<SQLInputValue>(4).fill(searchPattern(query.q)));
    }
    if (query.status) {
      conditions.push("l.status=?");
      values.push(query.status);
    }
    if (query.purpose) {
      conditions.push("l.purpose=?");
      values.push(query.purpose);
    }
    if (query.propertyId) {
      conditions.push("l.propertyId=?");
      values.push(query.propertyId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const from = `FROM listings l JOIN properties p ON p.id=l.propertyId ${where}`;
    const total = Number(
      this.db.prepare(`SELECT COUNT(*) AS total ${from}`).get(...values)
        ?.total ?? 0,
    );
    const rows = this.db
      .prepare(
        `SELECT ${listingProjection} ${from} ORDER BY ${listingOrder[query.sort]} LIMIT ? OFFSET ?`,
      )
      .all(...values, query.pageSize, (query.page - 1) * query.pageSize);
    return pagination(
      rows.map(readListingRow),
      total,
      query.page,
      query.pageSize,
    );
  }

  getProperty(id: string): PropertyDetail {
    const row = this.db.prepare("SELECT * FROM properties WHERE id=?").get(id);
    if (!row)
      throw new AppError("NOT_FOUND", "This property was not found.", 404);
    const listings = this.db
      .prepare(
        "SELECT * FROM listings WHERE propertyId=? ORDER BY updatedAt DESC,id ASC",
      )
      .all(id)
      .map((value) => listingSchema.parse(value));
    return { property: readProperty(row), listings };
  }

  getListing(id: string): ListingRow {
    const row = this.db
      .prepare(
        `SELECT ${listingProjection} FROM listings l JOIN properties p ON p.id=l.propertyId WHERE l.id=?`,
      )
      .get(id);
    if (!row)
      throw new AppError("NOT_FOUND", "This listing was not found.", 404);
    return readListingRow(row);
  }

  private nextListingReference(): string {
    // The caller already holds BEGIN IMMEDIATE. Bootstrap from existing numeric
    // references once, leaving older UUID-based references and records intact.
    this.db
      .prepare(
        `
      INSERT INTO catalog_sequences(name,value)
      SELECT 'listing',COALESCE(MAX(CAST(substr(reference,5) AS INTEGER)),0)
      FROM listings
      WHERE reference LIKE 'FN-L%' AND length(substr(reference,5))>0
        AND substr(reference,5) NOT GLOB '*[^0-9]*'
      ON CONFLICT(name) DO NOTHING
    `,
      )
      .run();
    const sequence = this.db
      .prepare(
        "UPDATE catalog_sequences SET value=value+1 WHERE name='listing' RETURNING value",
      )
      .get();
    if (
      !sequence ||
      typeof sequence.value !== "number" ||
      !Number.isSafeInteger(sequence.value)
    )
      throw new Error("Invalid listing sequence");
    return `FN-L${String(sequence.value).padStart(3, "0")}`;
  }

  createListing(input: ListingCreate): ListingRow {
    return this.transaction(() => {
      this.getProperty(input.propertyId);
      const id = randomUUID();
      const timestamp = new Date().toISOString();
      this.db
        .prepare("INSERT INTO listings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          this.nextListingReference(),
          input.propertyId,
          input.purpose,
          input.priceMinor,
          input.currency,
          input.title,
          input.description,
          "draft",
          1,
          null,
          null,
          timestamp,
          timestamp,
        );
      return this.getListing(id);
    });
  }

  updateProperty(id: string, input: PropertyUpdate): PropertyDetail {
    return this.transaction(() => {
      const current = this.getProperty(id).property;
      if (current.sourceVersion !== input.sourceVersion)
        throw new AppError(
          "REVISION_CONFLICT",
          "The property changed. Reload it before saving.",
          409,
        );
      const { sourceVersion: _expected, ...fields } = input;
      const updated = propertySchema.parse({ ...current, ...fields });
      if (updated.type === "studio" && updated.beds !== 0) {
        throw new AppError(
          "INVALID_PROPERTY_FACTS",
          "A studio must have zero bedrooms.",
        );
      }
      if (!updated.manualLocation && updated.mapLocation === null)
        throw new AppError(
          "MAP_LOCATION_REQUIRED",
          "Select a map location or enable manual location entry.",
        );
      if (JSON.stringify(updated) === JSON.stringify(current))
        return this.getProperty(id);
      const timestamp = new Date().toISOString();
      this.db
        .prepare(
          "UPDATE properties SET name=?,address=?,city=?,country=?,type=?,beds=?,baths=?,sizeSqm=?,amenities=?,manualLocation=?,mapLocation=?,sourceVersion=sourceVersion+1,updatedAt=? WHERE id=?",
        )
        .run(
          updated.name,
          updated.address,
          updated.city,
          updated.country,
          updated.type,
          updated.beds,
          updated.baths,
          updated.sizeSqm,
          JSON.stringify(updated.amenities),
          updated.manualLocation ? 1 : 0,
          updated.mapLocation === null
            ? null
            : JSON.stringify(updated.mapLocation),
          timestamp,
          id,
        );
      this.db
        .prepare(
          "UPDATE listings SET status=CASE WHEN status='reviewed' THEN 'draft' ELSE status END,reviewedFactsVersion=NULL,reviewedAt=NULL,revision=revision+1,updatedAt=? WHERE propertyId=?",
        )
        .run(timestamp, id);
      return this.getProperty(id);
    });
  }

  updateListing(id: string, input: ListingUpdate): ListingRow {
    return this.transaction(() => {
      const { listing: current, property } = this.getListing(id);
      if (current.revision !== input.revision)
        throw new AppError(
          "REVISION_CONFLICT",
          "The listing changed. Reload it before saving.",
          409,
        );
      const { revision: _expected, status: requestedStatus, ...fields } = input;
      const changed =
        (fields.purpose !== undefined && fields.purpose !== current.purpose) ||
        (fields.priceMinor !== undefined &&
          fields.priceMinor !== current.priceMinor) ||
        (fields.currency !== undefined &&
          fields.currency !== current.currency) ||
        (fields.title !== undefined && fields.title !== current.title) ||
        (fields.description !== undefined &&
          fields.description !== current.description);
      const status = requestedStatus ?? (changed ? "draft" : current.status);
      const base = { ...current, ...fields };
      if (status === "reviewed" && base.description.trim().length < 40)
        throw new AppError(
          "REVIEW_REQUIRES_DESCRIPTION",
          "Write a description of at least 40 characters before marking it reviewed.",
        );
      if (!changed && status === current.status)
        return { listing: current, property };
      const timestamp = new Date().toISOString();
      this.db
        .prepare(
          "UPDATE listings SET purpose=?,priceMinor=?,currency=?,title=?,description=?,status=?,revision=revision+1,reviewedFactsVersion=?,reviewedAt=?,updatedAt=? WHERE id=?",
        )
        .run(
          base.purpose,
          base.priceMinor,
          base.currency,
          base.title,
          base.description,
          status,
          status === "reviewed" ? property.sourceVersion : null,
          status === "reviewed" ? timestamp : null,
          timestamp,
          id,
        );
      return this.getListing(id);
    });
  }

  updatePropertyPhoto(
    id: string,
    sourceVersion: number,
    imagePath: string,
  ): PropertyDetail {
    const filename = imagePath.startsWith("/api/photos/")
      ? imagePath.slice("/api/photos/".length)
      : "";
    if (!photoFilenameSchema.safeParse(filename).success)
      throw new AppError("INVALID_PHOTO", "Use a processed application photo.");
    return this.transaction(() => {
      const current = this.getProperty(id).property;
      if (current.sourceVersion !== sourceVersion)
        throw new AppError(
          "REVISION_CONFLICT",
          "The property changed. Reload it before uploading a photo.",
          409,
        );
      const timestamp = new Date().toISOString();
      this.db
        .prepare(
          "UPDATE properties SET imagePath=?,sourceVersion=sourceVersion+1,updatedAt=? WHERE id=?",
        )
        .run(imagePath, timestamp, id);
      this.db
        .prepare(
          "UPDATE listings SET status=CASE WHEN status='reviewed' THEN 'draft' ELSE status END,reviewedFactsVersion=NULL,reviewedAt=NULL,revision=revision+1,updatedAt=? WHERE propertyId=?",
        )
        .run(timestamp, id);
      return this.getProperty(id);
    });
  }

  readLocationCache(key: string, now: number): LocationSearch | null {
    const row = this.db
      .prepare("SELECT payload FROM location_cache WHERE key=? AND expiresAt>?")
      .get(key, now);
    if (!row || typeof row.payload !== "string") return null;
    try {
      return locationSearchSchema.parse(JSON.parse(row.payload));
    } catch {
      return null;
    }
  }

  writeLocationCache(
    key: string,
    payload: LocationSearch,
    expiresAt: number,
    now: number,
  ) {
    this.transaction(() => {
      this.db.prepare("DELETE FROM location_cache WHERE expiresAt<=?").run(now);
      this.db
        .prepare(
          "INSERT INTO location_cache(key,payload,expiresAt) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,expiresAt=excluded.expiresAt",
        )
        .run(key, JSON.stringify(payload), expiresAt);
      const count = Number(
        this.db.prepare("SELECT COUNT(*) AS total FROM location_cache").get()
          ?.total ?? 0,
      );
      if (count > 256)
        this.db
          .prepare(
            "DELETE FROM location_cache WHERE key IN (SELECT key FROM location_cache ORDER BY expiresAt ASC LIMIT ?)",
          )
          .run(count - 256);
    });
  }

  reserveLocationRequest(now: number): boolean {
    return this.transaction(() => {
      const last = this.db
        .prepare(
          "SELECT value FROM catalog_metadata WHERE key='location_last_request'",
        )
        .get();
      if (last && now - Number(last.value) < 1000) return false;
      this.db
        .prepare(
          "INSERT INTO catalog_metadata(key,value) VALUES('location_last_request',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(String(now));
      return true;
    });
  }
}
