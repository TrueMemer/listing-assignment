"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CopyIcon,
  FloppyDiskIcon,
  CheckIcon,
  ArchiveIcon,
} from "@phosphor-icons/react";
import {
  generationProposalSchema,
  labels,
  listingRowSchema,
  type GenerationProposal,
  type ListingRow,
} from "@/domain/catalog";
import { api, ApiError } from "@/lib/http";
import { useResource } from "@/lib/use-resource";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { AppShell } from "@/components/app-shell";
import { ConfirmModal, PageHeading, StatusBadge } from "@/components/ui";
import { LoadError, LoadingTable } from "@/components/catalog/catalog-parts";
import { ListingFields, formFor, type ListingForm } from "./listing-fields";
import { PropertyFacts } from "./property-facts";
import { AiAssistance } from "./ai-assistance";

export function ListingEditor({ id }: { id: string }) {
  const resource = useResource(`/api/listings/${id}`, listingRowSchema);
  const [form, setForm] = useState<ListingForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirm, setConfirm] = useState<
    "review" | "archive" | "replace" | "reload" | null
  >(null);
  const [suggestion, setSuggestion] = useState<GenerationProposal | null>(null);
  const row = resource.data;
  useEffect(() => {
    if (resource.data) {
      setForm(formFor(resource.data.listing));
      setConflict(false);
    }
  }, [resource.data]);
  const dirty =
    !!row &&
    !!form &&
    JSON.stringify(form) !== JSON.stringify(formFor(row.listing));
  const navigation = useUnsavedChanges(dirty);
  function edit(next: ListingForm) {
    setForm(next);
    setMessage("");
  }
  async function save(status?: "draft" | "reviewed" | "archived") {
    if (!row || !form || busy || conflict) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await api(`/api/listings/${id}`, listingRowSchema, {
        method: "PATCH",
        body: {
          revision: row.listing.revision,
          ...form,
          ...(status ? { status } : {}),
        },
      });
      resource.setData(next);
      setForm(formFor(next.listing));
      setMessage(
        status === "reviewed"
          ? "Listing reviewed."
          : status === "archived"
            ? "Listing archived."
            : "Saved.",
      );
      setConfirm(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the listing.",
      );
      setConfirm(null);
      if (cause instanceof ApiError && cause.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey)
        return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty) void save();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (
          form &&
          form.description.trim().length >= 40 &&
          row?.listing.status !== "archived"
        )
          setConfirm("review");
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  });
  async function copy() {
    if (!row || dirty || row.listing.status !== "reviewed") return;
    try {
      const current = await api(`/api/listings/${id}`, listingRowSchema);
      if (
        current.listing.revision !== row.listing.revision ||
        current.listing.status !== "reviewed" ||
        current.listing.reviewedFactsVersion !== current.property.sourceVersion
      ) {
        setConflict(true);
        setError("The listing or property changed. Reload before copying.");
        return;
      }
      await navigator.clipboard.writeText(current.listing.description);
      setMessage("Description copied.");
    } catch {
      setError(
        "Could not copy. Select the description and copy it manually after checking the current revision.",
      );
    }
  }
  function applyProposal(proposal: GenerationProposal) {
    if (!row || !form) return;
    if (
      proposal.baseRevision !== row.listing.revision ||
      proposal.baseFactsVersion !== row.property.sourceVersion
    ) {
      setError("The listing changed. Request a new suggestion.");
      return;
    }
    if (form.description.trim()) {
      setSuggestion(proposal);
      setConfirm("replace");
    } else {
      edit({ ...form, description: proposal.draft.description });
      setMessage("Suggestion applied. Save when ready.");
    }
  }
  return (
    <AppShell title="Listing">
      {resource.error && (
        <LoadError error={resource.error} retry={resource.refresh} />
      )}
      {!row || !form ? (
        resource.loading ? (
          <LoadingTable />
        ) : null
      ) : (
        <>
          <Link href="/listings" className="btn btn-ghost btn-sm mb-4">
            <ArrowLeftIcon size={16} />
            Listings
          </Link>
          <PageHeading
            title={row.listing.title}
            actions={
              <div className="hidden flex-wrap gap-2 sm:flex">
                <button
                  className="btn"
                  disabled={
                    busy ||
                    conflict ||
                    dirty ||
                    row.listing.status !== "reviewed"
                  }
                  onClick={copy}
                >
                  <CopyIcon size={17} />
                  Copy
                </button>
                <button
                  className="btn"
                  disabled={
                    busy ||
                    conflict ||
                    row.listing.status === "archived" ||
                    form.description.trim().length < 40 ||
                    (!dirty && row.listing.status === "reviewed")
                  }
                  onClick={() => setConfirm("review")}
                >
                  <CheckIcon size={17} />
                  Review
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || conflict || !dirty}
                  onClick={() => save()}
                >
                  {busy ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <FloppyDiskIcon size={17} />
                  )}
                  Save
                </button>
              </div>
            }
          />
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <StatusBadge
              status={
                !dirty && row.listing.status === "reviewed"
                  ? "success"
                  : "neutral"
              }
            >
              {dirty ? "Unsaved changes" : labels.status[row.listing.status]}
            </StatusBadge>
            <span className="text-sm text-base-content/60">
              {row.listing.reference}
            </span>
            {row.listing.status === "archived" ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => save("draft")}
                disabled={busy || conflict}
              >
                Reopen
              </button>
            ) : (
              <button
                className="btn btn-ghost btn-sm ml-auto"
                onClick={() => setConfirm("archive")}
                disabled={busy || conflict}
              >
                <ArchiveIcon size={16} />
                Archive
              </button>
            )}
          </div>
          {error && (
            <div role="alert" className="alert alert-error mb-5">
              <span>{error}</span>
              {conflict && (
                <button
                  className="btn btn-sm"
                  onClick={() => setConfirm("reload")}
                >
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
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-box border border-base-300 p-5 md:p-6">
              <h2 className="mb-5 font-semibold">Listing details</h2>
              <ListingFields
                form={form}
                onChange={edit}
                disabled={busy || row.listing.status === "archived"}
              />
              <div className="mt-5 flex gap-2 sm:hidden">
                <button
                  className="btn flex-1"
                  disabled={
                    busy ||
                    conflict ||
                    dirty ||
                    row.listing.status !== "reviewed"
                  }
                  onClick={copy}
                >
                  Copy
                </button>
                <button
                  className="btn flex-1"
                  disabled={
                    busy ||
                    conflict ||
                    row.listing.status === "archived" ||
                    form.description.trim().length < 40 ||
                    (!dirty && row.listing.status === "reviewed")
                  }
                  onClick={() => setConfirm("review")}
                >
                  Review
                </button>
                <button
                  className="btn btn-primary flex-1"
                  disabled={busy || conflict || !dirty}
                  onClick={() => save()}
                >
                  Save
                </button>
              </div>
            </section>
            <aside className="space-y-5">
              <PropertyFacts property={row.property} />
              <AiAssistance
                row={row}
                disabled={busy || conflict || row.listing.status === "archived"}
                onApply={applyProposal}
                onConflict={() => {
                  setConflict(true);
                  setError(
                    "The listing or property changed. Reload before requesting another suggestion.",
                  );
                }}
              />
            </aside>
          </div>
          <ConfirmModal
            open={confirm === "review"}
            onOpenChange={(open) => {
              if (!open) setConfirm(null);
            }}
            title="Review listing"
            description="Confirm that the description matches the property facts and the wording is ready to use."
            confirmLabel="Mark reviewed"
            onConfirm={() => save("reviewed")}
            pending={busy}
          />
          <ConfirmModal
            open={confirm === "archive"}
            onOpenChange={(open) => {
              if (!open) setConfirm(null);
            }}
            title="Archive listing"
            description="The listing will remain available in the archive filter."
            confirmLabel="Archive"
            onConfirm={() => save("archived")}
            pending={busy}
          />
          <ConfirmModal
            open={confirm === "replace"}
            onOpenChange={(open) => {
              if (!open) setConfirm(null);
            }}
            title="Replace description"
            description="Replace your current text with the suggestion? You can edit it before saving."
            confirmLabel="Use suggestion"
            onConfirm={() => {
              if (suggestion)
                edit({ ...form, description: suggestion.draft.description });
              setConfirm(null);
              setSuggestion(null);
            }}
          />
          <ConfirmModal
            open={confirm === "reload"}
            onOpenChange={(open) => {
              if (!open) setConfirm(null);
            }}
            title="Reload listing"
            description="Discard unsaved changes and load the current server revision?"
            confirmLabel="Reload"
            onConfirm={() => {
              resource.refresh();
              setConfirm(null);
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
