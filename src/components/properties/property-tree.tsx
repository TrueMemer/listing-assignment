"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  BuildingsIcon,
  CaretDownIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import {
  propertyPageSchema,
  propertyTreeSchema,
  type City,
  type PropertyPage,
  type PropertyRow,
} from "@/domain/catalog";
import { api } from "@/lib/http";
import { useResource } from "@/lib/use-resource";

function treeFilters(query: string) {
  const source = new URLSearchParams(query);
  const result = new URLSearchParams();
  for (const key of ["q", "city", "type", "minBeds"]) {
    const value = source.get(key);
    if (value !== null && value !== "") result.set(key, value);
  }
  return result.toString();
}

type FocusProps = (id: string) => { tabIndex: number; onFocus: () => void };

export function PropertyTree({
  query = "",
  onSelect,
  selectedId,
}: {
  query?: string;
  onSelect?: (property: PropertyRow) => void;
  selectedId?: string;
}) {
  const filters = treeFilters(query);
  const resource = useResource(
    `/api/properties/tree${filters ? `?${filters}` : ""}`,
    propertyTreeSchema,
  );
  const prefix = useId();
  const countryId = `${prefix}-GB`;
  const [countryOpen, setCountryOpen] = useState(true);
  const [expandedCities, setExpandedCities] = useState(new Set<string>());
  const [activeId, setActiveId] = useState(countryId);
  useEffect(() => {
    setExpandedCities(new Set());
    setActiveId(countryId);
  }, [filters, countryId]);
  const focusProps: FocusProps = (id) => ({
    tabIndex: activeId === id ? 0 : -1,
    onFocus: () => setActiveId(id),
  });

  function keyboard(event: KeyboardEvent<HTMLUListElement>) {
    const active =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>('[role="treeitem"]')
        : null;
    if (!active) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]'),
    );
    const index = items.indexOf(active);
    let next: HTMLElement | undefined;
    if (event.key === "ArrowDown") next = items[index + 1];
    else if (event.key === "ArrowUp") next = items[index - 1];
    else if (event.key === "Home") next = items[0];
    else if (event.key === "End") next = items.at(-1);
    else if (event.key === "ArrowRight") {
      if (active.getAttribute("aria-expanded") === "false") active.click();
      else next = items.find((item) => item.dataset.treeParent === active.id);
    } else if (event.key === "ArrowLeft") {
      if (active.getAttribute("aria-expanded") === "true") active.click();
      else next = items.find((item) => item.id === active.dataset.treeParent);
    } else if (event.key === " " && active.tagName === "A") {
      event.preventDefault();
      active.click();
      return;
    } else return;
    event.preventDefault();
    if (next) {
      next.focus();
      next.scrollIntoView({ block: "nearest" });
    }
  }

  if (resource.loading)
    return (
      <div className="flex items-center gap-2 p-4 text-sm" role="status">
        <span
          className="loading loading-spinner loading-sm"
          aria-hidden="true"
        />
        Loading properties
      </div>
    );
  if (resource.error)
    return (
      <div role="alert" className="alert alert-error">
        <span>{resource.error}</span>
        <button type="button" className="btn btn-sm" onClick={resource.refresh}>
          Retry
        </button>
      </div>
    );
  const data = resource.data;
  if (!data?.total)
    return (
      <p className="p-5 text-sm text-base-content/60" role="status">
        No properties found
      </p>
    );
  return (
    <ul
      className="menu w-full p-2"
      role="tree"
      aria-label="Properties"
      onKeyDown={keyboard}
    >
      <li role="none">
        <button
          type="button"
          id={countryId}
          role="treeitem"
          aria-level={1}
          aria-expanded={countryOpen}
          aria-controls={`${countryId}-cities`}
          {...focusProps(countryId)}
          onClick={() => setCountryOpen((previous) => !previous)}
        >
          {countryOpen ? (
            <CaretDownIcon size={16} aria-hidden="true" />
          ) : (
            <CaretRightIcon size={16} aria-hidden="true" />
          )}
          <span className="grow text-left">United Kingdom</span>
          <span className="text-base-content/60">{data.total}</span>
        </button>
        {countryOpen && (
          <ul role="group" id={`${countryId}-cities`}>
            {data.groups.map((group, index) => (
              <CityBranch
                key={`${filters}:${group.city}`}
                id={`${prefix}-${encodeURIComponent(group.city)}`}
                parentId={countryId}
                city={group.city}
                total={group.total}
                position={index + 1}
                groupCount={data.groups.length}
                filters={filters}
                open={expandedCities.has(group.city)}
                toggle={() =>
                  setExpandedCities((previous) => {
                    const next = new Set(previous);
                    if (next.has(group.city)) next.delete(group.city);
                    else next.add(group.city);
                    return next;
                  })
                }
                focusProps={focusProps}
                onSelect={onSelect}
                selectedId={selectedId}
              />
            ))}
          </ul>
        )}
      </li>
    </ul>
  );
}

type LoadPhase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "failed"; message: string };
function CityBranch({
  id,
  parentId,
  city,
  total,
  position,
  groupCount,
  filters,
  open,
  toggle,
  focusProps,
  onSelect,
  selectedId,
}: {
  id: string;
  parentId: string;
  city: City;
  total: number;
  position: number;
  groupCount: number;
  filters: string;
  open: boolean;
  toggle: () => void;
  focusProps: FocusProps;
  onSelect?: (property: PropertyRow) => void;
  selectedId?: string;
}) {
  const [pages, setPages] = useState<PropertyPage[]>([]);
  const [phase, setPhase] = useState<LoadPhase>({ kind: "idle" });
  const controller = useRef<AbortController | null>(null);
  const fetching = useRef(false);
  const load = useCallback(
    async (page: number) => {
      if (fetching.current) return;
      fetching.current = true;
      const abort = new AbortController();
      controller.current = abort;
      setPhase({ kind: "loading" });
      const params = new URLSearchParams(filters);
      params.set("city", city);
      params.set("pageSize", "25");
      params.set("page", String(page));
      params.set("sort", "name-asc");
      try {
        const result = await api(
          `/api/properties?${params}`,
          propertyPageSchema,
          { signal: abort.signal },
        );
        if (!abort.signal.aborted) {
          setPages((previous) =>
            page === 1 ? [result] : [...previous, result],
          );
          setPhase({ kind: "ready" });
        }
      } catch (cause) {
        if (!abort.signal.aborted)
          setPhase({
            kind: "failed",
            message:
              cause instanceof Error
                ? cause.message
                : "Could not load properties.",
          });
      } finally {
        fetching.current = false;
      }
    },
    [city, filters],
  );
  useEffect(() => {
    if (open && phase.kind === "idle") void load(1);
  }, [open, phase.kind, load]);
  useEffect(() => () => controller.current?.abort(), []);
  const items = pages.flatMap((page) => page.items);
  const lastPage = pages.at(-1);
  const more = items.length < (lastPage?.total ?? total);
  return (
    <li role="none">
      <button
        type="button"
        id={id}
        role="treeitem"
        aria-level={2}
        aria-expanded={open}
        aria-controls={`${id}-properties`}
        aria-posinset={position}
        aria-setsize={groupCount}
        data-tree-parent={parentId}
        {...focusProps(id)}
        onClick={toggle}
      >
        {open ? (
          <CaretDownIcon size={16} aria-hidden="true" />
        ) : (
          <CaretRightIcon size={16} aria-hidden="true" />
        )}
        <span className="grow text-left">{city}</span>
        <span className="text-base-content/60">{lastPage?.total ?? total}</span>
      </button>
      {open && (
        <ul role="group" id={`${id}-properties`}>
          {items.map((property, index) => {
            const itemId = `${id}-${property.id}`;
            const attributes = {
              id: itemId,
              role: "treeitem",
              "aria-level": 3,
              "aria-selected": selectedId === property.id,
              "aria-posinset": index + 1,
              "aria-setsize": lastPage?.total ?? total,
              "data-tree-parent": id,
              ...focusProps(itemId),
              className: `flex min-w-0 gap-2 ${selectedId === property.id ? "menu-active" : ""}`,
            };
            const label = (
              <>
                <BuildingsIcon
                  size={17}
                  className="shrink-0"
                  aria-hidden="true"
                />
                <span className="min-w-0 grow text-left">
                  <span className="block truncate">{property.name}</span>
                  <span className="block truncate text-xs text-base-content/60">
                    {property.address}
                  </span>
                </span>
              </>
            );
            return (
              <li role="none" key={property.id}>
                {onSelect ? (
                  <button
                    type="button"
                    {...attributes}
                    onClick={() => onSelect(property)}
                  >
                    {label}
                  </button>
                ) : (
                  <Link
                    {...attributes}
                    href={`/properties/${encodeURIComponent(property.id)}`}
                  >
                    {label}
                  </Link>
                )}
              </li>
            );
          })}
          {phase.kind === "loading" && (
            <li role="none">
              <div role="status" className="gap-2 text-sm">
                <span
                  className="loading loading-spinner loading-xs"
                  aria-hidden="true"
                />
                Loading
              </div>
            </li>
          )}
          {phase.kind === "failed" && (
            <li role="none">
              <div role="alert" className="alert alert-error text-sm">
                {phase.message}
              </div>
              <button
                type="button"
                id={`${id}-retry`}
                role="treeitem"
                aria-level={3}
                data-tree-parent={id}
                {...focusProps(`${id}-retry`)}
                onClick={() => void load((lastPage?.page ?? 0) + 1)}
              >
                Retry
              </button>
            </li>
          )}
          {phase.kind === "ready" && more && (
            <li role="none">
              <button
                type="button"
                id={`${id}-more`}
                role="treeitem"
                aria-level={3}
                data-tree-parent={id}
                {...focusProps(`${id}-more`)}
                onClick={() => void load((lastPage?.page ?? 0) + 1)}
              >
                Load more in {city}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}
