import { z } from "zod";

export const pageSizes = [10, 25, 50] as const;
export const propertyTypes = ["apartment", "house", "studio"] as const;
export const cities = [
  "London",
  "Bristol",
  "Manchester",
  "Leeds",
  "Edinburgh",
  "Birmingham",
] as const;
export const citySchema = z.string().trim().min(2).max(80);
export const amenityValues = [
  "balcony",
  "lift",
  "storage",
  "garden",
  "parking",
  "furnished",
] as const;
export const listingPurposes = ["rent", "sale"] as const;
export const listingStatuses = ["draft", "reviewed", "archived"] as const;
export const currencies = ["GBP", "EUR", "USD"] as const;
export const propertySorts = [
  "name-asc",
  "updated-desc",
  "area-asc",
  "area-desc",
] as const;
export const listingSorts = [
  "updated-desc",
  "title-asc",
  "price-asc",
  "price-desc",
] as const;

export function isApprovedMapUrl(
  value: string,
  source: "openstreetmap" | "google-maps",
): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return false;
    if (source === "openstreetmap")
      return ["openstreetmap.org", "www.openstreetmap.org"].includes(
        url.hostname,
      );
    if (
      ["maps.google.com", "maps.google.co.uk", "maps.app.goo.gl"].includes(
        url.hostname,
      )
    )
      return true;
    if (url.hostname === "goo.gl") return url.pathname.startsWith("/maps/");
    return (
      [
        "google.com",
        "www.google.com",
        "google.co.uk",
        "www.google.co.uk",
      ].includes(url.hostname) &&
      (url.pathname === "/maps" || url.pathname.startsWith("/maps/"))
    );
  } catch {
    return false;
  }
}
export const mapLocationSchema = z
  .object({
    source: z.enum(["openstreetmap", "google-maps"]),
    label: z.string().trim().min(1).max(240),
    url: z.string().max(2048),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  })
  .strict()
  .refine(
    (value) => isApprovedMapUrl(value.url, value.source),
    "Use an official OpenStreetMap or Google Maps HTTPS link.",
  )
  .refine(
    (value) => (value.latitude === null) === (value.longitude === null),
    "Provide both coordinates or leave both unset.",
  );
export type MapLocation = z.infer<typeof mapLocationSchema>;
export const photoFilenameSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/,
  );

export const propertyFieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    address: z.string().trim().min(2).max(160),
    city: citySchema,
    country: z.literal("GB"),
    type: z.enum(propertyTypes),
    beds: z.number().int().min(0).max(10),
    baths: z.number().min(0.5).max(10).multipleOf(0.5),
    sizeSqm: z.number().min(10).max(1000),
    amenities: z
      .array(z.enum(amenityValues))
      .max(6)
      .refine((a) => new Set(a).size === a.length, "Choose each amenity once."),
    manualLocation: z.boolean().default(true),
    mapLocation: mapLocationSchema.nullable().default(null),
  })
  .strict();

export const propertySchema = propertyFieldsSchema
  .extend({
    id: z.string().min(1),
    reference: z.string().min(1),
    imagePath: z
      .string()
      .refine(
        (value) =>
          value.startsWith("/images/") ||
          (value.startsWith("/api/photos/") &&
            photoFilenameSchema.safeParse(value.slice("/api/photos/".length))
              .success),
        "Use an application property photo.",
      ),
    sourceVersion: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const propertyUpdateSchema = propertyFieldsSchema
  .omit({ manualLocation: true, mapLocation: true })
  .partial()
  .extend({
    sourceVersion: z.number().int().positive(),
    manualLocation: z.boolean().optional(),
    mapLocation: mapLocationSchema.nullable().optional(),
  })
  .strict();

const listingFields = {
  propertyId: z.string().min(1),
  purpose: z.enum(listingPurposes),
  priceMinor: z.number().int().min(0).max(100_000_000_000).nullable(),
  currency: z.enum(currencies),
  title: z.string().trim().min(1).max(160),
  description: z
    .string()
    .max(5000)
    .refine(
      (value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value),
      "Remove control characters.",
    ),
};
const listingBaseSchema = z.object({
  ...listingFields,
  id: z.string().min(1),
  reference: z.string().min(1),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const listingSchema = z.discriminatedUnion("status", [
  listingBaseSchema
    .extend({
      status: z.literal("draft"),
      reviewedFactsVersion: z.null(),
      reviewedAt: z.null(),
    })
    .strict(),
  listingBaseSchema
    .extend({
      status: z.literal("reviewed"),
      reviewedFactsVersion: z.number().int().positive(),
      reviewedAt: z.iso.datetime(),
    })
    .strict(),
  listingBaseSchema
    .extend({
      status: z.literal("archived"),
      reviewedFactsVersion: z.null(),
      reviewedAt: z.null(),
    })
    .strict(),
]);
export const listingCreateSchema = z.object(listingFields).strict();
export const listingUpdateSchema = z
  .object({
    ...listingFields,
    status: z.enum(listingStatuses),
  })
  .omit({ propertyId: true })
  .partial()
  .extend({ revision: z.number().int().positive() })
  .strict();

const pageSize = z.coerce
  .number()
  .refine(
    (value) => pageSizes.some((size) => size === value),
    "Page size must be 10, 25 or 50.",
  )
  .default(10);
const queryFields = {
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize,
  q: z.string().trim().max(100).default(""),
};
export const propertyQuerySchema = z
  .object({
    ...queryFields,
    city: citySchema.optional(),
    type: z.enum(propertyTypes).optional(),
    minBeds: z.coerce.number().int().min(0).max(10).optional(),
    sort: z.enum(propertySorts).default("name-asc"),
  })
  .strict();
export const listingQuerySchema = z
  .object({
    ...queryFields,
    status: z.enum(listingStatuses).optional(),
    purpose: z.enum(listingPurposes).optional(),
    propertyId: z.string().min(1).optional(),
    sort: z.enum(listingSorts).default("updated-desc"),
  })
  .strict();

export type Property = z.infer<typeof propertySchema>;
export type PropertyType = Property["type"];
export type City = Property["city"];
export type Amenity = Property["amenities"][number];
export type Listing = z.infer<typeof listingSchema>;
export type ListingStatus = Listing["status"];
export type ListingPurpose = Listing["purpose"];
export type Currency = Listing["currency"];
export type PropertyUpdate = z.infer<typeof propertyUpdateSchema>;
export type ListingCreate = z.infer<typeof listingCreateSchema>;
export type ListingUpdate = z.infer<typeof listingUpdateSchema>;
export type PropertyQuery = z.infer<typeof propertyQuerySchema>;
export type ListingQuery = z.infer<typeof listingQuerySchema>;

export const propertyTreeQuerySchema = propertyQuerySchema.omit({
  page: true,
  pageSize: true,
  sort: true,
});
export type PropertyTreeQuery = z.infer<typeof propertyTreeQuerySchema>;
export const propertyTreeSchema = z
  .object({
    groups: z.array(
      z
        .object({
          country: z.literal("GB"),
          city: citySchema,
          total: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type PropertyTree = z.infer<typeof propertyTreeSchema>;
export const locationSearchQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .refine(
        (value) => !/[\u0000-\u001F\u007F@]/u.test(value),
        "Search for a public place or address only.",
      ),
  })
  .strict();
export const locationSearchSchema = z
  .object({
    results: z.array(
      z
        .object({
          id: z.string(),
          label: z.string(),
          address: z.string(),
          city: citySchema,
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          url: z
            .string()
            .refine((value) => isApprovedMapUrl(value, "openstreetmap")),
        })
        .strict(),
    ),
    attribution: z.literal("© OpenStreetMap contributors"),
    attributionUrl: z.literal("https://www.openstreetmap.org/copyright"),
  })
  .strict();
export type LocationSearch = z.infer<typeof locationSearchSchema>;
export type LocationResult = LocationSearch["results"][number];

export const propertyRowSchema = propertySchema.extend({
  listingCount: z.number().int().nonnegative(),
});
export type PropertyRow = z.infer<typeof propertyRowSchema>;
export const listingRowSchema = z
  .object({ listing: listingSchema, property: propertySchema })
  .strict();
export type ListingRow = z.infer<typeof listingRowSchema>;
export const propertyDetailSchema = z
  .object({ property: propertySchema, listings: z.array(listingSchema) })
  .strict();
export type PropertyDetail = z.infer<typeof propertyDetailSchema>;

export function pageSchema<T extends z.ZodType>(item: T) {
  return z
    .object({
      items: z.array(item),
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      pageCount: z.number().int().nonnegative(),
    })
    .strict();
}
export const propertyPageSchema = pageSchema(propertyRowSchema);
export const listingPageSchema = pageSchema(listingRowSchema);
export type PropertyPage = z.infer<typeof propertyPageSchema>;
export type ListingPage = z.infer<typeof listingPageSchema>;
export const generationProposalSchema = z
  .object({
    draft: z.object({ description: z.string() }),
    baseRevision: z.number().int().positive(),
    baseFactsVersion: z.number().int().positive(),
    model: z.string(),
    elapsedMs: z.number().nonnegative(),
    requestId: z.string(),
  })
  .strict();
export type GenerationProposal = z.infer<typeof generationProposalSchema>;

export const labels = {
  propertyType: { apartment: "Apartment", house: "House", studio: "Studio" },
  purpose: { rent: "To rent", sale: "For sale" },
  status: { draft: "Draft", reviewed: "Reviewed", archived: "Archived" },
  currency: {
    GBP: "GBP · Pound sterling",
    EUR: "EUR · Euro",
    USD: "USD · US dollar",
  },
  propertySort: {
    "name-asc": "Name",
    "updated-desc": "Recently updated",
    "area-asc": "Area, low to high",
    "area-desc": "Area, high to low",
  },
  listingSort: {
    "updated-desc": "Recently updated",
    "title-asc": "Title",
    "price-asc": "Price, low to high",
    "price-desc": "Price, high to low",
  },
} satisfies Record<string, Record<string, string>>;

export function formatPrice(
  listing: Pick<Listing, "priceMinor" | "currency" | "purpose">,
) {
  if (listing.priceMinor === null) return "Not set";
  return `${new Intl.NumberFormat("en-GB", { style: "currency", currency: listing.currency, maximumFractionDigits: listing.priceMinor % 100 === 0 ? 0 : 2 }).format(listing.priceMinor / 100)}${listing.purpose === "rent" ? " / month" : ""}`;
}
