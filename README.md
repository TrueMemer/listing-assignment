# Fieldnotes

Fieldnotes is a property catalogue and listing editor. A Property describes a physical unit. A Listing is a separate rent or sale offer with its own title, description, price, currency, and review status. A property can have several listings.

Agents can write and save listings manually. The Smart Listing Generator is optional help with the description and is the application's single real AI feature. It gives the pilot a bounded task whose drafting time and factual corrections can be measured, while leaving the final wording with the agent.

This assessment uses synthetic data and illustrative writing guidance. There is no publication integration or production identity system.

## Run locally

Use Node.js 24 or later and npm. The application uses Node's built-in SQLite module. Install the locked dependencies and start the application:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). For a production build:

```sh
npm run build
npm start
```

Next.js serves the UI and API in one application. Starting it does not download a model. Manual listing work does not require an AI provider. Optional generation uses an installed Codex CLI by default, or an explicitly configured model endpoint.

## Work with properties and listings

The Properties page opens as a table, with cards and a Country → City → Property tree available. Search, city, type, bedroom thresholds, sorting, and pagination run on the server. Listing counts link to the listings for that exact property. Lists return a page of records rather than sending the full catalogue to the browser. The tree loads property branches in pages and is also available when choosing a property for a new listing.

Open a property to inspect or edit its physical facts and view its listings. Create a listing for that property, choose rent or sale, set the price and currency, and write its title and description. Save the wording, then review it against the physical facts. Mark the listing reviewed before using the reviewed-copy action. Archiving a listing does not remove the property.

A fresh database is seeded with 60 synthetic properties and 24 listings. The seed includes a property with more than one listing to make the distinction visible. Saved edits and review state live in server-side SQLite, so reloading the page does not depend on browser draft storage. Theme and view preferences are display settings, not authoritative records.

The default database is `.data/fieldnotes.sqlite`. Set `FIELDNOTES_DB_PATH` to use another file. Startup creates the schema and seeds an empty catalogue once; it does not overwrite existing records. To start fresh, stop the application and move `.data/` to a backup location, then restart. Keep the SQLite database and its WAL files together while backing it up.

Changing listing content clears review. Changing property facts increments their version and invalidates related listing reviews in the same transaction. Each write supplies the version it was based on. A stale version returns HTTP 409 instead of overwriting newer work. The editor keeps unsaved changes available for conflict resolution.

The editor formats money with its currency symbol, thousands separators, and two decimal places. Prices are integer minor units in the API. `null` means no price has been set and differs from an actual zero price. Rental prices are monthly, and sale prices are the total. Empty descriptions can be saved as drafts. Marking a listing reviewed requires at least 40 characters.

The current listing record ties its reviewed revision to the property facts version. Revision numbers support conflict checks; this prototype does not retain an immutable history of every edit or identify an authenticated reviewer. These are consistency records in a single-user prototype, not a production approval audit.

## Property locations and photos

Address and city can be entered manually. Cities are validated text, not a closed list of the seed cities. The current pilot country is the United Kingdom. Uncheck manual location entry to select a map location or paste an official Google Maps HTTPS link. Pasting a link needs no API key and does not fetch or expand the URL. Recognized coordinates are stored when available; a short link can remain a link without coordinates.

Optional public-place search uses a separate server-side Nominatim adapter. It is disabled in the distributed `.env.example`. The [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) requires an informed operator choice, modest end-user traffic, an identifying application header, attribution, and an application-wide limit of one request per second. Do not send personal or confidential information. Search runs only after an explicit button press or Enter, never as external autocomplete or a bulk import. The server shares its rate gate and 24-hour result cache through SQLite. Internal catalogue and property-picker searches do not call Nominatim.

To enable an approved local or controlled deployment, set `LOCATION_SEARCH_ENABLED=true`, use a truthful `NOMINATIM_USER_AGENT`, and review the provider policy first. `NOMINATIM_SEARCH_URL` can select an approved alternative deployment. Manual entry and map links remain usable when lookup is disabled or unavailable. The user's local-demo opt-in and any live result are recorded separately in the verification record.

Property photos accept JPEG, PNG, or WebP up to 5 MiB and 16 megapixels. The server decodes and re-encodes the image as WebP, removes original metadata and filenames, and limits the result to 1600 × 1200 pixels. Uploaded files are stored under `.data/uploads`, or `FIELDNOTES_UPLOAD_DIR`, with generated names and an application photo route. Photo changes use the expected property version and invalidate related reviews. Back up uploads together with the database. Photos, coordinates, map links, and street addresses are not sent to the listing model.

## Ask AI for a proposal

Optional generation reads the selected property's validated facts. It returns a description proposal with the base listing revision and property facts version. It does not overwrite the editor or save a listing. The agent chooses whether to apply the wording, then saves and reviews it like manually written text.

A proposal for an older listing revision or facts version must be discarded. Model failures preserve the agent's work and return an actionable error. There is no sample-response fallback.

### Use local Codex

The default `CodexListingProvider` calls an installed, authenticated Codex CLI through a separate server-side adapter. The adapter looks for `codex` on `PATH` and supports the desktop installation path. Set `CODEX_BIN` if the binary is elsewhere.

```dotenv
AI_PROVIDER=codex
# Optional overrides:
# CODEX_BIN=/absolute/path/to/codex
# CODEX_MODEL=an-available-model
AI_TIMEOUT_MS=60000
```

The CLI runs on your machine. Model processing uses the signed-in Codex account and configured provider. Local CLI execution does not establish on-device inference or a processing region. Keep this assessment on synthetic data until the processing terms are approved.

The adapter requires non-interactive structured output, ephemeral sessions, configuration isolation, and tool-disable support. An incompatible binary returns an error. Each request uses a temporary working directory, read-only permissions, disabled tools, a deadline, bounded output, and cleanup. The prompt reaches stdin without shell interpolation. Independent domain validation checks the final JSON before returning it to the application.

### Use another model endpoint

The optional `ChatListingProvider` uses an OpenAI-compatible endpoint:

```dotenv
AI_PROVIDER=chat
AI_BASE_URL=https://your-approved-provider.example/v1
AI_MODEL=your-model
AI_API_KEY=your-key
AI_TIMEOUT_MS=60000
```

The endpoint must support chat completions with JSON-schema output. Remote endpoints require HTTPS. HTTP is accepted only on loopback. Credentials stay on the server and must never use `NEXT_PUBLIC_` variables.

API compatibility does not establish acceptable quality or processing approval. `/api/status` reports adapter configuration, not continuous upstream health or proof of successful generation.

## UI conventions

The application uses daisyUI components with simple light and dark themes. Purpose, status, currency, property type, and amenities use typed controls. Searchable selections and keyboard shortcuts support frequent tasks. The header keeps navigation and the theme switch visible. Ctrl or ⌘ K opens commands, `/` focuses catalogue search, and `?` opens shortcut help. In the editor, Ctrl or ⌘ S saves and Ctrl or ⌘ Enter opens review. AI remains optional, including its Ctrl or ⌘ Shift G shortcut. Mobile editing has completion actions below the form.

The [prompting log](docs/AI_PROMPTING_LOG.md#skill-sources) records the official daisyUI skill source. [Image sources](docs/ASSETS.md) records the bundled photographs.

## Code structure

| Layer | Location | Responsibility |
|---|---|---|
| UI | `src/app/`, `src/components/` | Property browsing, listing editing, optional proposals, review, and copy |
| Shared domain contract | `src/domain/catalog.ts` | Property and Listing types, strict schemas, typed queries, and versioned responses |
| HTTP API | `src/app/api/`, `src/server/api/` | Request boundaries, same-origin checks, safe errors, and generation limits |
| Persistence | `src/server/data/` | SQL queries, pagination, transactions, revisions, and review invalidation |
| Generation domain | `src/server/domain/` | Allowed model facts, provider contract, and independent output validation |
| Model adapters | `src/server/integration/` | Codex CLI or compatible chat transport, deadlines, and server-only configuration |
| Tests | `tests/` | Persistence, service contracts, request boundaries, and editor-state behavior |

The generation service depends on a provider contract. Real transports and the deterministic test adapter implement that contract. The runtime never selects the test adapter after a model failure. [Architecture alignment](docs/ARCHITECTURE_ALIGNMENT.md) maps the implementation to Part B.

Structured output validation is the selected senior-level concern. The server requests a description-only JSON object and independently checks its shape, length, markup, and selected factual contradictions. These checks do not prove that every sentence is true. Human review remains necessary.

## API

| Method and path | Result |
|---|---|
| `GET /api/properties` | Paged properties with listing counts |
| `GET /api/properties/tree` | Filtered country and city groups with property counts |
| `GET /api/properties/[id]` | One property and its listings |
| `PATCH /api/properties/[id]` | Update physical facts using the expected `sourceVersion` |
| `GET /api/listings` | Paged listings with their property facts |
| `POST /api/listings` | Create a manual draft for a property |
| `GET /api/listings/[id]` | One listing and its property |
| `PATCH /api/listings/[id]` | Update wording, price, purpose, or status using the expected `revision` |
| `POST /api/listings/[id]/generate` | Return an optional proposal using `{ revision, sourceVersion }` without saving it |
| `POST /api/properties/[id]/photo` | Multipart `file` and expected `sourceVersion`; returns updated property detail |
| `GET /api/photos/[filename]` | One processed application WebP photo |
| `GET /api/locations?q=...` | Explicit public-place lookup when enabled |
| `GET /api/status` | Adapter configuration status |

Collection queries accept `page`, `pageSize`, `q`, and a typed `sort`. Page size is 10, 25, or 50. Property filters are `city`, `type`, and `minBeds`. Listing filters are `status`, `purpose`, and `propertyId`. Schemas reject unknown fields. Both search values and page bounds are validated, and SQL applies filtering, counts, ordering, and `LIMIT` and `OFFSET`. The tree endpoint accepts the property search and filters; each expanded city loads the regular paged collection. Location search is separate, accepts a public query of 3 to 120 characters, and has its own external-provider limits.

## Verify the build

```sh
npm test
npm run typecheck
npm run build
```

The [verification record](docs/VERIFICATION.md) distinguishes automated tests, real-model calls, and observed browser behavior for the current build. Results from the earlier browser-storage implementation do not verify this revised workflow. To repeat the live check while the application is running:

```sh
npm run test:live
```

A deterministic provider test does not prove live inference. A working model adapter does not by itself prove the browser flow, business targets, or production readiness.

## OWASP Top 10 2025 self-assessment

The categories follow the [official OWASP 2025 introduction](https://top10.owasp.org/2025/0x00_2025-Introduction/). This is a prototype assessment. The remaining controls must precede shared or live-data use.

| Category | Control and remaining work |
|---|---|
| A01 Broken Access Control | Same-origin checks limit browser requests, and the catalogue uses synthetic records. Authentication and organization, country, and property authorization remain live-data requirements under [ADR 3](docs/ARCHITECTURE_ALIGNMENT.md#adr-3-controlled-facts-and-versioned-review). |
| A02 Security Misconfiguration | Credentials stay in ignored server configuration and safe errors omit internals. Review headers, a stricter production CSP, deployment configuration, and secret management before shared use. |
| A03 Software Supply Chain Failures | Exact dependencies and the lockfile make installs repeatable. Continue dependency review, vulnerability checks, runtime updates, and build provenance. |
| A04 Cryptographic Failures | Remote chat and location lookup use HTTPS. Chat HTTP is limited to loopback. Codex uses its configured provider. SQLite and uploads are not encrypted. Live use needs browser TLS and approved encryption for stores and backups. |
| A05 Injection | Strict schemas, parameterized SQL, allowlisted sort orders, separated facts and instructions, disabled model tools, and plain-text rendering protect boundaries. Map links require approved HTTPS hosts and are not fetched. See [ADR 2](docs/ARCHITECTURE_ALIGNMENT.md#adr-2-an-application-owned-provider-contract). Prompt wording alone cannot guarantee immunity. |
| A06 Insecure Design | Manual writing works without AI, proposals require explicit application, and there is no publishing path. Server-side versions and review invalidation protect consistency. Identity and a full approval audit remain work. |
| A07 Authentication Failures | Authentication is omitted from the synthetic single-user prototype. Add SSO, session controls, and server-side authorization before shared use. |
| A08 Software or Data Integrity Failures | Schemas, SQL constraints, expected versions, transactions, and model checks protect data relationships. Photo uploads are bounded, decoded, stripped of metadata, and re-encoded under generated names. Source provenance and versioned policy remain pilot work. |
| A09 Security Logging and Alerting Failures | Safe request references, outcomes, model metadata, and latency support diagnosis without raw prompts or draft bodies. Central retention, authenticated audit events, and alerts remain pilot work. |
| A10 Mishandling of Exceptional Conditions | Bounded payloads, photo pixel and decode limits, deadlines, generation limits, location throttling, safe errors, and HTTP 409 prevent silent replacement of work. Verify backup, recovery, and disk-failure handling before operational use. |

## What is real and what is synthetic

Seed property and listing records are synthetic, and the initial photographs are bundled assessment assets. User-uploaded photos and saved map selections are stored by the application. Manual editing, SQLite persistence, query pagination, version checks, review relationships, and the selected model transport are application behavior. Company-approved brand policy, user identity, authoritative imports, and external publication are omitted integrations.

Local persistence does not establish multi-user authorization, audited review, residency compliance, or a production backup plan. The target pilot uses PostgreSQL, checked source facts, and approved processing routes.

## With more time

1. Resolve live-data access and processing. Confirm permitted fields and regions, add identity and property authorization, and establish checked imports with an owner and freshness rules.
2. Measure writing quality and time saved. Agree brand examples and compare manual and assisted tasks, including review, failures, and factual corrections.
3. Prepare the pilot store and operations. Migrate the same entity relationships to PostgreSQL, version policy and brand guidance, and add retention, backups, quotas, monitoring, and load checks before expansion.

[AGENTS.md](AGENTS.md) records implementation rules. [AI steering log](docs/AI_PROMPTING_LOG.md) records representative prompts and rejected assumptions.
