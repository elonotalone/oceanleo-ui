# Library and editor repair integration

## Outcome and scope

Preserve the complete private Library and active preview/editor across same-user auth refresh and browser visibility changes. Menus execute editor commands without participating in toolbar dragging. Autosave acknowledges durable edits promptly; panel resizing preserves media proportions and toolbar positioning does not insert a jumping dock row.

## Evidence before edits

- LeoDev portal URL in operator screenshots responds HTTP 200 (0.209 s measured server response; not a measure of client editor startup).
- `oceanleo-library --target dev list -n 50` returns 50 entries, including screenshot artifact `4ef0e9c9-2311-4cba-92a8-1bb644bc22b5`. Backend data is present.
- Shared UI baseline `tsc --noEmit` passes.
- Portal and video slots are live, source-linked, and report FRESH(dev).
- Browser logs contain lock-steal aborts followed by Library session/fetch errors.

## Implementation direction

Retain the adopted Supabase client, browser Web Locks, shared React toolbar/portal layer, Fabric and other existing editor cores, and typed persistence pipeline. Fix the incorrect identity boundaries, event targeting, and save scheduling at their owners.

Alternatives considered: replacing auth/editor providers would introduce migrations and duplicate ownership without addressing the observed state transitions; periodic polling/remounting would keep interrupting edits and increase request load. Neither is necessary. The chosen path uses the installed upstream/core APIs and existing schemas, with no new service, dependency, hardware or network topology.

Falsifiable assumption: the Library actually contains multiple files and its loss is in browser state/request recovery, rather than absent durable rows. The development Library helper disproves absent rows by returning 50 existing entries. The browser-event and request tests must additionally prove that same-user refresh and transient errors retain mounted state without violating account isolation.

## Independent acceptance

The parent reviews every returned diff, runs the delivered tests plus related existing gesture/command/persistence/Library suites, runs shared and affected adapter typechecks, regenerates shared CSS, and checks live source freshness. No browser automation or visual capture is authorized by this task; supplied screenshots are reference inputs. No OceanLeo production release is authorized. Twin sync follows the workstation policy only after verification.

## Ownership

- library: Library state, complete list/cache, sorting/search, auth/request/upload recovery, preview-to-edit handoff.
- toolbar: shared gesture targeting, dropdown command interaction, top toolbar/dock behavior.
- layout_save: durable autosave timing, editor-panel layout and proportional resize, compact zoom controls.
- parent: integration, generated CSS, dependency/version metadata, independent verification and twin handoff.

Existing unrelated oceandino worktree edits are excluded from this task.

## Parent verification checkpoint

- Independently reran Library and upload recovery: 129/129 passing across eight suites, including same-account refresh, complete pagination, owner isolation, favorites-page failure, upload identity/progress/retry and preview handoff.
- Shared UI final-source typecheck passes; public API snapshot check, domain-boundary check (7,808 import/export edges), and all 35 consumers' exported-subpath scan pass. All 35 installed Supabase peers export the lock-timeout class used by the fix.
- Shared command DOM regressions execute image and video menu actions through real toolbar components; existing drag/double-press/collapse regressions remain included in final integration.
- The independent 13-plugin adoption gate passes 11/11 after updating its stale source assertions to follow the existing extracted agent-button component and page-aware toolbar gate. Only that test file was committed in oceandino; existing unrelated documentation edits were preserved.
- Shared UI, design and website typechecks pass. Design and website LeoDev slots use current linked UI and return HTTP 200 (warm home responses 0.44s and 0.24s respectively). These server timings are not browser preview-to-edit measurements.
- A regression found that local emergency recovery could remain unsaved without a new person edit. The follow-up explicitly promotes only a successfully restored local revision and clears its marker only on a durable, identity-matched receipt; generic hydration remains excluded. A second regression traced duplicate publication to a new source-item lifetime taking back the old item's draining controller. The background-controller key now includes the source item's identity. Owner's focused recovery tests pass 5/5; the parent includes them in the final independent batch.
- The post-follow-up shared UI typecheck passes. The extra portal check while source-linked exposes nominal peer-type conflicts (UI checkout Supabase 2.108.1/Next 16.2.9 versus portal 2.108.2/16.2.6); `--preserveSymlinks` does not solve those nested dependency identities and is not treated as a passing gate. No application types or dependency pins were weakened to hide this. Portal's final tagged-package build will be verified in the workstation twin deployment, where peers resolve in the consumer's installed package graph.
- All four LeoDev slots now report FRESH(dev), with live design/website/video embed addresses; the portal retains the operator's existing capability URL. Video typecheck passes and its warm home HTTP response is 200 (0.20s).
- Resource note: an earlier suite was terminated under I/O pressure, not counted as a pass. Unused test slots were stopped, then restarted serially for current-source checks; the operator's active portal slot was preserved.

## Final independent local acceptance

- 54 test files: **485 passed, 0 failed, 0 skipped** (84.3s), including the final local-recovery lifecycle, undo-after-save, actual popup commands, all requested Library states and upload network fallback. The separate cross-repo adoption gate also passes 11/11.
- Final shared UI `tsc --noEmit`, generated theme/CSS build, public API snapshot check and `git diff --check` pass. Design, website and video source-linked typechecks pass. All 35 consumer export scans pass.
- All four LeoDev slots were serially refreshed and report FRESH(dev), 0 STALE. No browser visual/interaction test was authorized or run; DOM/runtime tests and HTTP checks are the evidence, not a claim of measured browser animation or preview-to-edit latency.
- Converged package version: `0.233.78`. Workstation-only handoff uses the approved `--only oceanleo` pin and portal main; no consumer-wide release or oceanleo.com promotion.
