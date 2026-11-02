"use client";

import Link from "next/link";
import { PlusIcon, ArrowRightIcon, XIcon } from "@phosphor-icons/react";
import {
  labels,
  listingStatuses,
  listingPurposes,
  listingSorts,
  listingPageSchema,
  propertyDetailSchema,
  formatPrice,
} from "@/domain/catalog";
import { useResource } from "@/lib/use-resource";
import { useCatalogQuery } from "@/lib/use-catalog-query";
import { AppShell } from "@/components/app-shell";
import {
  ComboBox,
  PageHeading,
  PaginationBar,
  StatusBadge,
} from "@/components/ui";
import {
  ClearFilters,
  formatDate,
  LoadingTable,
  LoadError,
  SearchField,
} from "./catalog-parts";

export function ListingsCatalog() {
  const { params, setQuery, queryString } = useCatalogQuery();
  const propertyId = params.get("propertyId");
  const scope = useResource(
    propertyId ? `/api/properties/${encodeURIComponent(propertyId)}` : null,
    propertyDetailSchema,
  );
  const newListingHref = propertyId
    ? `/listings/new?propertyId=${encodeURIComponent(propertyId)}`
    : "/listings/new";
  const resource = useResource(
    `/api/listings?${queryString}`,
    listingPageSchema,
  );
  const filtered = ["q", "status", "purpose", "propertyId"].some((name) =>
    params.has(name),
  );
  return (
    <AppShell title="Listings">
      <PageHeading
        title="Listings"
        actions={
          <Link href={newListingHref} className="btn btn-primary">
            <PlusIcon size={18} />
            New listing
          </Link>
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <SearchField
          value={params.get("q") ?? ""}
          onChange={(q) => setQuery({ q })}
          placeholder="Search listings or properties"
        />
        <ComboBox
          label="Status"
          value={params.get("status") ?? ""}
          options={[
            { value: "", label: "All statuses" },
            ...listingStatuses.map((value) => ({
              value,
              label: labels.status[value],
            })),
          ]}
          onChange={(status) => setQuery({ status })}
        />
        <ComboBox
          label="Purpose"
          value={params.get("purpose") ?? ""}
          options={[
            { value: "", label: "All purposes" },
            ...listingPurposes.map((value) => ({
              value,
              label: labels.purpose[value],
            })),
          ]}
          onChange={(purpose) => setQuery({ purpose })}
        />
        <ComboBox
          label="Sort"
          value={params.get("sort") ?? "updated-desc"}
          options={listingSorts.map((value) => ({
            value,
            label: labels.listingSort[value],
          }))}
          onChange={(sort) => setQuery({ sort })}
        />
        {propertyId && (
          <button
            className="btn btn-sm"
            aria-label="Clear property filter"
            onClick={() => setQuery({ propertyId: null })}
          >
            {scope.data?.property.name ?? "Selected property"}
            <XIcon size={14} />
          </button>
        )}
        {filtered && (
          <ClearFilters
            onClick={() =>
              setQuery({
                q: null,
                status: null,
                purpose: null,
                propertyId: null,
              })
            }
          />
        )}
      </div>
      {resource.error && (
        <LoadError error={resource.error} retry={resource.refresh} />
      )}
      {resource.loading && !resource.data ? (
        <LoadingTable />
      ) : resource.data?.items.length ? (
        <div
          className="overflow-x-auto rounded-box border border-base-300 bg-base-100"
          aria-busy={resource.loading}
        >
          <table className="table">
            <thead>
              <tr>
                <th>Listing</th>
                <th className="hidden md:table-cell">Property</th>
                <th className="hidden md:table-cell">Purpose</th>
                <th className="hidden sm:table-cell text-right">Price</th>
                <th>Status</th>
                <th className="hidden lg:table-cell">Updated</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {resource.data.items.map(({ listing, property }) => (
                <tr className="hover:bg-base-200/60" key={listing.id}>
                  <td>
                    <Link
                      href={`/listings/${listing.id}`}
                      className="font-medium hover:underline"
                    >
                      {listing.title}
                    </Link>
                    <div className="text-xs text-base-content/60">
                      {listing.reference}
                    </div>
                  </td>
                  <td className="hidden md:table-cell">
                    <Link
                      href={`/properties/${property.id}`}
                      className="link link-hover"
                    >
                      {property.name}
                    </Link>
                    <div className="text-xs text-base-content/60">
                      {property.city}
                    </div>
                  </td>
                  <td className="hidden md:table-cell">
                    {labels.purpose[listing.purpose]}
                  </td>
                  <td className="hidden sm:table-cell whitespace-nowrap text-right text-xs tabular-nums">
                    {formatPrice(listing)}
                  </td>
                  <td>
                    <StatusBadge
                      status={
                        listing.status === "reviewed" ? "success" : "neutral"
                      }
                    >
                      {labels.status[listing.status]}
                    </StatusBadge>
                  </td>
                  <td className="hidden whitespace-nowrap text-xs lg:table-cell">
                    {formatDate(listing.updatedAt)}
                  </td>
                  <td>
                    <Link
                      className="btn btn-ghost btn-sm btn-square"
                      href={`/listings/${listing.id}`}
                      aria-label={`Edit ${listing.title}`}
                    >
                      <ArrowRightIcon size={17} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-box border border-base-300 p-12 text-center">
          <h2 className="font-semibold">No listings found</h2>
          {filtered ? (
            <button
              className="btn mt-4"
              onClick={() =>
                setQuery({
                  q: null,
                  status: null,
                  purpose: null,
                  propertyId: null,
                })
              }
            >
              Clear filters
            </button>
          ) : (
            <Link className="btn mt-4" href={newListingHref}>
              Create listing
            </Link>
          )}
        </div>
      )}
      {resource.data && (
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
