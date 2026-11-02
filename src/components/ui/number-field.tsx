"use client";

import { MinusIcon, PlusIcon } from "@phosphor-icons/react";

export interface NumberFieldProps {
  label: string;
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}

export function NumberField({
  label,
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  required = false,
  error,
  disabled = false,
}: NumberFieldProps) {
  function adjust(direction: number) {
    const next =
      value === null
        ? min
        : Math.min(
            max,
            Math.max(
              min,
              Math.round((value + direction * step) * 1_000_000) / 1_000_000,
            ),
          );
    onChange(next);
  }
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="join flex w-full">
        <button
          type="button"
          className="btn btn-square join-item shrink-0"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={disabled || (value !== null && value <= min)}
          onClick={() => adjust(-1)}
        >
          <MinusIcon size={16} aria-hidden="true" />
        </button>
        <div
          className={`input join-item min-w-0 flex-1 ${error ? "input-error" : ""}`}
        >
          <input
            id={id}
            type="number"
            inputMode={Number.isInteger(step) ? "numeric" : "decimal"}
            className="number-input min-w-0 grow tabular-nums"
            value={value ?? ""}
            min={min}
            max={max}
            step={step}
            required={required}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) =>
              onChange(
                event.currentTarget.value === "" ||
                  !Number.isFinite(event.currentTarget.valueAsNumber)
                  ? null
                  : event.currentTarget.valueAsNumber,
              )
            }
          />
          {suffix && (
            <span className="shrink-0 text-sm text-base-content/60">
              {suffix}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-square join-item shrink-0"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={disabled || (value !== null && value >= max)}
          onClick={() => adjust(1)}
        >
          <PlusIcon size={16} aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p
          id={`${id}-error`}
          className="alert alert-error text-sm"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
