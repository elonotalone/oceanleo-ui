# W06 state — legacy video node fidelity

Updated: 2026-10-22 (Asia/Shanghai)

## Current facts

- Bootstrap completed. The IO guard reported high cgroup pressure and requested no additional heavy task; focused tests will use `run-light` only.
- `/root/projects/video` remains on `main`, now at W06 commit `cf00d30` (`ahead 19, behind 2`). W04 has uncommitted work in `project-model.ts`; it remains outside W06 staging. Do not rebase or reset.
- `/tmp/w04-video-source.bin` is JSON with SHA-256 `a9cf73ccd3ac858cdac83e09d7b616e8ebabfd715b65563dfb5c28c72fcd8b31`.
- Its nine graph nodes carry named port declarations (`video`, `audio`, `image`, `main`, `titles`, `base`, `logo`, `music`) and legacy values in `params`; the imported node model preserves the exact source under `legacySourceNode`.
- `LeoNode.tsx` currently renders one generic `in-media` target and one generic `out-media` source. The command registry currently enables generation based on mapped v2 `kind` without checking `legacySourceNode`.
- The OceanLeo navigation slice identifies the `video-durable-run` adapter chain. `oceanleo-nav impact` reports the three owned legacy renderer/command files as `unmapped=true`.
- W04 owns project-model and workflow projection. W04 confirmed the exact interface contract, and `CanvasNodeViewData.legacySourceNode?: Record<string, unknown>` is now visible in the shared worktree. `use-canvas-workflow.ts` still needs the view-data copy before app wiring is complete.

## Current reproduction / evidence

- Read-only inspection of the actual source shows nine nodes and nine edges; `jq` reports the original handle names and active scalar/object params.
- `LeoNode.tsx` `Ports` emits only `in-media` / `out-media`; source views cannot identify the original handle names or per-port direction.
- `commandAvailability` delegates directly to each command definition, and `executeCanvasCommand` reaches provider receipt/handler paths without a legacy-source guard.
- W06 code/test commit `cf00d30` covers only `LeoNode.tsx`, `command-registry.ts`, `canvas-selection-adapter.ts`, new `legacy-workflow-node.ts`, and new `tests/legacy-workflow-node.test.mjs`.

## Focused baseline

- Command: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --experimental-strip-types --test tests/legacy-workflow-node.test.mjs`
- Result before implementation: 0/4 passed. Runtime assertions reproduced the generic `in-media`/`out-media` ports, missing legacy parameter controls, available legacy video generation, and generation controls in the legacy selection context. No provider adapter was invoked.

## Focused implementation result

- Added real legacy renderer handles/params, safe bounded local edits, no-cost provider/run rejection, normal-v2 regression controls, and legacy selection action filtering.
- Focused actual-source runtime test: 4/4 pass via `run-light`; see W06 journal for command and coverage.
- Next: rerun after W04 view-data copy lands, then write W06 delivery and commit only the W06 evidence paths in the UI repo.
