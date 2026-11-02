# Alignment with Parts A and B

Part A proposes a six-week listing-writing pilot in one country and language, with optional Smart Listing Generator help. Part B describes that pilot and a later 40,000-unit rollout. This prototype uses synthetic data. It does not resolve processing approval, authoritative source access, staffing, or pilot traffic targets.

## ADR 1. A Next.js modular monolith

The target keeps the UI, HTTP API, and business modules in one deployment, backed by PostgreSQL. An undivided application would blur ownership. Separate business services would add release and operational work before there is evidence that independent scaling is needed. Forty thousand properties alone do not justify services.

The prototype uses Next.js App Router for the UI and route handlers, with server-side SQLite persistence. Domain, persistence, API, and model integration have separate responsibilities. The model remains a separate inference dependency. Codex CLI runs locally, but its configured account and provider perform the model processing.

Property browsing uses server-side search, filters, sorting, and pagination. Tables are the default, with cards and a searchable Country → City → Property tree available. Tree branches fetch paged properties, and listing-count links filter by the exact property ID. The UI uses daisyUI components, typed controls, and simple light and dark themes. These choices support the writing and management work rather than adding a separate presentation layer.

## Property and Listing are different entities

A `Property` describes a physical unit. It holds its address, city, country, property type, bedroom and bathroom counts, floor area, amenities, photo reference, location mode, optional typed map location, and source version. Changing a marketing description must not change these facts.

A `Listing` belongs to one property. It holds a marketing title, description, rent or sale purpose, price in minor currency units, currency, status, and revision. Its statuses are `draft`, `reviewed`, and `archived`. A reviewed listing records the facts version and review time. One property can have several listings, including different rental and sale offers.

Manual writing is the normal editing path. An agent can create, save, edit, review, and copy a listing without a model call. AI supplies an optional description proposal. Applying a proposal and saving the listing are explicit actions, so an unexpected model response cannot replace saved copy.

## ADR 2. An application-owned provider contract

The generation service calls a narrow provider contract. `CodexListingProvider` owns the local CLI interaction, while `ChatListingProvider` owns compatible chat transport and credentials. A deterministic adapter exercises the same service in tests and is never a runtime fallback.

Only allowlisted property facts and fixed illustrative writing instructions reach the selected adapter. Property identifiers stay in the application. Codex runs in an isolated temporary directory with read-only permissions, ephemeral sessions, disabled tools, and structured output. The optional chat adapter requests the same output shape. The domain independently validates descriptions and rejects selected factual contradictions. The browser receives plain text, safe metadata, and a request reference.

Each proposal carries its base listing revision and property facts version. The UI must discard a proposal if either changes before it is applied. A proposal is not a saved or reviewed listing.

Provider changes still require compatibility checks, processing approval, and quality evaluation. Local CLI execution does not establish on-device inference or a processing region. There is no silent vendor or region fallback and no automatic model download at startup.

## ADR 3. Controlled facts and versioned review

The target starts with checked property snapshots, a named source owner, and agreed refresh rules. It versions facts, brand guidance, prompts, and processing policy. The server derives access and processing policy from authorized property data and blocks generation when facts are stale or processing is unapproved.

The prototype stores synthetic records in SQLite. Property writes carry the expected source version. Listing writes carry the expected revision. A stale write returns HTTP 409 instead of overwriting newer work. The UI preserves edits so the agent can decide how to resolve the conflict.

Changing listing content clears review. Changing physical facts increments their version and invalidates the related listing reviews in the same database transaction. A reviewed listing is tied to the facts version used at review. This relationship lives on the server, rather than depending on browser storage or a checkbox alone.

These records demonstrate persistence and consistency. They store current versions and review state, not an immutable history of every edit. They do not identify an authenticated reviewer or establish a regulated approval audit. Identity, source provenance, freshness checks, country routing, retention, deletion, and versioned policy remain live-pilot work.

## Location and photo boundaries

The prototype keeps manual address entry and official Google Maps links independent of a lookup provider. Pasted links are validated and stored, not fetched or scraped. An optional Nominatim adapter handles explicitly submitted public-place searches only. Its SQLite-backed one-request-per-second gate and 24-hour cache are separate from catalogue search. The distributed configuration disables it; enabling the user's local demo is a separate, informed choice under the linked provider policy. Public provider queries and result attribution are an additional external boundary. They do not establish live-data approval.

Photo uploads go to server-owned files beside the SQLite store. The image adapter bounds bytes and decoded pixels, rejects unsupported formats, strips metadata by re-encoding, and allocates generated filenames. The API changes the property's photo with its expected version and invalidates related listing reviews transactionally. Failed version updates remove the newly processed file. Upload retention, deletion of superseded files, authenticated access, and production asset storage remain pilot work. Photos, map links, coordinates, and street addresses never reach the listing model.

## Flow and control ownership

```text
Agent browser
  browse properties -> create or open listing -> write -> save -> review -> copy
                                 |
                                 +-> optional AI proposal -> apply -> save
       |
       | same-origin requests; typed fields; expected versions
       v
Next.js API
  parse requests; check origin; bound payloads; return safe errors
       |
       +-> Catalog service -> SQLite transaction
       |     property facts; listings; revisions; review invalidation
       |
       +-> Photo adapter -> processed local WebP files
       |
       +-> Location adapter -> approved explicit-search provider
       |     shared rate gate and cache; external-query attribution
       |
       +-> Generation service
             allowed facts -> provider contract -> validate description
                                      |
                                      v
                          Codex CLI or compatible chat adapter
                          server-only configuration; deadlines; no tools
```

The target uses PostgreSQL for the same entity and review relationships. Introducing that store does not require separate business services.

## Deliberate omissions

There is no event bus, CQRS, vector search, agent framework, or publication integration. Selected-property writing needs none of them. Dependency injection belongs at the model boundary because the real transports and deterministic test adapter share a useful contract.

The pilot still needs measured drafting time, factual quality, and brand acceptance. A successful synthetic generation proves the tested request path runs. It does not establish those business outcomes or rollout capacity. The current verification record must distinguish persistence tests, deterministic generation tests, real model calls, and browser observations.
