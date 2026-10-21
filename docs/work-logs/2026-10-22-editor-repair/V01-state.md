# V01 state — independent editor repair acceptance

Updated: 2026-10-22

## Scope and guardrails

- Independent acceptance only; no product/test implementation changes.
- Write scope is limited to V01 evidence files in this work-log directory.
- No browser, UI automation, production request, deployment, install, or full suite.
- Parent owns shared/typecheck and named-test reruns plus isolated dev API receipt checks; V01 avoids duplicating those commands.
- Worktree is on `main`, `HEAD=35190d79`. W04/W05 implementation paths and their state files are active/uncommitted; review is frozen to the delivered commits below until their deliveries arrive.

## Delivered set under review

- W01 shared UI: `cae64416`, `07bf3412`.
- W02 shared UI: `7d3945a2`.
- W03 shared UI: `54c4b6fd`, `9b938cd3`; parent integration/evidence: `4e29e328`.
- W03 design repository: `3150851c8eddb2f5f7d8552ad6f0859ae33f6139`.
- Freeze marker: `35190d79`.

## Current findings

- Required bootstrap passed. Read the live safety kernel, workstation guidance, OceanLeo/parallel-rollout/architecture-debug packs, code map, editor shell and adopted-core plans, and the `typed-artifact-editing` / `plugin-unified-chrome` navigation slices.
- Parent reports W03 synthetic and actual-source checks and named tests complete. V01 is independently reviewing changed source, compatibility fidelity, failure controls, and evidence limits.
- No V01 verdict is ready yet. The main open review points are: W01 launch/toggle coverage across standalone Library types and working panels; W02 latest-generation save/retry/settlement edges; W03 field-level rendering fidelity and fail-closed unsupported shapes/assets.

## Independent checks completed so far

- W01 parent-owned focused results were checked against the delivered source: Library/Task-history 4/4, common chrome 40/40, and v8/image 11/11. Source review confirms a standalone Library edit goes through the common `MaterialStandaloneEditor` → `TaskFileWorkspace` path with its agent initially hidden, while the prop default preserves existing Task/history behavior. The explicit button reveals/closes/reopens the mounted conversation. All three shared edit-bar agent entry points use `EditBarAgentIcon`; `EditBarPinButton`/`data-edit-bar-pin` are absent from the owned chrome source, while keyboard/drag/dock/collapse logic remains. The real Library runtime covers a document; image runtime covers image. Other standalone editor types share the same wrapper but did not receive separate Library-open runtime evidence. Tool/drawer fallback and working panel behavior were source-reviewed and covered by shared plugin chrome tests, not by a per-editor-family opening matrix.
- W02's original delivered fix passed an independent local-harness counterexample for host cache capture IDs: after A→B and reused revision 1, A and B cache IDs differ; delayed A snapshot is ignored; B `flush()` requests its own save snapshot and only B payload is persisted to item B. Exact command was a `run-light` inline Node script importing `tests/e9-richdoc-harness.mjs`; output: IDs `rd-cache-rd-mvif1kq4-3nb0mf-0-1-1` and `rd-cache-rd-mvif1kq4-3nb0mf-1-1-2`, `resultOk=true`, only call `document-B` / `B-payload`.
- That check exposed a distinct remaining W02 issue in the same route: a delayed native Umo `umo-save-*` snapshot from A, delivered after A→B with same revision 1, passes the existing exact origin/frame/instance message gate because the route keeps the same `instanceId` across items. The route then persists `delayed-native-A` to `document-B` and emits an `ok:true` save result. The independently exercised message was `recoveryId: "umo-save-origin-A-7"`, revision 1, payload `{type:"doc",text:"delayed-native-A"}`. This is a plausible late in-flight native save: `/root/projects/umo-hosted/src/bridge/umo-save.ts` generates `umo-save-${Date.now().toString(36)}` and sends JSON+revision via the same `recovery-snapshot` envelope. W02 owner is implementing item-bound protocol-instance/handler scope isolation; acceptance remains open pending a post-fix A-reject/B-native-save-positive rerun. No V01 source/test edits were made.
- W03: parent source/revision/closure evidence and named test results were reviewed. An independent `run-light` inline normalization/field comparison against the exact pinned `/tmp/library-repair-20261021/design_canvas/source.bin` found 51/51 layers (rect20/ellipse5/text26), 0 field mismatches for ID/order, geometry, z, effective opacity, shape kind/fill/stroke/radius, and text/text color/font family/size/weight; `sourceCarrier` compared equal. Source has 0 assets and 0 decorative flags, text family `Noto Sans CJK SC`. Thus actual asset resolution, accessibility decoration, align/lineHeight overrides, and browser/pixel/font availability are not established by this file. The synthetic handshake tests directly assert only some of these mapped style fields; the remaining adapter mappings are source-reviewed.
- W05 commit `2b4252be` and delivery `88726358` were reviewed read-only. Parent reports 58/58 focused grid cases. Source mapping covers all generated runnable L1/L2 controls and shared-control SSR asserts non-empty SVGs for cell/range toolbar controls; the unknown-icon fallback has a negative control. Residual quality note: sort asc/desc share the same list glyph and number-format variants share font-size; labels remain exposed, so the blank-glyph issue is fixed but glyph-only semantics are not fully distinct.
- W04 is still active and has no frozen delivery yet. Whole-task acceptance is therefore not ready.

## Next

1. Recheck W02 after its item-bound native-save scope fix: old A native message must be rejected under A's old instance, and B native message must still persist for B.
2. Incorporate W04's delivered commits and inspect video graph load/node-edge retention/autosave/saveId receipt semantics; do not duplicate parent-owned suites/typecheck.
3. Add final commit-pinned checklist, residual defects, evidence limits, and verdict after all five delivery sets are available.
