"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  GridFourIcon,
  TableIcon,
  TreeStructureIcon,
  SortAscendingIcon,
} from "@phosphor-icons/react";
import {
  cities,
  labels,
  propertyPageSchema,
  propertyTreeSchema,
  propertySorts,
  propertyTypes,
  type PropertyRow,
} from "@/domain/catalog";
import { BedroomsFilter } from "@/components/ui/bedrooms-filter";
import { PropertyTree } from "@/components/properties/property-tree";
import { useResource } from "@/lib/use-resource";
import { useCatalogQuery } from "@/lib/use-catalog-query";
import { AppShell } from "@/components/app-shell";
import { ComboBox, PageHeading, PaginationBar } from "@/components/ui";
import {
  ClearFilters,
  formatDate,
  LoadingTable,
  LoadError,
  SearchField,
} from "./catalog-parts";

export function PropertiesCatalog() {
  const { params, setQuery, queryString } = useCatalogQuery();
  const cityMetadata = useResource("/api/properties/tree", propertyTreeSchema);
  const tree = params.get("view") === "tree";
  const resource = useResource(
    `/api/properties?${queryString}`,
    propertyPageSchema,
  );
  const cards = params.get("view") === "cards";
  const filtered = ["q", "city", "type", "minBeds"].some((name) =>
    params.has(name),
  );
  const rows = resource.data?.items ?? [];
  return (
    <AppShell title="Properties">
      <PageHeading
        title="Properties"
        actions={
          <div className="join" aria-label="View">
            <button
              className={`btn join-item ${!cards && !tree ? "btn-active" : ""}`}
              aria-label="Table view"
              aria-pressed={!cards && !tree}
              onClick={() => setQuery({ view: null }, true)}
            >
              <TableIcon size={18} />
            </button>
            <button
              className={`btn join-item ${cards ? "btn-active" : ""}`}
              aria-label="Card view"
              aria-pressed={cards}
              onClick={() => setQuery({ view: "cards" }, true)}
            >
              <GridFourIcon size={18} />
            </button>
            <button
              className={`btn join-item ${tree ? "btn-active" : ""}`}
              aria-label="Tree view"
              aria-pressed={tree}
              onClick={() => setQuery({ view: "tree" }, true)}
            >
              <TreeStructureIcon size={18} />
            </button>
          </div>
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <SearchField
          value={params.get("q") ?? ""}
          onChange={(q) => setQuery({ q })}
          placeholder="Search properties or addresses"
        />
        <ComboBox
          label="City"
          value={params.get("city") ?? ""}
          options={[
            { value: "", label: "All cities" },
            ...[
              ...new Set([
                ...cities,
                ...(cityMetadata.data?.groups.map((group) => group.city) ?? []),
              ]),
            ].map((value) => ({ value, label: value })),
          ]}
          onChange={(city) => setQuery({ city })}
        />
        <ComboBox
          label="Type"
          value={params.get("type") ?? ""}
          options={[
            { value: "", label: "All types" },
            ...propertyTypes.map((value) => ({
              value,
              label: labels.propertyType[value],
            })),
          ]}
          onChange={(type) => setQuery({ type })}
        />
        <BedroomsFilter
          value={params.get("minBeds") ?? ""}
          onChange={(minBeds) => setQuery({ minBeds })}
        />
        {!tree && (
          <ComboBox
            label="Sort"
            value={params.get("sort") ?? "name-asc"}
            options={propertySorts.map((value) => ({
              value,
              label: labels.propertySort[value],
            }))}
            onChange={(sort) => setQuery({ sort })}
          />
        )}
        {filtered && (
          <ClearFilters
            onClick={() =>
              setQuery({ q: null, city: null, type: null, minBeds: null })
            }
          />
        )}
      </div>
      {resource.error && (
        <LoadError error={resource.error} retry={resource.refresh} />
      )}
      <div aria-busy={resource.loading}>
        {tree ? (
          <PropertyTree query={queryString} />
        ) : resource.loading && !resource.data ? (
          <LoadingTable />
        ) : rows.length === 0 ? (
          <div className="rounded-box border border-base-300 p-12 text-center">
            <h2 className="font-semibold">No properties found</h2>
            {filtered && (
              <button
                className="btn mt-4"
                onClick={() =>
                  setQuery({ q: null, city: null, type: null, minBeds: null })
                }
              >
                Clear filters
              </button>
            )}
          </div>
        ) : cards ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <button
                      className="flex items-center gap-2"
                      onClick={() => setQuery({ sort: "name-asc" })}
                    >
                      Property
                      <SortAscendingIcon size={14} />
                    </button>
                  </th>
                  <th>Location</th>
                  <th className="hidden md:table-cell">Type</th>
                  <th className="hidden md:table-cell text-right">Beds</th>
                  <th className="hidden lg:table-cell text-right">Baths</th>
                  <th className="hidden sm:table-cell text-right">
                    <button
                      onClick={() =>
                        setQuery({
                          sort:
                            params.get("sort") === "area-asc"
                              ? "area-desc"
                              : "area-asc",
                        })
                      }
                    >
                      Area m²
                    </button>
                  </th>
                  <th className="hidden md:table-cell text-right">Listings</th>
                  <th className="hidden xl:table-cell">Updated</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((property) => (
                  <tr className="hover:bg-base-200/60" key={property.id}>
                    <td>
                      <Link
                        className="font-medium hover:underline"
                        href={`/properties/${property.id}`}
                      >
                        {property.name}
                      </Link>
                      <div className="text-xs text-base-content/60">
                        {property.reference}
                      </div>
                      <PropertyListingsLink
                        property={property}
                        className="text-xs md:hidden"
                      />
                    </td>
                    <td>
                      {property.city}
                      <div className="hidden max-w-52 truncate text-xs text-base-content/60 lg:block">
                        {property.address}
                      </div>
                    </td>
                    <td className="hidden md:table-cell">
                      <span className="badge badge-ghost badge-sm">
                        {labels.propertyType[property.type]}
                      </span>
                    </td>
                    <td className="hidden md:table-cell text-right tabular-nums">
                      {property.beds}
                    </td>
                    <td className="hidden lg:table-cell text-right tabular-nums">
                      {property.baths}
                    </td>
                    <td className="hidden sm:table-cell text-right tabular-nums">
                      {property.sizeSqm}
                    </td>
                    <td className="hidden md:table-cell text-right">
                      <PropertyListingsLink
                        property={property}
                        compact
                        className="min-w-8 justify-end"
                      />
                    </td>
                    <td className="hidden whitespace-nowrap text-xs xl:table-cell">
                      {formatDate(property.updatedAt)}
                    </td>
                    <td>
                      <Link
                        href={`/properties/${property.id}`}
                        className="btn btn-ghost btn-sm btn-square"
                        aria-label={`Open ${property.name}`}
                      >
                        <ArrowRightIcon size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {resource.data && !tree && (
        <PaginationBar
          page={resource.data.page}
          pageSize={resource.data.pageSize}
          total={resource.data.total}
          onPageChange={(page) => setQuery({ page }, true)}
          onPageSizeChange={(pageSize) => setQuery({ pageSize })}
        />
      )}
    </AppShell>
  );
}
function PropertyCard({ property }: { property: PropertyRow }) {
  return (
    <article className="card card-border overflow-hidden bg-base-100">
      <Link
        href={`/properties/${property.id}`}
        tabIndex={-1}
        aria-hidden="true"
        className="relative block aspect-[1.65]"
      >
        <Image
          src={property.imagePath}
          alt=""
          fill
          sizes="(max-width:767px)100vw,33vw"
          className="object-cover"
        />
      </Link>
      <div className="card-body gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="card-title text-base">
            <Link
              href={`/properties/${property.id}`}
              className="hover:underline"
            >
              {property.name}
            </Link>
          </h2>
          <span className="badge badge-ghost badge-sm">
            {labels.propertyType[property.type]}
          </span>
        </div>
        <p className="text-sm text-base-content/70">{property.city}</p>
        <div className="flex gap-5 text-sm tabular-nums">
          <span>
            {property.beds === 0
              ? "Studio"
              : `${property.beds} ${property.beds === 1 ? "bed" : "beds"}`}
          </span>
          <span>
            {property.baths} {property.baths === 1 ? "bath" : "baths"}
          </span>
          <span>{property.sizeSqm} m²</span>
        </div>
        <div className="card-actions mt-2 items-center justify-between border-t border-base-300 pt-3">
          <span className="text-xs text-base-content/60">
            {property.reference}
          </span>
          <PropertyListingsLink property={property} className="text-sm" />
          <Link
            className="btn btn-ghost btn-sm"
            href={`/properties/${property.id}`}
          >
            Open
            <ArrowRightIcon size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function PropertyListingsLink({
  property,
  compact = false,
  className = "",
}: {
  property: PropertyRow;
  compact?: boolean;
  className?: string;
}) {
  const noun = property.listingCount === 1 ? "listing" : "listings";
  return (
    <Link
      className={`link inline-flex min-h-10 items-center underline underline-offset-4 tabular-nums ${className}`}
      href={`/listings?propertyId=${property.id}`}
      aria-label={`View ${property.listingCount} ${noun} for ${property.name}`}
    >
      {property.listingCount}
      {!compact && ` ${noun}`}
    </Link>
  );
}
