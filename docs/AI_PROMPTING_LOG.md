# AI steering log

These are representative instructions and corrections from this rebuild. They do not reconstruct another agent's private prompts or claim that the work took 85 minutes.

## 1. Establish the scope and architecture

The original user request was:

> I have drafted an app for assignment, I need from you a few things - deslop the documents, and rebuild the prototype with Taste for UI in Next.JS as monolith application taking the backend draft from another agent.

The assignment brief remained the requirements source. Part A and Part B were edited within their one-page and two-page limits. Fieldnotes supplied the initial UI and workflow draft, while Property Listing Assistant supplied the backend draft. The implementation kept UI, API, domain rules, and model integration separate inside one Next.js application.

The user then specified:

> Use local Codex for real AI queries, but keep it a separate AI adapter.

That instruction produced `CodexListingProvider`, with a separate optional OpenAI-compatible adapter and a deterministic test adapter. Local CLI execution was not described as on-device inference or proof of data residency.

## 2. Correct the domain model and writing workflow

The user identified the central design mistake:

> properties are the physical description for the property, I think we need to separate a Listing to it's own concept.

The user also rejected the AI-dependent editing path:

> The current description editing functionality technically works, but it implies AI-only use.

The revision separated physical facts from the marketing listing. Listing owns title, description, rent or sale purpose, price, currency, status, and revision. Property facts have their own version. Manual creation, editing, saving, and review work without AI. A generated description is an optional proposal that the agent must explicitly apply and save.

The implementation instructions required server-side SQLite persistence, HTTP 409 for stale writes, and transactional review invalidation when property facts change. These requirements replace the earlier browser-only draft and review model.

## 3. Replace presentation choices with usable controls

The user requested:

> aside from card view the default view should be a table view with server-side pagination, filters and search.

The same feedback asked for a stable UI framework, keyboard shortcuts, searchable selections, appropriate controls for typed values, and simple light and dark themes. The follow-up asked for the framework's skill.

The rebuild uses the official daisyUI skill, reads its component guides before selecting components, and keeps shared styling rather than inventing new controls. Property tables use server-side queries. Purpose, status, currency, property type, and amenities use their canonical types. The writing interface gives manual editing the primary path. Short labels replace slogans and redundant explanations.

A later live review refined these controls again. Bedroom thresholds became compact segments, money used a formatted currency field without steppers, and the property catalogue gained count links and hierarchical navigation. The visible Commands and help buttons were removed while keyboard access remained. The property editor gained a smaller photo panel, persistent uploads, and explicit manual or map-based location entry. These were changes to the current screenshots and workflow, not a new visual direction.

The user explicitly chose to enable Nominatim for the local demo after the [provider policy](https://operations.osmfoundation.org/policies/nominatim/) and alternatives were presented. The distributed example leaves lookup disabled. Manual location entry and official Google Maps links work without a key; public lookup requires an explicit submitted query and its own rate, cache, identification, and attribution controls.

## 4. Reject inherited assumptions and verify the revision

The later feedback corrected two assumptions in the first rebuilt UI: that one property should own one description, and that generation should be the entry point to writing. The entity and persistence model were changed before polishing the replacement screens. Screenshot review then identified mobile actions located too far above the description; completion actions were added below the mobile form. Browser storage is no longer the authoritative listing or review record.

Earlier checks of saved browser drafts do not verify the replacement SQLite workflow. The verification record must report fresh persistence, concurrency, review, keyboard, responsive-layout, and live-model checks. Passing tests with a deterministic provider must stay separate from real inference results.

The supplied backend's automatic 2.52 GB model download was also rejected. Application startup does not install a model, and a failed real call cannot fall back to a canned response.

## Skill sources

- Taste entry and frontend engineering workflows from the installed Engineering Suite Taste plugin guided the initial UI rebuild.
- The unslop skill guided the document edits and application copy.
- Official daisyUI skill: [daisyui.com/SKILL.md](https://daisyui.com/SKILL.md). The working copy is `work/skills/daisyui/SKILL.md`, obtained from the official [saadeghi/daisyui repository](https://github.com/saadeghi/daisyui). The applicable installation, usage, theme, and component guides accompany it.

## Review responsibility

AI generated code and document edits under these instructions. Review focuses on entity ownership, persistence, version conflicts, exact review invalidation, field forwarding, server-only credentials, model validation, and the difference between an AI proposal and saved wording. Final commands and observed results belong in the verification record.
