"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

import { z } from "zod";
import { ArrowLeftIcon, PlusIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import {
  amenityValues,
  cities,
  citySchema,
  propertyTreeSchema,
  labels,
  propertyTypes,
  propertyDetailSchema,
  propertyUpdateSchema,
  formatPrice,
  type Property,
} from "@/domain/catalog";
import { api, ApiError } from "@/lib/http";
import { useResource } from "@/lib/use-resource";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { AppShell } from "@/components/app-shell";
import {
  ComboBox,
  ConfirmModal,
  NumberField,
  PageHeading,
  StatusBadge,
} from "@/components/ui";
import { PhotoUpload } from "./photo-upload";
import { LocationInput } from "./location-input";
import { LoadError, LoadingTable } from "@/components/catalog/catalog-parts";

type PhysicalForm = Pick<
  Property,
  | "name"
  | "address"
  | "city"
  | "type"
  | "amenities"
  | "manualLocation"
  | "mapLocation"
> & { beds: number | null; baths: number | null; sizeSqm: number | null };
function formFor(property: Property): PhysicalForm {
  return {
    name: property.name,
    address: property.address,
    city: property.city,
    type: property.type,
    beds: property.beds,
    baths: property.baths,
    sizeSqm: property.sizeSqm,
    amenities: [...property.amenities],
    manualLocation: property.manualLocation,
    mapLocation: property.mapLocation,
  };
}

export function PropertyDetailPage({ id }: { id: string }) {
  const resource = useResource(`/api/properties/${id}`, propertyDetailSchema);
  const cityMetadata = useResource("/api/properties/tree", propertyTreeSchema);
  const keepForm = useRef(false);
  const [form, setForm] = useState<PhysicalForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reload, setReload] = useState(false);
  useEffect(() => {
    if (resource.data) {
      if (keepForm.current) {
        keepForm.current = false;
        return;
      }
      setForm(formFor(resource.data.property));
      setConflict(false);
    }
  }, [resource.data]);
  const property = resource.data?.property;
  const dirty =
    !!property &&
    !!form &&
    JSON.stringify(form) !== JSON.stringify(formFor(property));
  const navigation = useUnsavedChanges(dirty);
  const locationValid =
    !form || form.manualLocation || form.mapLocation !== null;
  async function save() {
    if (
      !form ||
      !property ||
      busy ||
      photoBusy ||
      conflict ||
      !dirty ||
      !locationValid
    )
      return;
    const parsed = propertyUpdateSchema.safeParse({
      ...form,
      sourceVersion: property.sourceVersion,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Check the property details.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api(`/api/properties/${id}`, propertyDetailSchema, {
        method: "PATCH",
        body: parsed.data,
      });
      resource.setData(result);
      setMessage("Saved.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the property.",
      );
      if (cause instanceof ApiError && cause.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !conflict) void save();
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  });
  return (
    <AppShell title="Property">
      {resource.error && (
        <LoadError error={resource.error} retry={resource.refresh} />
      )}
      {!property || !form ? (
        resource.loading ? (
          <LoadingTable />
        ) : null
      ) : (
        <>
          <Link className="btn btn-ghost btn-sm mb-4" href="/properties">
            <ArrowLeftIcon size={16} />
            Properties
          </Link>
          <PageHeading
            title={property.name}
            actions={
              <>
                <Link
                  className="btn"
                  href={`/listings/new?propertyId=${property.id}`}
                >
                  <PlusIcon size={16} />
                  New listing
                </Link>
                <button
                  className="btn btn-primary hidden sm:inline-flex"
                  disabled={
                    !dirty || busy || photoBusy || conflict || !locationValid
                  }
                  onClick={save}
                >
                  {busy ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <FloppyDiskIcon size={16} />
                  )}
                  Save
                </button>
              </>
            }
          />
          <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-base-content/60">
            <span>{property.reference}</span>
            {dirty && <StatusBadge>Unsaved changes</StatusBadge>}
          </div>
          {error && (
            <div role="alert" className="alert alert-error mb-5">
              <span>{error}</span>
              {conflict && (
                <button className="btn btn-sm" onClick={() => setReload(true)}>
                  Reload
                </button>
              )}
            </div>
          )}
          {message && (
            <p role="status" className="mb-5 text-sm">
              {message}
            </p>
          )}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-box border border-base-300 p-5 md:p-6">
              <h2 className="mb-5 font-semibold">Property details</h2>
              <div className="space-y-5">
                <div>
                  <label
                    className="mb-2 block text-sm font-medium"
                    htmlFor="property-name"
                  >
                    Name
                  </label>
                  <input
                    className="input w-full"
                    id="property-name"
                    value={form.name}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <LocationInput
                  manual={form.manualLocation}
                  mapLocation={form.mapLocation}
                  address={form.address}
                  city={form.city}
                  onChange={(next) => setForm({ ...form, ...next })}
                />
                <div>
                  <label
                    className="mb-2 block text-sm font-medium"
                    htmlFor="property-address"
                  >
                    Address
                  </label>
                  <input
                    className="input w-full"
                    id="property-address"
                    readOnly={!form.manualLocation}
                    value={form.address}
                    maxLength={160}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ComboBox
                    label="City"
                    value={form.city}
                    options={[
                      ...new Set([
                        form.city,
                        ...cities,
                        ...(cityMetadata.data?.groups.map(
                          (group) => group.city,
                        ) ?? []),
                      ]),
                    ].map((value) => ({ value, label: value }))}
                    allowCustomValue={(value) =>
                      citySchema.safeParse(value).success
                    }
                    disabled={!form.manualLocation}
                    onChange={(value) =>
                      setForm({ ...form, city: citySchema.parse(value) })
                    }
                  />
                  <ComboBox
                    label="Property type"
                    value={form.type}
                    options={propertyTypes.map((value) => ({
                      value,
                      label: labels.propertyType[value],
                    }))}
                    onChange={(value) => {
                      const type = z.enum(propertyTypes).parse(value);
                      setForm({
                        ...form,
                        type,
                        ...(type === "studio" ? { beds: 0 } : {}),
                      });
                    }}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <NumberField
                    id="property-beds"
                    label="Bedrooms"
                    min={0}
                    max={10}
                    value={form.beds}
                    required
                    disabled={form.type === "studio"}
                    onChange={(beds) => setForm({ ...form, beds })}
                  />
                  <NumberField
                    id="property-baths"
                    label="Bathrooms"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={form.baths}
                    required
                    onChange={(baths) => setForm({ ...form, baths })}
                  />
                  <NumberField
                    id="property-area"
                    label="Floor area"
                    suffix="m²"
                    min={10}
                    max={1000}
                    step={0.5}
                    value={form.sizeSqm}
                    required
                    onChange={(sizeSqm) => setForm({ ...form, sizeSqm })}
                  />
                </div>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Amenities</legend>
                  <div className="flex flex-wrap gap-2">
                    {amenityValues.map((amenity) => (
                      <button
                        key={amenity}
                        type="button"
                        className={`btn btn-sm capitalize ${form.amenities.includes(amenity) ? "btn-active" : "btn-outline"}`}
                        aria-pressed={form.amenities.includes(amenity)}
                        onClick={() =>
                          setForm({
                            ...form,
                            amenities: form.amenities.includes(amenity)
                              ? form.amenities.filter((a) => a !== amenity)
                              : [...form.amenities, amenity],
                          })
                        }
                      >
                        {amenity}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <button
                  className="btn btn-primary w-full sm:hidden"
                  disabled={
                    !dirty || busy || photoBusy || conflict || !locationValid
                  }
                  onClick={save}
                >
                  Save property
                </button>
              </div>
            </section>
            <aside>
              <PhotoUpload
                disabled={busy || conflict}
                onPendingChange={setPhotoBusy}
                property={property}
                onUploaded={(detail) => {
                  keepForm.current = true;
                  resource.setData(detail);
                  setMessage("Photo uploaded.");
                }}
                onConflict={() => {
                  setConflict(true);
                  setError(
                    "The property changed. Reload before uploading a photo.",
                  );
                }}
              />
            </aside>
          </div>
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Listings</h2>
              <Link
                className="link link-hover text-sm"
                href={`/listings?propertyId=${property.id}`}
              >
                View all
              </Link>
            </div>
            {resource.data?.listings.length ? (
              <div className="overflow-x-auto rounded-box border border-base-300">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Purpose</th>
                      <th className="text-right">Price</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.data.listings.map((listing) => (
                      <tr key={listing.id}>
                        <td>
                          <Link
                            className="link link-hover font-medium"
                            href={`/listings/${listing.id}`}
                          >
                            {listing.title}
                          </Link>
                        </td>
                        <td>{labels.purpose[listing.purpose]}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {formatPrice(listing)}
                        </td>
                        <td>
                          <StatusBadge
                            status={
                              listing.status === "reviewed"
                                ? "success"
                                : "neutral"
                            }
                          >
                            {labels.status[listing.status]}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-box border border-base-300 p-6 text-sm text-base-content/70">
                No listings for this property.
              </p>
            )}
          </section>
          <ConfirmModal
            open={reload}
            onOpenChange={setReload}
            title="Reload property"
            description="Discard unsaved changes and load the current server revision?"
            confirmLabel="Reload"
            onConfirm={() => {
              resource.refresh();
              setReload(false);
              setError("");
            }}
          />
          <ConfirmModal
            open={navigation.leaveOpen}
            onOpenChange={(open) => {
              if (!open) navigation.cancelLeave();
            }}
            title="Discard changes"
            description="Leave without saving your changes?"
            confirmLabel="Discard changes"
            onConfirm={navigation.confirmLeave}
          />
        </>
      )}
    </AppShell>
  );
}
