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
