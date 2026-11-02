"use client";

import { useId, useRef } from "react";

const bedroomOptions = [
  { value: "", label: "Any" },
  { value: "1", label: "1+" },
  { value: "2", label: "2+" },
  { value: "3", label: "3+" },
  { value: "4", label: "4+" },
  { value: "5", label: "5+" },
];

export function BedroomsFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const labelId = useId();
  const hasSelection = bedroomOptions.some((option) => option.value === value);
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium" id={labelId}>
        Bedrooms
      </span>
      <div
        className="join"
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={(event) => {
          const button =
            event.target instanceof HTMLElement
              ? event.target.closest<HTMLButtonElement>("[data-bedroom-value]")
              : null;
          if (!button) return;
          const index = bedroomOptions.findIndex(
            (option) => option.value === button.dataset.bedroomValue,
          );
          let nextIndex: number;
          if (event.key === "ArrowRight" || event.key === "ArrowDown")
            nextIndex = (index + 1) % bedroomOptions.length;
          else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
            nextIndex =
              (index - 1 + bedroomOptions.length) % bedroomOptions.length;
          else if (event.key === "Home") nextIndex = 0;
          else if (event.key === "End") nextIndex = bedroomOptions.length - 1;
          else return;
          event.preventDefault();
          const next = bedroomOptions[nextIndex];
          if (next) {
            onChange(next.value);
            buttons.current.get(next.value)?.focus();
          }
        }}
      >
        {bedroomOptions.map((option) => (
          <button
            key={option.value}
            ref={(node) => {
              if (node) buttons.current.set(option.value, node);
              else buttons.current.delete(option.value);
            }}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            tabIndex={
              value === option.value || (!hasSelection && option.value === "")
                ? 0
                : -1
            }
            data-bedroom-value={option.value}
            className={`btn btn-sm join-item min-h-10 min-w-10 ${value === option.value ? "btn-active" : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
