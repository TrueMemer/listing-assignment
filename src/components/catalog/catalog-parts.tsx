"use client";

import { useEffect, useState } from "react";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const timeout = setTimeout(() => onChange(text), 300);
    return () => clearTimeout(timeout);
  }, [text, value, onChange]);
  return (
    <label className="input w-full sm:w-80">
      <MagnifyingGlassIcon size={18} aria-hidden="true" />
      <input
        data-search
        aria-label="Search"
        type="search"
        placeholder={placeholder}
        value={text}
        maxLength={100}
        onChange={(e) => setText(e.target.value)}
      />
      <kbd className="kbd kbd-sm hidden sm:inline">/</kbd>
    </label>
  );
}
export function LoadError({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <div role="alert" className="alert alert-error my-4">
      <span>{error}</span>
      <button className="btn btn-sm" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
export function LoadingTable() {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Loading records">
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <div key={n} className="skeleton h-10 w-full" />
      ))}
    </div>
  );
}
export function ClearFilters({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={onClick}>
      <XIcon size={14} />
      Clear filters
    </button>
  );
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
