# UI follow-up: projects, listings, and personal pages

The operator's current request (2026-10-23) is implementation. Four supplied images show project overflow, a covered task search field, plain listing rows, and inconsistent dark select borders. Work finishes in the existing oceanleo LeoDev slot, https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/. No production or twin deployment and no browser/Playwright/screenshot automation have been authorized for this task.

## Ownership

- P: project pages and shared project geometry; see P-projects.md.
- L: mine listings and listing edit form; see L-listings.md.
- H: personal page builder and its public rendering; see H-profile.md.
- Parent: shared collection/select controls, Library alignment, cross-owner interfaces, generated CSS, integration, type checks, focused verification, final local commits and dev-slot freshness.

Agents share the filesystem. Do not stage, commit, revert, or edit another owner's paths. Existing editor-overhaul changes, leobay-projects evidence, portal package files, and backend work belong to other work. Read the live kernel, workstation instructions, and matching task packs, then run bootstrap before task operations. Use apply_patch for all edits. Heavy jobs must use agent-io-guard.sh run-heavy; focused tests use run-light. Do not install dependencies, run global builds/typecheck, change package manifests, or push. Return changed paths and concrete verification commands/results. Keep a short journal in this directory. Parent collects and verifies all deliveries within this turn.

## Cross-owner contracts

The parent owns src/shell/collection-chrome.tsx, src/shell/menu-select.tsx, src/shell/bay/shell/BayFilterSelect.tsx, src/shell/bay/form/BayMenuSelect.tsx and form-ui.ts. All selects should show a white surface, light neutral border, current value and chevron; selected values never gain a black border. Use the existing exported MenuSelect/CollectionFilterSelect/BayFilterSelect, without changing their public props.

L owns BayMine.tsx and mine/*; H owns ProfilePane.tsx and page/*, so their integration is through the existing MinePane ProfilePane props. P owns shared project-workspace.tsx; preserve ProjectTabNav and the existing frame API used by BayMine.

If new translated copy is necessary, each owner may create only src/i18n/ui/messages/ui-followup-{projects,listings,profile}-copy.ts matching its owner, exporting a normal UI message dictionary. Do not modify messages/index.ts; tell the parent how to register it. Reuse existing translated strings where possible.

## Acceptance

Tasks and Project configuration independently scroll and keep the task composer visible. Plan and Assets have the same upper-right plus affordance as other configuration cards, including empty states. The privacy paragraph is gone. Search does not overlap filters. Projects has a working New project link and no project-type categories. Listings have Library-style search and list/grid views with meaningful covers and empty states. Listing edit has a distinct upload card beside its input sections and uses the common menu selection UI. My page becomes a usable personal page builder with coherent templates/customization, real preview, editable content, working save/cancel and existing persistence/ownership preserved. Shared controls and Library match without dark selected borders.
