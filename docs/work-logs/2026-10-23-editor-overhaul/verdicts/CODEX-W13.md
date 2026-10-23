# CODEX-W13 — 3D continuation

## Implemented

- `1a0704a4`: ordinary saves now export a fresh self-contained GLB and private PNG preview through the typed artifact revision path. The document title is preserved. Repeated flushes of one edit reuse the receipt; downloading does not publish a version. A save receipt advances the next CAS base and does not reload the editor's own scene.
- Canonical object `position` inspector contains all nine position/rotation/scale axes; duplicate/delete use the object group. Transform mode, visibility and actual selected material/camera/light controls remain specific. Empty selection returns no toolbar. Scene-wide orbit, environment, shadow and animation controls live in the Scene drawer. Read-only selections do not emit disabled mutation placeholders.
- The existing duplicate runtime is wired into the workbench/bar. The material adapter registers its editor-history command contract for supported GLB/glTF scene replacement; HDRI/texture inputs remain rejected.
- A zero-motion OrbitControls click no longer marks an edit or publishes a version.
- `5da176b7`: cold typed projections read `editor_manifest_url` as well as the legacy project locator. A present manifest failing to load prevents model admission/save instead of silently overwriting its sidecar with fallback state. Real-hook regression covers both successful view recovery and failure.
- `fd512b80`: Undo/import changes scene generation but retains the target's latest durable CAS receipt. This repairs the actual Undo-after-save 409 found during acceptance. GLB export uses a non-owning Scene envelope for the loader's identity Group, stopping wrapper accumulation without reparenting nodes or flattening authored transforms. Three successive real Three.js export/reload cycles retain exactly one mesh node.

## Actual acceptance

Acceptance account only: `2ffeef37-102a-431b-b2c2-51c5675dba79`. Root `1fbbe2f6-38af-416d-a59d-8fe75dbd80d7`, `[W13] sample.glb`.

| Check | Evidence |
| --- | --- |
| Light empty/selected chrome | `/tmp/codex-w13-probe`; no fake empty selection; selected bar has position, duplicate, delete, transform mode, visibility and material inspector. |
| Strict save protocol | `codex-save.mjs`, `/tmp/codex-w13-save4`, exit 0 at 205.6s. Open and selection produce no revision; PX and RY edits each POST 200; actual library reopen and hard reload retain x=1, ry≈30. |
| Offline/retry | Same strict run: PZ=0.1 while offline displays error; exact Retry action publishes once, reaches saved, and reopening retains it. Exactly three revision POSTs, all 200, same root; SQL ordinal 4→5→6→7 with exact parent chain. |
| Typed representations | SQL on the acceptance root confirms each new revision has GLB source/full, JSON editor_manifest, and PNG preview/thumbnail. The original title is unchanged. |
| Independent GLB content | `/tmp/codex-w13-controls/source.glb`, parsed directly from GLB JSON chunk: Cube translation `[1,0,0.1]`, Y quaternion corresponding to 30°, Orange baseColorFactor `[0.95,0.5,0.2,1]`, metallic 0, roughness 0.6. Authored color is unchanged. |
| Dark material/clone/delete/Undo | Final `/tmp/codex-w13-controls4`, exit 0 at92.2s: dark footer rgb(27,27,31), foreground rgb(237,237,240); actual material inspector displays authored `#f9bc7c`; duplicate appears beside source, delete and Undo each save. Exactly three POST200, no409. `duplicated.png` and `undo-delete.png` visually reviewed. The earlier `/tmp/codex-w13-controls` discovered the Undo CAS defect and is not labelled a full pass. |

Commands run from this work-log directory:

```sh
bash harness/mint.sh | OUT_DIR=<directory> THEME=light node harness/run.mjs evidence/W13/scenarios/codex-save.mjs <root>
bash harness/mint.sh | OUT_DIR=<directory> THEME=dark node harness/run.mjs evidence/W13/scenarios/codex-controls.mjs <root>
```

## Verification and boundaries

Focused tests use `agent-io-guard.sh run-light -- node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test`. **51 unique assertions pass**: hook/controls/persistence/recovery21, core/gates/route-context21, actual Three roundtrip9. These include actual scene edit/export/reload with animation, PBR material, textures and lights; three-cycle wrapper stability; checkpoint prefix preservation; current CAS after scene generation change; manifest failure safety. Parent independently ran the new hook/controls and related route tests and owns full typecheck/full suite/slot freshness. Final annotation preservation `0558a160` keeps explicit notes editable in a child inspector alongside a node, without auto-selecting an annotation merely on open.

No dependencies, shared product exports, public snapshots, operator data, push or deployment were changed. All new chrome labels reuse existing UI translations. Unrelated dirty files were preserved. Parallel index race: W10's already-staged `codex-accept.mjs` was included in `5da176b7`; W10/parent were informed immediately, its content was not edited by W13, and history was not rewritten. Subsequent commits use explicit `--only` paths.

## Limits

- A full actual public-model fork and material-library replacement click have not been independently retested here. The registered adapter truthfully advertises scene replacement, not arbitrary merge/insertion. Do not infer a real public-fork pass from generic typed-save coverage.
- Final additional actual color-field edit/Undo/reopen scene was blocked before entry by unrelated dev compile500 (`ProfilePageEditor.tsx` missing `ProfilePageSettings`). Browser was closed; color-field acceptance pending a stable source window. Existing real Three roundtrip verifies material mutation itself, and actual dark inspector was opened/read.
- Earlier scenarios with a missing explicit inspector-close locator, Escape closing the whole editor, shared HMR/restart, or the dev issue badge covering the pencil were excluded. The successful strict run is the fresh stable-source run cited above. Host hydration warnings remain in logs.
- Old wrapper nodes already present in the acceptance fixture are preserved; the exporter prevents future accumulation rather than destructively flattening existing authored hierarchies.
