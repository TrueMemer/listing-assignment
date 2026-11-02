import Link from "next/link";
import { labels, type Property } from "@/domain/catalog";

export function PropertyFacts({ property }: { property: Property }) {
  return (
    <section className="rounded-box border border-base-300 p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Property</h2>
        <Link
          href={`/properties/${property.id}`}
          className="link link-hover text-sm"
        >
          Open
        </Link>
      </div>
      <Link
        href={`/properties/${property.id}`}
        className="font-medium hover:underline"
      >
        {property.name}
      </Link>
      <p className="mt-1 text-sm text-base-content/70">
        {property.address}, {property.city}
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
        <div>
          <dt className="text-base-content/60">Type</dt>
          <dd className="mt-1">{labels.propertyType[property.type]}</dd>
        </div>
        <div>
          <dt className="text-base-content/60">Area</dt>
          <dd className="mt-1 tabular-nums">{property.sizeSqm} m²</dd>
        </div>
        <div>
          <dt className="text-base-content/60">Bedrooms</dt>
          <dd className="mt-1 tabular-nums">{property.beds}</dd>
        </div>
        <div>
          <dt className="text-base-content/60">Bathrooms</dt>
          <dd className="mt-1 tabular-nums">{property.baths}</dd>
        </div>
      </dl>
      {property.amenities.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {property.amenities.map((amenity) => (
            <span
              className="badge badge-ghost badge-sm capitalize"
              key={amenity}
            >
              {amenity}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
