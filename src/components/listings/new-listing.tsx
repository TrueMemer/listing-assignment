"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import {
  listingCreateSchema,
  listingRowSchema,
  propertyDetailSchema,
  propertyPageSchema,
  type Property,
  type PropertyRow,
} from "@/domain/catalog";
import { api } from "@/lib/http";
import { useResource } from "@/lib/use-resource";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { AppShell } from "@/components/app-shell";
import { ComboBox, PageHeading, ConfirmModal, Modal } from "@/components/ui";
import { ListingFields, type ListingForm } from "./listing-fields";
import { PropertyTree } from "@/components/properties/property-tree";
import { SearchField } from "@/components/catalog/catalog-parts";
import { PropertyFacts } from "./property-facts";

export function NewListing() {
  const router = useRouter();
  const params = useSearchParams();
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeSearch, setTreeSearch] = useState("");
  const [selected, setSelected] = useState<Property | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const properties = useResource(
    `/api/properties?pageSize=25&q=${encodeURIComponent(debounced)}`,
    propertyPageSchema,
  );
  const initial = useResource(
    params.get("propertyId")
      ? `/api/properties/${encodeURIComponent(params.get("propertyId") ?? "")}`
      : null,
    propertyDetailSchema,
  );
  const [form, setForm] = useState<ListingForm>({
    title: "",
    description: "",
    purpose: "rent",
    priceMinor: null,
    currency: "GBP",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigation = useUnsavedChanges(
    form.description.length > 0 ||
      form.priceMinor !== null ||
      (!!form.title && form.title !== selected?.name),
  );
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    const data = initial.data;
    if (data) {
      setSelected(data.property);
      setForm((previous) => ({
        ...previous,
        title: previous.title || data.property.name,
      }));
    }
  }, [initial.data]);
  function choose(id: string) {
    const found = properties.data?.items.find((property) => property.id === id);
    if (!found) return;
    selectProperty(found);
  }
  function selectProperty(found: PropertyRow) {
    const { listingCount, ...property } = found;
    setForm((previous) => ({
      ...previous,
      title:
        !previous.title || previous.title === selected?.name
          ? property.name
          : previous.title,
    }));
    setSelected(property);
  }
  async function create() {
    if (!selected || busy) return;
    const parsed = listingCreateSchema.safeParse({
      propertyId: selected.id,
      ...form,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the listing details.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/listings", listingRowSchema, {
        method: "POST",
        body: parsed.data,
      });
      router.replace(`/listings/${result.listing.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create the listing.",
      );
      setBusy(false);
    }
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void create();
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  });
  const options =
    properties.data?.items.map((property) => ({
      value: property.id,
      label: `${property.name} · ${property.city}`,
      keywords: [property.reference, property.address],
    })) ?? [];
  if (selected && !options.some((option) => option.value === selected.id))
    options.unshift({
      value: selected.id,
      label: `${selected.name} · ${selected.city}`,
      keywords: [selected.reference, selected.address],
    });
  return (
    <AppShell title="New listing">
      <Link className="btn btn-ghost btn-sm mb-4" href="/listings">
        <ArrowLeftIcon size={16} />
        Listings
      </Link>
      <PageHeading
        title="New listing"
        actions={
          <button
            className="btn btn-primary hidden sm:inline-flex"
            disabled={!selected || busy || !form.title.trim()}
            onClick={create}
          >
            {busy && <span className="loading loading-spinner loading-xs" />}
            Create listing
          </button>
        }
      />
      {(error || initial.error || properties.error) && (
        <div role="alert" className="alert alert-error mb-5">
          {error || initial.error || properties.error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-6 rounded-box border border-base-300 p-5 md:p-6">
          <ComboBox
            className="w-full"
            label="Property"
            value={selected?.id ?? ""}
            placeholder="Select a property"
            options={options}
            onChange={choose}
            onSearchChange={setSearch}
            loading={properties.loading}
            disabled={busy}
            emptyLabel="No matching properties"
          />
          <button
            className="btn"
            type="button"
            onClick={() => setTreeOpen(true)}
            disabled={busy}
          >
            Browse tree
          </button>
          <ListingFields form={form} onChange={setForm} disabled={busy} />
          <button
            className="btn btn-primary w-full sm:hidden"
            disabled={!selected || busy || !form.title.trim()}
            onClick={create}
          >
            Create listing
          </button>
        </section>
        {selected && (
          <aside>
            <PropertyFacts property={selected} />
          </aside>
        )}
      </div>
      <Modal
        open={treeOpen}
        onOpenChange={setTreeOpen}
        title="Select property"
        className="max-w-3xl"
      >
        <div className="mb-4">
          <SearchField
            value={treeSearch}
            onChange={setTreeSearch}
            placeholder="Search properties or addresses"
          />
        </div>
        <div className="max-h-[60dvh] overflow-auto">
          <PropertyTree
            query={new URLSearchParams({ q: treeSearch }).toString()}
            selectedId={selected?.id}
            onSelect={(property) => {
              selectProperty(property);
              setTreeOpen(false);
            }}
          />
        </div>
      </Modal>
      <ConfirmModal
        open={navigation.leaveOpen}
        onOpenChange={(open) => {
          if (!open) navigation.cancelLeave();
        }}
        title="Discard changes"
        description="Leave without creating this listing?"
        confirmLabel="Discard changes"
        onConfirm={navigation.confirmLeave}
      />
    </AppShell>
  );
}
