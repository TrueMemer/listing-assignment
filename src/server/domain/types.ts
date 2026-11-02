import type { Amenity } from "../../domain/catalog";
export type { Amenity, Property } from "../../domain/catalog";

/** The model receives this allowlist, never a full Property or Listing record. */
export interface PropertyDetails {
  location: string;
  beds: number;
  baths: number;
  sizeSqm: number;
  amenities: Amenity[];
}

export interface Draft {
  description: string;
}
