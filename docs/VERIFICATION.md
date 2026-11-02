# Verification record

Checks on 2 November 2026 cover the rebuilt Next.js Property and Listing application, including the later tree, money, location, and photo changes. Results from the supplied archives and the earlier browser-storage implementation were not reused.

All 31 backend tests passed. A real Codex HTTP check returned a validated proposal in 5,028 ms and confirmed that the stored listing was unchanged. Current desktop browser checks passed the manual, tree, money, location, and upload flows described below. A separate clean install, test run, TypeScript check, and production build also passed. Final captures were reviewed at 1440, 1146, 390, and 320 pixels. The final light-theme status contrast correction was confirmed in the browser and refreshed screenshot.

## Automated tests

The passing suite contains seven API tests, seven catalogue-feature tests, five generation-domain tests, four provider tests, and eight repository tests. The saved test output reports 31 passes, zero failures, zero skips, and zero cancellations.

Tests run actual SQLite and image processing. They cover:

- SQL search, typed filters, sorting, counts, and pagination over 60 seeded properties and 24 listings.
- Separate rental and sale listings, manual creation with AI unavailable, an unset price distinct from zero, and empty drafts.
- Reopen persistence, two database connections, sequential listing references, and non-destructive migration of existing catalogues.
- Property and listing version conflicts, transactional invalidation of related reviews, and rejection of invalid studio facts without changing records.
- AI proposals that do not save or overwrite wording, including a stale-version conflict when facts change during inference.
- Filtered tree aggregates without property leaves, cities beyond the seed choices, persisted manual and map locations, paired coordinates, and official map-host checks.
- Real multipart image decoding and WebP output, metadata removal, generated filenames, version conflicts, review invalidation, and cleanup after an upload loses a revision race. SVG, HTML, oversize images, excessive pixels, and unsafe filenames are rejected.
- Model request and response validation, provider deadlines, safe failures, Codex process isolation, and rejection of tool events.

Location tests inject the HTTP transport. They check shared SQL caching and rate limiting, bounded responses, disabled or failed lookup, attribution, and exclusion of query text from application logs. They do not send public-provider requests. Fake model adapters and CLI fixtures likewise do not establish real inference.

JSON request bodies are capped at 32 KiB to accommodate manually written descriptions up to 5,000 characters. The model payload remains limited to city, bedroom and bathroom counts, floor area, and selected amenities. Names, street addresses, photos, map links, coordinates, listing prices, existing descriptions, and identifiers are excluded.

## Clean install and production build

A separate source copy excluded `node_modules`, `.next`, `.data`, and `.env.local`. Node.js 24.19.0 and npm 11.21.1 installed the locked dependencies with `npm ci`. All 31 tests then passed, and Next.js 16.4.4 completed TypeScript checking and generated the production routes. The final filled-status contrast correction was synchronized into the clean copy and passed another 31-test run and production build. The production build log contains its completion and route summary with no build warnings. Installation and build did not modify the checked source files.

`npm audit` reported zero known vulnerabilities on this date. That result is a dependency-feed check, not an application security assessment. npm also warned that the esbuild postinstall script was not approved under its install-script policy. Tests and the production build passed without approving that script.

The clean-copy check made no AI or geocoder requests and created no application data or local environment file. Live checks below used the running local demo separately.

## Real model checks

The SQL-backed service called the actual `CodexListingProvider` for synthetic `listing-001` in 6,115 ms. Independent validation accepted the one bedroom, one bathroom, and 55 square metres supplied in the facts. The complete stored record was identical before and after generation.

The production HTTP smoke used the listing-specific generation endpoint, validated the returned proposal, and compared the stored listing before and after the request. It passed in 5,028 ms with `listingUnchanged: true`.

A browser request also returned a real Codex suggestion in 6.2 seconds. The proposal appeared separately while the editor and stored description remained empty. The agent then wrote manually. This demonstrates that generation does not automatically apply or save the proposal.

## Browser and screenshot review

The primary session operated the production application in the in-app browser. A separate reviewer inspected captured images and current source. That image review is separate from live browser operation.

The browser opened Properties as a table with ten rows per page. Next displayed rows 11 through 20. Search, city selection, and the compact 3+ bedroom filter changed the results. The `/` shortcut focused search, and Ctrl K opened commands and navigated to Listings. An exact-property count link opened two related listings, displayed the property filter, and prefilled that property when creating another listing.

At 1146 pixels, tree search for Willow House 6 displayed the United Kingdom, a Leeds branch with one matching property, and its leaf. The new-listing tree picker selected `property-052`, which is outside the initial 25-result page.

Manual creation and editing worked without an AI call. Ctrl S created `FN-L025` with a manually written description and a price displayed as £1,250.50. Editor checks saved wording, opened the review confirmation with Ctrl Enter, copied the reviewed description, and preserved the text after reload. The custom discard modal's Cancel action preserved unsaved text during internal navigation.

The user explicitly enabled Nominatim for this local demo after reviewing its restrictions and alternatives. One actual public query for London returned Greater London and City of London results with OpenStreetMap attribution. Selecting a result updated the typed address and city. That unsaved experiment was discarded. No private address was used. The distributed `.env.example` keeps external location lookup disabled.

A separate official Google Maps link for Leeds city centre was saved without a Places API key. A bundled stock photo was uploaded through the real application, stored under its generated `/api/photos/*.webp` route, and displayed at approximately 286 × 192 pixels at 1146 pixels. Unsaved map-link edits survived the photo upload and were then saved. Fresh navigation preserved both the map link and processed photo. Manual mode enabled address and City editing. The City control rejected a one-character custom value and allowed Oxford to be selected; that experiment was discarded to preserve the saved Leeds location.

The reviewer inspected seven final captures at 1440, 1146, 390, and 320 pixels. The narrow property table fits its viewport and shows listing-count links beneath property names. Cards have distinct surfaces and visible count links in the dark theme. The 390-pixel editor places its completion actions immediately after the description, with a formatted currency field and the optional AI panel kept separate. The 1146-pixel property photo remains compact, and its saved map selection has no unsaved marker.

The primary browser session measured no horizontal document overflow at 320 or 390 pixels. Ctrl K still opened the hidden command palette. Ctrl Enter confirmed review, and clicking Copy produced the visible message "Description copied." Browser console checks reported no errors or warnings.

The final review caught low contrast in the light theme's soft success badge. The corrected status uses the official filled daisyUI success badge. Its browser-reported foreground and background tokens give approximately 5.09:1 text contrast, and the refreshed capture confirms readable Reviewed text. Semantic status and error blocks use filled framework colors. No material visual issues remain in the inspected captures.

## Repeat the checks

Use Node.js 24 or later:

```sh
npm test
npm run typecheck
npm run build
```

With the application running and a compatible authenticated Codex CLI available:

```sh
npm run test:live
```

The live script selects a draft, calls `/api/listings/[id]/generate` using its current versions, validates the proposal, and asserts that generation left the stored record unchanged.

Synthetic tests and observed local flows do not establish pilot business targets, full accessibility conformance, live-data processing approval, country rollout capacity, or on-device inference. Production authentication, immutable audit history, retention, backup recovery, and deployment controls remain pilot work.
