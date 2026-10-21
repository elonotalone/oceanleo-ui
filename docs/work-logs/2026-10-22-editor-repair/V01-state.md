# V01 state — independent editor repair acceptance

Updated: 2026-10-22

## Scope and guardrails

- Independent acceptance only; no product/test implementation changes.
- Write scope is limited to V01 evidence files in this work-log directory.
- No browser, UI automation, production request, deployment, install, or full suite.
- Parent owns shared/typecheck and named-test reruns plus isolated dev API receipt checks; V01 avoids duplicating those commands.
- UI worktree is on `main`, `HEAD=dfeec117`; W04 state/journal remain untracked and are not V01-owned. Video repository is on `main`, `HEAD=ad654c7`. Review is pinned to delivered commits below; parent owns any further shared tests/typecheck.

## Delivered set under review

- W01 shared UI: `cae64416`, `07bf3412`.
- W02 shared UI: `7d3945a2`, `c5e2ffc7`, `dfeec117`.
- W03 shared UI: `54c4b6fd`, `9b938cd3`; parent integration/evidence: `4e29e328`.
- W03 design repository: `3150851c8eddb2f5f7d8552ad6f0859ae33f6139`.
- Freeze marker: `35190d79`.

## Current findings

- Required bootstrap passed. Read the live safety kernel, workstation guidance, OceanLeo/parallel-rollout/architecture-debug packs, code map, editor shell and adopted-core plans, and the `typed-artifact-editing` / `plugin-unified-chrome` navigation slices.
- Parent reports W03 synthetic and actual-source checks and named tests complete. V01 is independently reviewing changed source, compatibility fidelity, failure controls, and evidence limits.
- No V01 verdict is ready yet. W02's reproduced cross-item host/native save writes are closed by the committed scope fix and positive-path replay. W04 active node/port/parameter/asset projection and durable save receipt integration remain open.

## Independent checks completed so far

- W01 parent-owned focused results were checked against the delivered source: Library/Task-history 4/4, common chrome 40/40, and v8/image 11/11. Source review confirms a standalone Library edit goes through the common `MaterialStandaloneEditor` → `TaskFileWorkspace` path with its agent initially hidden, while the prop default preserves existing Task/history behavior. The explicit button reveals/closes/reopens the mounted conversation. All three shared edit-bar agent entry points use `EditBarAgentIcon`; `EditBarPinButton`/`data-edit-bar-pin` are absent from the owned chrome source, while keyboard/drag/dock/collapse logic remains. The real Library runtime covers a document; image runtime covers image. Other standalone editor types share the same wrapper but did not receive separate Library-open runtime evidence. Tool/drawer fallback and working panel behavior were source-reviewed and covered by shared plugin chrome tests, not by a per-editor-family opening matrix.
- W02's original delivered fix passed an independent local-harness counterexample for host cache capture IDs: after A→B and reused revision 1, A and B cache IDs differ; delayed A snapshot is ignored; B `flush()` requests its own save snapshot and only B payload is persisted to item B. Exact command was a `run-light` inline Node script importing `tests/e9-richdoc-harness.mjs`; output: IDs `rd-cache-rd-mvif1kq4-3nb0mf-0-1-1` and `rd-cache-rd-mvif1kq4-3nb0mf-1-1-2`, `resultOk=true`, only call `document-B` / `B-payload`.
- That check exposed a distinct W02 native Umo race: delayed `umo-save-*` snapshot from A could pass the trusted message gate after A→B, with same revision 1, because the protocol instance was stable across items. The pre-fix independent replay persisted `delayed-native-A` under `document-B` and returned `ok:true`; Umo creates native IDs as `umo-save-${Date.now().toString(36)}` and sends JSON+revision in `recovery-snapshot`. W02 follow-up `dfeec117` rotates protocol `instanceId` by item key and guards send/receive callbacks against the render-to-effect-cleanup scope gap. Independent rerun: A's former instance and `umo-save-origin-A-7` caused no write/no `save-result`; current B native `umo-save-current-B-8` at revision 1 received `ok:true`, and the only persistence call was `document-B` with `{type:"doc",text:"current-native-B"}`. W02 reports its focused route suite 14/14. This closes the reproduced cross-item native path without disabling the native save path.
- W03: parent source/revision/closure evidence and named test results were reviewed. An independent `run-light` inline normalization/field comparison against the exact pinned `/tmp/library-repair-20261021/design_canvas/source.bin` found 51/51 layers (rect20/ellipse5/text26), 0 field mismatches for ID/order, geometry, z, effective opacity, shape kind/fill/stroke/radius, and text/text color/font family/size/weight; `sourceCarrier` compared equal. Source has 0 assets and 0 decorative flags, text family `Noto Sans CJK SC`. Thus actual asset resolution, accessibility decoration, align/lineHeight overrides, and browser/pixel/font availability are not established by this file. The synthetic handshake tests directly assert only some of these mapped style fields; the remaining adapter mappings are source-reviewed.
- W05 commit `2b4252be` and delivery `88726358` were reviewed read-only. Parent reports 58/58 focused grid cases. Source mapping covers all generated runnable L1/L2 controls and shared-control SSR asserts non-empty SVGs for cell/range toolbar controls; the unknown-icon fallback has a negative control. Residual quality note: sort asc/desc share the same list glyph and number-format variants share font-size; labels remain exposed, so the blank-glyph issue is fixed but glyph-only semantics are not fully distinct.
- W04 load commit `ad654c7` was reviewed read-only; the save-path delivery remains active and whole-task acceptance is not ready. Against the exact actual source `/tmp/w04-video-source.bin` (SHA `a9cf73ccd3ac858cdac83e09d7b616e8ebabfd715b65563dfb5c28c72fcd8b31`), an independent direct `migrateV1Workflow` projection returns 9 nodes/9 edges/3 assets, but active semantic fidelity is not established by sidecar round-trip alone. All three mapped assets have no `url` or `previewUrl`; only `legacySourceAsset` is present. Active node properties promote generic kinds/positions/asset IDs, title text and durations, while actual trim start/end, branch mode, title style/timing, overlay logo/opacity, mix gain/fades, and output width/height/fps/format remain only under `legacySourceNode`. Edge handle strings (`main`, `titles`, `base`, `logo`, `video`, `music`) are copied unchanged, while shipped `LeoNode.Ports` emits fixed `in-media` / `out-media` handles. Parent independently verified the three exact private media dependencies by owner-bound dev API (HTTP 200, MIME/size/hash matched); byte availability is not yet proof those references reach active core assets. W04 must close or explicitly bound these gaps and complete durable save receipt wiring.

## Next

1. Recheck any W04 follow-up against active asset material, port names, node parameters, references and the durable saveId/dirty/receipt contract; do not duplicate parent-owned suites/typecheck.
2. Add the final commit-pinned checklist, residual defects, evidence limits, and verdict after the W04 save delivery is available.
