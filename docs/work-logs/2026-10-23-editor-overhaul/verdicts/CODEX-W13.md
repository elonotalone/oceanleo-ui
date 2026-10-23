# CODEX-W13 — 3D continuation

## Implemented

- `1a0704a4`: ordinary saves now export a fresh self-contained GLB and private PNG preview through the typed artifact revision path. The document title is preserved. Repeated flushes of one edit reuse the receipt; downloading does not publish a version. A save receipt advances the next CAS base and does not reload the editor's own scene.
- Canonical object `position` inspector contains all nine position/rotation/scale axes; duplicate/delete use the object group. Transform mode, visibility and actual selected material/camera/light controls remain specific. Empty selection returns no toolbar. Scene-wide orbit, environment, shadow and animation controls live in the Scene drawer. Read-only selections do not emit disabled mutation placeholders.
- The existing duplicate runtime is wired into the workbench/bar. The material adapter registers its editor-history command contract for supported GLB/glTF scene replacement; HDRI/texture inputs remain rejected.
- A zero-motion OrbitControls click no longer marks an edit or publishes a version.
- `5da176b7`: cold typed projections read `editor_manifest_url` as well as the legacy project locator. A present manifest failing to load prevents model admission/save instead of silently overwriting its sidecar with fallback state. Real-hook regression covers both successful view recovery and failure.
- `fd512b80`: Undo/import changes scene generation but retains the target's latest durable CAS receipt. This repairs the actual Undo-after-save 409 found during acceptance. GLB export uses a non-owning Scene envelope for the loader's identity Group, stopping wrapper accumulation without reparenting nodes or flattening authored transforms. Three successive real Three.js export/reload cycles retain exactly one mesh node.
- `e1b21f6b`: the formerly empty W13 copybook now supplies42 missing 3D selection/Scene labels in all16 non-Chinese locales. Existing shared Material/Animation keys are not overridden; object Scale has its own label instead of reusing viewport Zoom. The actual aggregated UI dictionaries are regression-tested.
- `9f0e3849`, `279b0128`: collaborative Undo ignores save-only checkpoint transitions and the editor's own acknowledged immutable artifact+revision receipts (including an in-flight fetch race). Genuine remote updates still refresh the baseline; typed remote manifests recover their canonical GLB/source identity and missing manifests/sources fail closed. The actual collaboration-hook regression failed with an empty restored journal before the fix, then passed with the clone restored. Shared adapters were not changed.
- `567be2db`, `2c511c2c`, `d60060cc`: typed metadata's empty legacy provenance fields no longer erase the current item identity. Older collaboration rooms with an identity-less expired private URL recover only the exact old checkpoint, with same-origin/access-path/source-mode/purpose/UUID/same-validated-root fencing, authenticated exact-revision metadata, refreshed grant and actual SHA-256 verification. The token payload is only a locator hint, never authorization; no journal is discarded and no checkpoint is redirected to head. Typed GLB shelf replacement validates bytes then reuses its private immutable source identity rather than reuploading through the legacy path.

## Actual acceptance

Acceptance account only: `2ffeef37-102a-431b-b2c2-51c5675dba79`. Root `1fbbe2f6-38af-416d-a59d-8fe75dbd80d7`, `[W13] sample.glb`.

| Check | Evidence |
| --- | --- |
| Light empty/selected chrome | `/tmp/codex-w13-probe`; no fake empty selection; selected bar has position, duplicate, delete, transform mode, visibility and material inspector. |
| Strict save protocol | `codex-save.mjs`, `/tmp/codex-w13-save4`, exit 0 at 205.6s. Open and selection produce no revision; PX and RY edits each POST 200; actual library reopen and hard reload retain x=1, ry≈30. |
| Offline/retry | Same strict run: PZ=0.1 while offline displays error; exact Retry action publishes once, reaches saved, and reopening retains it. Exactly three revision POSTs, all 200, same root; SQL ordinal 4→5→6→7 with exact parent chain. |
| Typed representations | SQL on the acceptance root confirms each new revision has GLB source/full, JSON editor_manifest, and PNG preview/thumbnail. The original title is unchanged. |
| Independent GLB content | `/tmp/codex-w13-controls/source.glb`, parsed directly from GLB JSON chunk: Cube translation `[1,0,0.1]`, Y quaternion corresponding to 30°, Orange baseColorFactor `[0.95,0.5,0.2,1]`, metallic 0, roughness 0.6. Authored color is unchanged. |
| Dark material/clone/delete/Undo | `/tmp/codex-w13-controls6`, exit0 at133s: actual mesh counts1→2→1→2; three typed POST200; full reload retains two and publishes no fourth revision. Dark footer rgb(27,27,31), foreground rgb(237,237,240). The old controls4 Undo claim was withdrawn; this run uses real geometry-count assertions. |
| Independent durable Undo output | Fresh acceptance-token current-head/source-grant GET, separate from browser recovery: `/tmp/codex-w13-controls6/durable-source.glb`,2756bytes, revision `393db0c0-de68-41a6-81c3-4fa8829a7997`, contains actual `Cube` and `Cube copy` mesh nodes. Current authored blue factors `[0.033104766565,0.246201326697,0.603827338848,1]` remain unchanged by theme/clone/delete/Undo. |
| Actual material color/Undo/reopen | `/tmp/codex-w13-material3`: blue→contrasting orange POST200, actual selected-color and HEX assertions; Undo POST200; library reopen restores original `#3388cc`. Final close pointer was blocked by unrelated Next development overlay; this run is not labelled full-pass. Its two-save/Undo/reopen assertions passed. |
| Fresh-session renewal and clean close | `/tmp/codex-w13-material-close3`, exit0 at39.1s: authenticated exact-old-checkpoint grants200, ready scene, original `#3388cc`; native keyboard Close→actual library reopen retains material, zero revision POSTs. This supersedes the earlier cold-open410 failures and the dev-overlay pointer obstruction. |
| Actual private shelf replacement | `/tmp/codex-w13-shelf`, exit0 at68.7s: existing private `[V01] sample.glb` card replaces scene, typed POST200; independent downloaded `replaced.glb` has1mesh. Undo POST200; `undo-replacement.glb` has2mesh. Hard reload retains2mesh, exactly2POSTs, zero legacy upload calls (script explicitly blocks that endpoint). No new public/private fixture was created. SQL ordinal21→22→23 exact parent chain; finalrevision `1d8e6a5a-88c6-4c1d-b707-4138c21c6327`, title unchanged. |

Commands run from this work-log directory:

```sh
bash harness/mint.sh | OUT_DIR=<directory> THEME=light node harness/run.mjs evidence/W13/scenarios/codex-save.mjs <root>
bash harness/mint.sh | OUT_DIR=<directory> THEME=dark node harness/run.mjs evidence/W13/scenarios/codex-controls.mjs <root>
bash harness/mint.sh | OUT_DIR=<directory> THEME=dark node harness/run.mjs evidence/W13/scenarios/codex-material.mjs <root> close-only
bash harness/mint.sh | OUT_DIR=<directory> THEME=dark node harness/run.mjs evidence/W13/scenarios/codex-shelf.mjs <root>
```

## Verification and boundaries

Focused tests use `agent-io-guard.sh run-light -- node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test`. Initial52 unique scoped assertions passed (hook/controls/persistence/recovery21, core/gates/route-context21, actual Three roundtrip9, locale completeness1). Final batches additionally verify the real collaboration hook/policy/remote revision loader13/13, actual route material adapter3/3, and migrated dependency/roundtrip/v8 route13/13; existing adapter8/8 is green. Exact opaque-source renewal plus resilience/save12/12 and final material/opaque/dependency11/11 passed. Material tests execute the actual route factory with real source sniffing: typed GLB private identity reuse without reupload, remote glTF closure+identity retention, and HDRI/texture/readonly/disguised source rejection. They are not claimed as a UI replacement pass. Parent owns full typecheck/full suite/slot freshness. Annotation preservation `0558a160` keeps explicit notes editable alongside a node without auto-selecting notes on open. The separate healed-key-exemption guard is green; global i18n-key-collision still has2 unrelated Work Chat/Bay/Collab Media failures, not fixed or claimed green here.

No dependencies, shared product exports, public snapshots, operator data, push or deployment were changed. New 3D chrome translations stay in the W13-owned copybook; no shared aggregator was edited. Unrelated dirty files were preserved. Parallel index race: W10's already-staged `codex-accept.mjs` was included in `5da176b7`; W10/parent were informed immediately, its content was not edited by W13, and history was not rewritten. Subsequent commits use explicit `--only` paths.

Parent independently confirmed the durable two-mesh GLB and reported final typecheck7 exit0 including279b0128. Final stage copy uses existing “场景”/“画布” keys instead of exposing the rendering-library brand; a source regression prohibits its return.

## Limits

- A full actual public-model fork has not been independently retested here; no public fixture was invented. Actual private shelf scene replacement is now proven above, not arbitrary merge/insertion. Do not infer a public-fork pass from typed-save coverage.
- Earlier color attempts met an unrelated compile500 or unexplained first-save exit. Parent's independent observer did not reproduce a shared host defect; no shared permissions/host change was made. Final color acceptance is tracked separately below, not inferred from those attempts.
- Earlier scenarios with a missing explicit inspector-close locator, Escape closing the whole editor, shared HMR/restart, or the dev issue badge covering the pencil were excluded. The successful strict run is the fresh stable-source run cited above. Host hydration warnings remain in logs.
- Old wrapper nodes already present in the acceptance fixture are preserved; the exporter prevents future accumulation rather than destructively flattening existing authored hierarchies.
