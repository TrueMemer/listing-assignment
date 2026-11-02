"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MagnifyingGlassIcon, MapPinIcon } from "@phosphor-icons/react";
import {
  citySchema,
  isApprovedMapUrl,
  locationSearchSchema,
  mapLocationSchema,
  type City,
  type LocationResult,
  type LocationSearch,
  type MapLocation,
} from "@/domain/catalog";
import { api } from "@/lib/http";

export interface LocationChange {
  manualLocation: boolean;
  mapLocation: MapLocation | null;
  address?: string;
  city?: City;
}
export interface LocationInputProps {
  manual: boolean;
  mapLocation: MapLocation | null;
  address: string;
  city: City;
  onChange: (change: LocationChange) => void;
}

export function LocationInput({
  manual,
  mapLocation,
  address,
  city,
  onChange,
}: LocationInputProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [googleLink, setGoogleLink] = useState("");
  const [result, setResult] = useState<LocationSearch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      sequence.current += 1;
      controller.current?.abort();
    },
    [],
  );
  function editQuery(text: string) {
    setQuery(text);
    sequence.current += 1;
    controller.current?.abort();
    setBusy(false);
    setResult(null);
    setError("");
  }
  async function search() {
    const text = query.trim();
    if (busy || text.length < 3) return;
    const token = ++sequence.current;
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      const response = await api(
        `/api/locations?q=${encodeURIComponent(text)}`,
        locationSearchSchema,
        { signal: abort.signal },
      );
      if (sequence.current === token) setResult(response);
    } catch (cause) {
      if (sequence.current === token)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not search locations. Enter the address manually or use a Google Maps link.",
        );
    } finally {
      if (sequence.current === token) setBusy(false);
    }
  }
  function choose(place: LocationResult) {
    onChange({
      manualLocation: false,
      mapLocation: {
        source: "openstreetmap",
        label: place.label,
        url: place.url,
        latitude: place.latitude,
        longitude: place.longitude,
      },
      address: place.address,
      city: citySchema.parse(place.city),
    });
    setError("");
  }
  function useGoogleLink() {
    const value = googleLink.trim();
    if (!isApprovedMapUrl(value, "google-maps")) {
      setError("Use an official Google Maps HTTPS link.");
      return;
    }
    const url = new URL(value);
    const coordinateText =
      url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)?.slice(1) ??
      (url.searchParams.get("q") ?? url.searchParams.get("query") ?? "")
        .match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/)
        ?.slice(1);
    const latitude =
      coordinateText?.[0] === undefined ? null : Number(coordinateText[0]);
    const longitude =
      coordinateText?.[1] === undefined ? null : Number(coordinateText[1]);
    const parsed = mapLocationSchema.safeParse({
      source: "google-maps",
      label: "Google Maps link",
      url: value,
      latitude,
      longitude,
    });
    if (!parsed.success) {
      setError("Check the Google Maps link and its coordinates.");
      return;
    }
    onChange({ manualLocation: false, mapLocation: parsed.data });
    setError("");
  }
  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={manual}
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            editQuery(
              checked ? "" : [address, city].filter(Boolean).join(", "),
            );
            onChange({ manualLocation: checked, mapLocation: null });
          }}
        />
        Enter location manually
      </label>
      {!manual && (
        <div className="space-y-4 rounded-box border border-base-300 bg-base-100 p-4">
          <div>
            <label
              htmlFor={`${id}-search`}
              className="mb-2 block text-sm font-medium"
            >
              Search location
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={`${id}-search`}
                type="search"
                className="input min-w-0 grow"
                value={query}
                maxLength={120}
                placeholder="Address, place or postcode"
                onChange={(event) => editQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void search();
                  }
                }}
              />
              <button
                type="button"
                className="btn"
                disabled={busy || query.trim().length < 3}
                onClick={() => void search()}
              >
                {busy ? (
                  <span
                    className="loading loading-spinner loading-sm"
                    aria-hidden="true"
                  />
                ) : (
                  <MagnifyingGlassIcon size={18} aria-hidden="true" />
                )}
                Search
              </button>
            </div>
          </div>
          {error && (
            <p className="alert alert-error text-sm" role="alert">
              {error}
            </p>
          )}
          {result && (
            <div>
              <ul
                className="menu w-full rounded-box border border-base-300 p-1"
                aria-label="Location results"
              >
                {result.results.map((place) => (
                  <li key={place.id}>
                    <button
                      type="button"
                      aria-pressed={mapLocation?.url === place.url}
                      className={
                        mapLocation?.url === place.url ? "menu-active" : ""
                      }
                      onClick={() => choose(place)}
                    >
                      <MapPinIcon
                        size={17}
                        className="shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-left">{place.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {result.results.length === 0 && (
                <p className="py-2 text-sm text-base-content/60" role="status">
                  No locations found
                </p>
              )}
              <a
                className="link mt-2 inline-block text-xs text-base-content/60"
                href={result.attributionUrl}
                target="_blank"
                rel="noreferrer"
              >
                {result.attribution}
              </a>
            </div>
          )}
          <div className="border-t border-base-300 pt-4">
            <label
              htmlFor={`${id}-google`}
              className="mb-2 block text-sm font-medium"
            >
              Google Maps link
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={`${id}-google`}
                type="url"
                className="input min-w-0 grow"
                value={googleLink}
                maxLength={2048}
                placeholder="https://maps.google.com/…"
                onChange={(event) => setGoogleLink(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    useGoogleLink();
                  }
                }}
              />
              <button
                type="button"
                className="btn"
                disabled={!googleLink.trim()}
                onClick={useGoogleLink}
              >
                Use link
              </button>
            </div>
          </div>
          {mapLocation && (
            <div className="text-sm">
              <span className="font-medium">Selected location</span>
              <a
                className="link mt-1 block break-words"
                href={mapLocation.url}
                target="_blank"
                rel="noreferrer"
              >
                {mapLocation.label}
              </a>
            </div>
          )}
          {!result && mapLocation?.source === "openstreetmap" && (
            <a
              className="link text-xs text-base-content/60"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap contributors
            </a>
          )}
        </div>
      )}
    </div>
  );
}
