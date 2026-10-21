# Editor repair — 2026-10-22

Operator asks to fix: design load error, widespread saving failures, Library editors opening the agent automatically, useless edit-bar pin, poor agent icon, blank spreadsheet icons, redundant AI-only edit-tools panel, video migration/load failure and missing autosave. All child agents explicitly gpt-6-luna / max; no fast mode. Parent owns integration and acceptance. Available concurrency is parent + three children, therefore five disjoint delivery units queue at capacity; do not merge unrelated hot-file clusters to hide the limit.

## Ownership

- W01 chrome: Library/editor panel state and common edit-bar chrome (SelectionToolbar, selection-toolbar-chrome, InlineAdvancedWorkbenchShell, associated layout hooks, plugin-chrome, FloatingContextToolbar, new EditBarAgentIcon). Do not edit AdvancedEditorIcon or grid-univer files (W05), persistence (W02), design conversion (W03), video carrier (W04).
- W02 save: common persistence, doc-io and artifact save/registration API. Does not own InlineAdvancedWorkbenchShell, editor implementations, design/video converters or package/lock files.
- W03 design: shared design-composite-commit + DesignCanvasLocalRoute and design repo loading/conversion/save-handshake implementation. Does not own shared chrome, generic persistence or grid/video code.
- W04 video: workflow-carrier + VideoCanvasRoute and video repo gallery-editor/canvas load/migration/autosave. Does not own generic persistence, shared chrome, design/grid code.
- W05 sheet: grid-univer/GridUniverStage and AdvancedEditorIcon icon coverage/geometry. Does not own agent glyph (W01 new component), shared SelectionToolbar/chrome or persistence.
- V01: independent delivered-change review and regression acceptance across the five clusters, queued after implementation dependencies at the three-child limit. Own evidence only; no product modifications. Parent additionally checks artifacts/typecheck/named tests in its own shell as the authoritative kernel explicitly requires (`subagents.verify-before-trust` takes precedence over the playbook's parent-verification prohibition).
- V-parent: kernel-required artifact/type/test checks, safe dev HTTP/API paths, start/rebuild dev slots and freshness; arbitrate interfaces without duplicating a live implementation owner.

## Decision and proof

Keep adopted Fabric/designcombo/Univer/Umo cores and repair their documented source/revision and shell contracts. This retains data, native capabilities and existing dependencies on this CPU-only host. Alternatives considered: loosen validators/ignore receipts (few parts but hides corruption and data loss); replace editor cores (new integration and migration surfaces, breaks mature editor APIs). Neither addresses a safe durable workflow. No new provider or editor engine.

Falsifiable premise: real valid stored files and ordinary edits can be read and durably saved through existing adopted cores without weakening malformed-source, identity, revision or auth rejection. Each owner first reproduces their failure in a focused runtime/fixture test and records the command; then implements the causal repair and includes negative controls.

## Evidence already read by parent

Screenshots: /root/oceanleo-inbox/20261021T162842Z-image.png design package element[0] invalid; 163031Z save failure in document; 163754Z blank spreadsheet tools; 163836Z AI-assistant-only Edit tools; 164101Z video v1 migration failed with one issue. All URLs are Library on p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com.

Initial repos: oceanleo-ui main clean ahead15; design main clean; video main clean ahead17 behind2 (preserve history, no rebase/reset); oceanleo main ahead3 with unrelated changes in package.json, pnpm-lock.yaml, .github/workflows/oceanleo-cn-frontend.yml and untracked backend/scripts/retire_operator_examples_20261021.py. oceandino has unrelated docs/work-log changes; do not touch them.

Read code map and nav slices typed-artifact-editing/plugin-unified-chrome/video-durable-run before scoped searches. Parent confirmed concrete files in each task book. Shared UI affects every inventory consumer; dev preview links local package, no distribution authorized. Each owner runs nav impact for files before changing them and records unmapped=true if returned.

## IO budget

Five implementation books, three concurrent children, zero all-project scans; searches scoped to each named cluster. Focused tests via run-light. Parent owns one serialized shared typecheck through run-heavy; children request it instead of each launching it. No installs, production builds, release pins or external deploys. Native current images may be viewed; no browser or UI automation authorized.

## Queue and handoff

Initial W01/W02/W03; then W04/W05 as slots free; V01 after implementation delivery so it has concrete results to verify. Each unit has its own journal/state/delivery, commits only explicit owned files on main and returns exact file list, commit, tests, remaining uncertainty. Parent collects all units before final response.

Boundary clarifications: W01 also owns `material-library-standalone.tsx` and its host-specific tests (automatic chat source found there). W02 may change RichDocHostedRoute/EmbeddedRoute save/recovery handshake and focused tests; generic save source trace remains its exclusive responsibility.
