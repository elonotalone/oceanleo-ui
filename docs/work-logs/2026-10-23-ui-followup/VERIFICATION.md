# Parent integration verification

Implemented the current operator's four-attachment follow-up in the shared UI and portal sources, preserving unrelated editor/backend/package changes. Existing routes and persistence APIs remain in use. No production/twin push, dependency change, browser automation, screenshot, or real-account data mutation was performed.

## Delivered behavior

- Project Tasks/configuration have bounded, independent scroll areas; composer remains beneath Tasks. Search/filter controls wrap without overlap. Removed the task privacy paragraph; Plan/Assets use header plus actions in editable empty states. Projects has a New project link; listing and creation no longer expose project-type categories.
- Listings/orders use per-list search and grid/list layouts, existing covers/category fallbacks, actions and order statements. Listing edit uses independent image/input cards and responds to pane width.
- Shared collection, Library and form selectors keep light borders for selected values, share menu presentation/keyboard behavior, and preserve disabled options/field metadata. Library sorting and file-site selection also use the common UI.
- Personal pages have four content-preserving presets, a settings sidebar, section management, actual desktop/mobile rendering, identity/theme editing, publication state, save/retry/discard protection and existing showcase/qualifications.

## Verified in the parent shell

- Shared project geometry and card interactions: 33/33; strengthened creation/card run: 4/4.
- Portal project layout/history/index/import suite: 37/37; final category-free creation/index suite: 10/10.
- Collection/select/Library initial suite: 59 passed and two new-test assertions corrected; corrected BayMenuSelect/form/calendar/header run: 19/19; visible Library sort and vetting run: 22/22.
- Combined listing, shared form consumers, profile documents, builder/public profiles and qualifications: **209/209**, no skips. TAP evidence: `/tmp/oceanleo-ui-followup-w27yjC/acceptance.tap` (38 seconds). Exact constituent suites are in the L and H journals.
- `leo-pnpm typecheck` passed for both `/root/projects/oceanleo-ui` and `/root/projects/oceanleo`.
- Shared package `leo-pnpm build` passed: generated `globals.css`/`ui.css` and final `tsc --noEmit`. Legacy listing grid/minimum-image-height CSS was aligned with the new cards.
- Scoped `git diff --check` passed.
- HTTP GETs at `p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com` returned 200 for `/projects`, `/projects/new`, the supplied project id, `/bay?bay=mine:published`, `/bay?bay=mine:page`, and `/library`.
- `oceanleo-dev-slots-fresh.sh`: both running com/cn slots FRESH(dev), zero STALE.

## Translation checks and unrelated repository findings

The personal-page and project/common-control dictionaries are registered through the existing Bay dictionary aggregator. A focused AST/registered-dictionary audit covered 33 changed page/control files, 402 keys and all 17 locales: zero missing translations, with interpolation placeholders preserved.

Full-repository `i18n-tt-key-coverage` exposes unrelated existing LeoAssistant realtime-call strings and obsolete historical editor gap registrations. Those unrelated sources/baselines were not edited. The optional public API snapshot check also reports an existing mismatch; this task does not edit any package/public entrypoint export declarations. These are separate from the passing task-specific type/behavior checks.

No browser visual measurement was authorized or claimed; layout acceptance uses the supplied screenshots, the actual flex/grid/scroll chain, generated CSS, DOM interactions, type checks and HTTP/dev-slot checks.
