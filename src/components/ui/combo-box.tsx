"use client";

import { useCallback, useId, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import {
  CaretDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";

export interface ComboBoxOption {
  value: string;
  label: string;
  keywords?: string[];
}
export interface ComboBoxProps {
  label?: string;
  value: string;
  options: ComboBoxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onSearchChange?: (query: string) => void;
  loading?: boolean;
  emptyLabel?: string;
  allowCustomValue?: boolean | ((value: string) => boolean);
}

export function ComboBox({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose an option",
  disabled = false,
  className = "",
  onSearchChange,
  loading = false,
  emptyLabel = "No options found",
  allowCustomValue = false,
}: ComboBoxProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [listId, setListId] = useState<string | undefined>(undefined);
  const listRef = useCallback(
    (node: HTMLDivElement | null) => setListId(node?.id),
    [],
  );
  const rememberedLabels = useRef(new Map<string, string>());
  const selectedLabel =
    options.find((option) => option.value === value)?.label ??
    rememberedLabels.current.get(value);
  const customValue = query.trim();
  const showCustom =
    (typeof allowCustomValue === "function"
      ? allowCustomValue(customValue)
      : allowCustomValue) &&
    customValue.length > 0 &&
    !options.some(
      (option) =>
        option.value.toLowerCase() === customValue.toLowerCase() ||
        option.label.toLowerCase() === customValue.toLowerCase(),
    );
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      onSearchChange?.("");
    }
  }
  return (
    <div className={`min-w-0 space-y-2 ${className}`}>
      {label && (
        <label
          id={`${id}-label`}
          htmlFor={id}
          className="block text-sm font-medium"
        >
          {label}
        </label>
      )}
      <Popover.Root open={open} onOpenChange={changeOpen}>
        <Popover.Trigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-haspopup="listbox"
            aria-labelledby={label ? `${id}-label` : undefined}
            aria-label={label ? undefined : placeholder}
            disabled={disabled}
            className="btn w-full justify-between gap-3 font-normal"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            <span
              className={`truncate ${selectedLabel ? "" : "text-base-content/60"}`}
            >
              {selectedLabel ?? placeholder}
            </span>
            <CaretDownIcon
              size={16}
              className="shrink-0 text-base-content/60"
              aria-hidden="true"
            />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-[80] w-[var(--radix-popover-trigger-width)] min-w-44 max-w-[calc(100vw-2rem)] rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
          >
            <Command
              label={label ?? placeholder}
              defaultValue={value}
              shouldFilter={!onSearchChange}
              loop
            >
              <div className="input input-sm w-full">
                <MagnifyingGlassIcon
                  size={16}
                  className="shrink-0 text-base-content/60"
                  aria-hidden="true"
                />
                <Command.Input
                  value={query}
                  onValueChange={(next) => {
                    setQuery(next);
                    onSearchChange?.(next);
                  }}
                  placeholder="Search options"
                  aria-label={
                    label ? `Search ${label.toLowerCase()}` : "Search options"
                  }
                  className="min-w-0 grow"
                />
              </div>
              <Command.List
                ref={listRef}
                className="mt-2 max-h-64 overflow-y-auto"
                aria-busy={loading}
              >
                {loading && (
                  <div
                    className="flex justify-center p-3"
                    role="status"
                    aria-label="Loading options"
                  >
                    <span
                      className="loading loading-spinner loading-sm"
                      aria-hidden="true"
                    />
                  </div>
                )}
                {!loading && (
                  <Command.Empty className="px-3 py-3 text-sm text-base-content/60">
                    {emptyLabel}
                  </Command.Empty>
                )}
                {options.map((option) => (
                  <Command.Item
                    key={option.value}
                    value={option.value}
                    keywords={[option.label, ...(option.keywords ?? [])]}
                    onSelect={() => {
                      rememberedLabels.current.set(option.value, option.label);
                      onChange(option.value);
                      changeOpen(false);
                    }}
                    className="flex min-h-10 cursor-pointer items-center gap-2 rounded-field px-3 py-2 text-sm outline-none data-[selected=true]:bg-base-200"
                  >
                    <span className="min-w-0 grow break-words">
                      {option.label}
                    </span>
                    {option.value === value && (
                      <CheckIcon
                        size={16}
                        className="shrink-0"
                        aria-label="Selected"
                      />
                    )}
                  </Command.Item>
                ))}
                {showCustom && (
                  <Command.Item
                    value={`custom-value:${customValue}`}
                    keywords={[customValue]}
                    onSelect={() => {
                      rememberedLabels.current.set(customValue, customValue);
                      onChange(customValue);
                      changeOpen(false);
                    }}
                    className="flex min-h-10 cursor-pointer items-center rounded-field px-3 py-2 text-sm outline-none data-[selected=true]:bg-base-200"
                  >
                    Use &quot;{customValue}&quot;
                  </Command.Item>
                )}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
