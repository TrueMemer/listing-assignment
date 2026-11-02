"use client";

import { useRef, useState, useEffect } from "react";
import {
  generationProposalSchema,
  type ListingRow,
  type GenerationProposal,
} from "@/domain/catalog";
import { api, ApiError } from "@/lib/http";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";

export function AiAssistance({
  row,
  onApply,
  onConflict,
  disabled,
}: {
  row: ListingRow;
  onApply: (proposal: GenerationProposal) => void;
  onConflict: () => void;
  disabled?: boolean;
}) {
  const [proposal, setProposal] = useState<GenerationProposal | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    setProposal(null);
    setError("");
    abortRef.current?.abort();
    setPending(false);
    return () => abortRef.current?.abort();
  }, [row.listing.id, row.listing.revision, row.property.sourceVersion]);
  async function suggest() {
    if (pending || disabled) return;
    const abort = new AbortController();
    abortRef.current = abort;
    setPending(true);
    setError("");
    setProposal(null);
    try {
      const result = await api(
        `/api/listings/${row.listing.id}/generate`,
        generationProposalSchema,
        {
          method: "POST",
          body: {
            revision: row.listing.revision,
            sourceVersion: row.property.sourceVersion,
          },
          signal: abort.signal,
        },
      );
      if (!abort.signal.aborted) setProposal(result);
    } catch (cause) {
      if (
        !abort.signal.aborted &&
        cause instanceof ApiError &&
        cause.status === 409
      )
        onConflict();
      if (!abort.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not generate a suggestion.",
        );
    } finally {
      if (!abort.signal.aborted) setPending(false);
    }
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "g"
      ) {
        event.preventDefault();
        void suggest();
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  });
  return (
    <section className="rounded-box border border-base-300 p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold">AI assistance</h2>
        <span className="text-xs text-base-content/60">Optional</span>
      </div>
      <button
        className="btn w-full"
        type="button"
        disabled={pending || disabled}
        onClick={suggest}
      >
        {pending ? (
          <>
            <span className="loading loading-spinner loading-xs" />
            Generating
          </>
        ) : (
          <>
            <ArrowsClockwiseIcon size={17} />
            Suggest description
          </>
        )}
      </button>
      {error && (
        <div className="alert alert-error mt-4 text-sm" role="alert">
          {error}
        </div>
      )}
      {proposal && (
        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium" htmlFor="ai-proposal">
            Suggestion
          </label>
          <textarea
            className="textarea min-h-48 w-full leading-relaxed"
            id="ai-proposal"
            value={proposal.draft.description}
            readOnly
          />
          <div className="text-xs text-base-content/60">{proposal.model}</div>
          <button
            className="btn w-full"
            type="button"
            disabled={disabled}
            onClick={() => onApply(proposal)}
          >
            Use suggestion
          </button>
        </div>
      )}
    </section>
  );
}
