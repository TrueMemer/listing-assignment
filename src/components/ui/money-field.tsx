"use client";

import { NumericFormat } from "react-number-format";
import type { Currency } from "@/domain/catalog";

const currencyPrefixes: Record<Currency, string> = {
  GBP: "£",
  EUR: "€",
  USD: "$",
};

export function MoneyField({
  id,
  label,
  value,
  currency,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: number | null;
  currency: Currency;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <NumericFormat
        id={id}
        type="text"
        inputMode="decimal"
        className="input w-full tabular-nums"
        value={value === null ? "" : (value / 100).toFixed(2)}
        valueIsNumericString
        prefix={currencyPrefixes[currency]}
        thousandSeparator=","
        decimalSeparator="."
        decimalScale={2}
        fixedDecimalScale
        allowNegative={false}
        disabled={disabled}
        placeholder={`${currencyPrefixes[currency]}0.00`}
        isAllowed={(values) =>
          values.floatValue === undefined || values.floatValue <= 1_000_000_000
        }
        onValueChange={(values, source) => {
          if (source.source !== "event") return;
          if (values.floatValue === undefined || values.value === "") {
            onChange(null);
            return;
          }
          const [whole = "0", fraction = ""] = values.value.split(".");
          onChange(
            Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0")),
          );
        }}
      />
    </div>
  );
}
