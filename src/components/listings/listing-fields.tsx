"use client";

import {
  currencies,
  labels,
  listingPurposes,
  type Listing,
} from "@/domain/catalog";
import { MoneyField } from "@/components/ui/money-field";
import { ComboBox } from "@/components/ui";
import { z } from "zod";

export type ListingForm = Pick<
  Listing,
  "title" | "description" | "purpose" | "priceMinor" | "currency"
>;
export function formFor(listing: Listing): ListingForm {
  return {
    title: listing.title,
    description: listing.description,
    purpose: listing.purpose,
    priceMinor: listing.priceMinor,
    currency: listing.currency,
  };
}
export function ListingFields({
  form,
  onChange,
  disabled,
}: {
  form: ListingForm;
  onChange: (form: ListingForm) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label
          className="mb-2 block text-sm font-medium"
          htmlFor="listing-title"
        >
          Title
        </label>
        <input
          className="input w-full"
          id="listing-title"
          value={form.title}
          maxLength={160}
          required
          disabled={disabled}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
        <ComboBox
          label="Purpose"
          value={form.purpose}
          options={listingPurposes.map((value) => ({
            value,
            label: labels.purpose[value],
          }))}
          onChange={(value) =>
            onChange({ ...form, purpose: z.enum(listingPurposes).parse(value) })
          }
          disabled={disabled}
        />
        <MoneyField
          id="listing-price"
          label={form.purpose === "rent" ? "Monthly rent" : "Asking price"}
          value={form.priceMinor}
          currency={form.currency}
          onChange={(priceMinor) => onChange({ ...form, priceMinor })}
          disabled={disabled}
        />
        <ComboBox
          label="Currency"
          value={form.currency}
          options={currencies.map((value) => ({ value, label: value }))}
          onChange={(value) =>
            onChange({ ...form, currency: z.enum(currencies).parse(value) })
          }
          disabled={disabled}
        />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between gap-4">
          <label className="text-sm font-medium" htmlFor="listing-description">
            Description
          </label>
          <span className="text-xs text-base-content/60 tabular-nums">
            {form.description.trim().split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
        <textarea
          className="textarea min-h-80 w-full text-base leading-relaxed"
          id="listing-description"
          aria-label="Listing description"
          value={form.description}
          maxLength={5000}
          placeholder="Write the listing description"
          disabled={disabled}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
        />
      </div>
    </div>
  );
}
