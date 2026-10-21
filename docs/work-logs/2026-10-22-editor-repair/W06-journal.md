# W06 journal — legacy video node fidelity

## 2026-10-22 — setup and reproduction

- Ran `/opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh` before repo reads. Bootstrap passed and reported high IO pressure; heavy verification is deferred to the parent, with focused W06 tests routed through `run-light`.
- Read the safety kernel, workstation instructions, `_COMMON.md`, `00-dispatch.md`, W06 book, video `AGENTS.md`/`README.md`, the OceanLeo/parallel-rollout/architecture-debug/deploy packs, OceanLeo code map, and the referenced LeoVideo canvas architecture document.
- `python3 scripts/oceanleo-nav slice video-durable-run --explain` returned the adapter chain. `impact` marked the three owned legacy renderer/command files `unmapped=true`.
- Confirmed `/root/projects/video` was `main` at `ad654c7`, ahead 18/behind 2. No rebase/reset or remote operation was performed. The parent and W04 are working in this same repo; their paths are excluded from W06 staging.
- Inspected `/tmp/w04-video-source.bin` as JSON data only; its SHA-256 is `a9cf73ccd3ac858cdac83e09d7b616e8ebabfd715b65563dfb5c28c72fcd8b31`. It contains nine nodes, nine edges, named handles, numeric/scalar parameters, and a nested `overlay.params.logo` object.
- Direct inspection reproduced the gap: `LeoNode.tsx` exposed only `in-media`/`out-media`; the central availability and execution paths had no legacy-source check.
- Sent W04 the view contract `legacySourceNode?: Record<string, unknown>` and received confirmation that W04 will pass that preserved field into the view data. No W04-owned files were edited.

## 2026-10-22 — red baseline

- Added `tests/legacy-workflow-node.test.mjs` using the pinned actual source JSON and runtime rendering/command execution.
- Ran `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --experimental-strip-types --test tests/legacy-workflow-node.test.mjs` before the fix: 0/4 passed. The failures reproduced generic ports, missing parameter controls, enabled legacy generation, and v2 generation actions in the legacy selection context. No provider adapter was called.

## 2026-10-22 — implementation and focused verification

- Added `legacy-workflow-node.ts` as a data-only projection helper; it reads source kind/ports/params, supplies strict edit ranges for known scalar values, updates only declared legacy fields, and classifies unsupported provider/run commands.
- Updated `LeoNode.tsx` to use a React Flow node view for retained legacy data, render original named input/output handles with accessible labels and per-side positions, show all original params as text/form values, keep unsupported/non-scalar values read-only, and display the full source JSON as collapsed React text.
- Updated `command-registry.ts` so legacy provider/generation/Run commands are unavailable and rejected before receipt or handler paths with a no-cost result. Added a bounded local parameter command; title and position updates now also update original legacy source fields. Normal v2 generation remains registered.
- Updated `canvas-selection-adapter.ts` to keep legacy title/position/delete controls and omit v2 generation/retouch/timeline actions that are not the legacy editing surface.
- Focused test result after implementation: 4/4 passed with `run-light`. It covers exact handle ID/direction/ARIA/top position against all actual source nodes and edges, param visibility, hostile markup as text, title/position/trim edits and project JSON round-trip, stale/read-only/out-of-range negatives, no legacy video or Run adapter calls, native v2 video generation through a stub adapter, unchanged native v2 `in-media`/`out-media`, and legacy selection-toolbar filtering.
- The test runner prints the existing `react-test-renderer` deprecation warning; no failures or unexpected provider calls occurred.

## 2026-10-22 — actual view projection verification

- W04 landed the `CanvasNodeViewData.legacySourceNode` field and copied the retained source in `projectToFlow` in its owned `project-model.ts` worktree change.
- Updated the W06 test to leave `legacySourceNode` out of its `makeViewData` callback and instead obtain all rendered source nodes through the real `projectToFlow`; each projected view is asserted equal to its original retained node data. The edit and native-v2 controls also render through that projection helper.
- Reran `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --experimental-strip-types --test tests/legacy-workflow-node.test.mjs`: 4/4 passed. An initial rerun failed because the renderer test used a different command environment instance; the test helper was corrected to share the caller's environment, then all four tests passed.
- W06 source/test commits are `cf00d30` and `c71a559`; UI evidence commits are `411377a2` and the final W06 delivery record.

## Current boundary

- W04's source copy is in its owned `project-model.ts` worktree change and is verified by W06's focused actual projection test. W04 owns its commit and the associated save/dependency wiring.
- No browser, production path, install, full typecheck, full suite, build, or deployment was run. Parent owns shared/video typechecks and integration acceptance.
- The focused test reads the exact source fixture at `/tmp/w04-video-source.bin`; this is intentional for the current actual-source acceptance run and is recorded with its pinned SHA.
