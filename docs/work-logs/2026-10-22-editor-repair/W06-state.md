# W06 state — legacy video node fidelity

Updated: 2026-10-22 (Asia/Shanghai)

## Current facts

- Bootstrap completed. The IO guard reported high cgroup pressure and requested no additional heavy task; focused tests will use `run-light` only.
- `/root/projects/video` remains on `main`, now at W06 test commit `c71a559` (`ahead 20, behind 2`). W04 has uncommitted work in `project-model.ts`, `use-canvas-workflow.ts`, and `tests/canvas-workflow.test.mjs`; it remains outside W06 staging. Do not rebase or reset.
- `/tmp/w04-video-source.bin` is JSON with SHA-256 `a9cf73ccd3ac858cdac83e09d7b616e8ebabfd715b65563dfb5c28c72fcd8b31`.
- Its nine graph nodes carry named port declarations (`video`, `audio`, `image`, `main`, `titles`, `base`, `logo`, `music`) and legacy values in `params`; the imported node model preserves the exact source under `legacySourceNode`.
- The OceanLeo navigation slice identifies the `video-durable-run` adapter chain. `oceanleo-nav impact` reports the three owned legacy renderer/command files as `unmapped=true`.
- W04 owns project-model and workflow projection. The `CanvasNodeViewData.legacySourceNode?: Record<string, unknown>` field and `projectToFlow` source copy are now present in W04's shared, uncommitted `project-model.ts` work. W06's test reaches this real projection without manually supplying the field.

## Current reproduction / evidence

- Read-only inspection of the actual source shows nine nodes and nine edges; `jq` reports the original handle names and active scalar/object params.
- Baseline reproduction found `LeoNode.tsx` rendered only `in-media` / `out-media`, and provider/generation availability and execution did not guard `legacySourceNode`.
- W06 implementation commit `cf00d30` covers only `LeoNode.tsx`, `command-registry.ts`, `canvas-selection-adapter.ts`, and new `legacy-workflow-node.ts`. Focused projection regression commit `c71a559` covers only `tests/legacy-workflow-node.test.mjs`.

## Focused baseline

- Command: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --experimental-strip-types --test tests/legacy-workflow-node.test.mjs`
- Result before implementation: 0/4 passed. Runtime assertions reproduced the generic `in-media`/`out-media` ports, missing legacy parameter controls, available legacy video generation, and generation controls in the legacy selection context. No provider adapter was invoked.

## Focused implementation result

- Added real legacy renderer handles/params, safe bounded local edits, no-cost provider/run rejection, normal-v2 regression controls, and legacy selection action filtering.
- Focused actual-source runtime test: 4/4 pass via `run-light`, including exact `legacySourceNode` equality through `projectToFlow`; see W06 journal for command and coverage.
- W06 delivery is recorded in `W06-delivery.md`; W06 state, journal, and delivery are committed separately from W04 evidence.

## Test-only integration follow-up

- Parent authorized W06 to own `tests/workflow-history-hook.test.tsx` and the narrow loader adaptation in `tests/canvas-workflow.test.mjs`; W04 retained all product paths. No video product files were staged in this follow-up.
- Follow-up commit `2573f3e` contains only those two test files. The canvas test file also preserves W04's earlier migration/save assertions, as W04 requested; no W04 source file is part of the commit.
- The actual `useCanvasWorkflow` test now covers a clean hosted load, edit-to-dirty, private source/preview staging only, failure correlation (`VIDEO_SAVE_FAILED` plus save ID), same/wrong/seen-old revision receipt rejection, newer edits staying dirty until matching receipt, and reopen with current revision grants but no persisted runtime locator.
- The same hook harness exercises A-slow/B-fast dependency loading: A has one completed media URL and one delayed dependency, B opens and wins, then A's late completion is discarded and the old URL is revoked without replacing B's project or asset projection.
- Focused final results: `tests/workflow-history-hook.test.tsx` 2/2 pass; `tests/canvas-workflow.test.mjs` 18 pass, 0 fail, 1 opt-in actual-source skip. Exact commands are recorded in the journal and delivery.
- No browser/Playwright, full suite, full typecheck, build, install, production path, deployment, or push was run. Parent retains shared/full integration verification.

## Test typing follow-up

- Parent's final video typecheck identified test-only type errors in `workflow-history-hook.test.tsx`. W06 corrected the `Response` body to an owned `ArrayBuffer`, explicitly typed staged attempts, and replaced uninitialized hook access/optional-field assumptions with guarded accessors and assertions. No `ts-ignore`, non-null assertion, or skipped check was added.
- Focused hook runtime remains 2/2 pass. A scoped direct-file TypeScript check produced no diagnostic for this test file; it exited with errors in imported OceanLeo UI code (duplicate React ref types and a missing xterm CSS declaration). The full project typecheck remains with the parent after W04 convergence.
