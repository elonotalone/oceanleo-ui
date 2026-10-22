# W08 delivery: image + design canvas, one editor, one type

## What changed (oceanleo-ui)
Added:
- `src/shell/material-kind-alias.ts`: read-time alias. `displayKindFor(item)` maps a stored `canvas` item that is a design document (artifactType composite_image, meta.editor design-canvas, meta.designDocument, editor_project_schema design-document) to `image`; real workflow/video canvases stay `canvas`. Also `isLegacyDesignItem`, `aliasLegacyKind`. No stored row is rewritten.
- `src/shell/image-editor/design-document-snapshot.ts`: pure converter design-document -> image scene (rect, ellipse, text, line, path, plus image / icon / chart-embed as Fabric image layers; layer ids kept as oceanleoId). Elements it cannot build (asset missing) are reported in `unsupported`. `isDesignDocumentItem`.
- `tests/image-design-merge.test.mjs` (7 tests, regression: DesignCanvasLocalRoute gone, ImageRoute single mode and opens design projects, alias canvas->image, converter keeps layers, unsupported elements reported).
Edited:
- `use-fabric-image-editor.ts`: a design-document item (inline `meta.designDocument`, or durable composite_image with sourceFormat design-document) is loaded via the existing `planDesignCanvasSource`/`hydrateDesignCanvasSource`, converted, and loaded into the Fabric canvas. Image/icon/chart-embed assets are resolved (see Follow-up) before conversion. If an asset cannot be loaded, or the source is unreadable, it fails closed with a clear message (existing source-failure panel); never a blank canvas over the original, never a silent drop. Save of a design item goes through `persistImageProject` (kind `image`, project = fabric-image project with all layers, `editor_project_schema` fabric-image), not through the composite image-scene commit.
- `ImageRoute.tsx`: single mode. Removed pluginMode state, `mode` adapter, remembered pro mode, `bindProFaceHandoff` / `bindNormalFaceHandoff` effects.
Deleted: `advanced-routes/DesignCanvasLocalRoute.tsx`, `design-canvas/use-local-design-canvas.ts`, `design-canvas/design-command-surface.ts` (the "改标题" command only), `design-canvas/design-document-fabric.ts`, `image-editor/design-mode/image-plugin-mode.ts`. Kept `design-canvas/blank-design-document.ts` and `design-canvas-source.ts` (still used).

## Backend (/root/projects/oceanleo/backend)
- `app/typed_uploads.py`: upload hint `image` now maps to `design_canvas` (composite_image) exactly like `design` / `design_canvas` / `composite_image`; only honored when structured evidence is a design-document source. Old hints still work; no migration. composite_image already maps to library kind `image` (ARTIFACT_KIND, bay_feed), so nothing else needed.
- `tests/test_image_kind_design_hint.py` (new). Commit a67d4f9 in the oceanleo repo (only those two paths; other people's dirty files untouched).

## Commits
oceanleo-ui 16319457 (all UI work + state/journal); oceanleo a67d4f9; this delivery.

## Verification
- `cd /root/projects/oceanleo/backend && .venv/bin/python -m pytest tests/test_image_kind_design_hint.py tests/test_carrier_artifact_type_plane.py tests/test_advanced_capability_bindings.py -q` -> 50 passed.
- run-light node tests (command in _COMMON.md) green: image-design-merge (7), image-route-merge (8), eas-w18-image-handoff, p6-image-design, image-photopea-removed, W6-r2-source-lifecycle, editor-repair-acceptance-round-trip, one-task-library-image-runtime, design-mode (54), collab-image-adapter, design-composite-commit, design-document-carrier, fabric-carrier-contract, image-* others, w10-design-canvas-offline.
- tsc (run-heavy): no errors in ImageRoute, image-editor/**, design-canvas/**, material-kind-alias.

## Tests deleted / rewritten
Deleted: `image-plugin-mode.test.mjs` (tested deleted module), `e7-other-image-leave.test.mjs` (Normal/Pro page switch only), `W7-20261021-design-canvas-person-edit.mjs` (deleted hook). Rewritten to single mode: image-route-merge, eas-w18-image-handoff, p6-image-design, image-photopea-removed. Removed the design-canvas block from `editor-repair-20261021-acceptance-remaining-autosave.mjs`; `applyDesignCommand` uses in W6-r2-source-lifecycle and editor-repair-acceptance-round-trip replaced by a direct title edit. (`W6-r2-commands-hosted-deck.test.mjs` was already deleted by another owner.)

## Cross-owner requests
- W01: route `canvas`/design items to ImageRoute (use `displayKindFor` / `isLegacyDesignItem` from `src/shell/material-kind-alias.ts`); remove `design-canvas` entries (w10-editor-mounts, registry, plugin-theme, collab-editor-kinds `design-canvas: image` already ok, advanced-features `design-canvas` case, workbench-routes, artifact-contract capability `design-canvas` stays on the backend contract). Note `non-richdoc-source-gate.designCanvasLocalSourceAdmission` is now unused. `site-catalog-controller` `design: "canvas"` aliases should become `image` (W01/parent).
- W06: canvas previews as image; can use `displayKindFor`.
- `tests/W6-r2-source-lifecycle.test.mjs` / `w10-prefer-local-editors.test.mjs` assert EmbeddedRoute mentions DesignCanvasLocalRoute: W01-owned, will need updating.
- Parent: no package.json, i18n, or barrel changes needed from W08 (check `src/index.ts` / `shell/index.ts` for any export of deleted modules; none seen by grep).

## Follow-up (parent request): image / icon / chart-embed now open and edit
Finding first: the deleted `DesignCanvasLocalRoute` could NOT edit these. Its `elementToFabricObject` handled only rect, ellipse, text and line and returned null for image, icon, chart-embed, path and group (they were not drawn; they were kept only in the stored project JSON on save). There was no asset-closure resolver in the old route to recover. What exists now is strictly more than before.
- Asset resolution: per the design-document spec, `elements[].assetId` is a `platform_assets.oss_key`. Verified with a read-only query that `full_url` is `https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/<oss_key>` (a first-party host in `media-proxy`). `designAssetUrl(assetId)` builds that URL and refuses anything that is not a plain object key (scheme, leading slash, `..`). The hook loads each distinct asset once (via `canvasSafeUrl`) to learn its natural size, then converts.
- Layers: Fabric `Image` objects with position, size (scale), rotation, opacity, and `fit` handled as crop (cover, using cropX/cropY and visible width/height), centered (contain) or stretched (fill). Defaults: image=cover, icon/chart-embed=contain.
- chart-embed: its stored preview raster (assetId) is an image layer named "图表"; icon layers are named "图标". Layer names are a new serialized prop `oceanleoName`, shown in the layer list (`LayerEntry.name`).
- Round trip: new serialized snapshot props `oceanleoName`, `oceanleoDesignAssetId` (asset reference kept on the layer), `oceanleoDesignGroup`. Saving writes the fabric-image project with every layer (no flattening); the image `src` and asset id survive reopen.
- Groups: the old route did not draw groups, so there is no Fabric group to preserve. Children stay separate top-level layers tagged `oceanleoDesignGroup=<group id>`; the group container itself has no pixels.
- Fail closed only for: an asset that cannot be loaded or has an invalid key, an icon/chart-embed with no `assetId`. Unknown element types never reach conversion: the carrier schema (`parseDesignDocumentProject`) already rejects them with a validation error, which the editor shows.
- Tests (tests/image-design-merge.test.mjs, 11 tests): a design document with text + shape + image + icon + chart-embed converts with all layers, is edited (image moved, text changed), saved as a fabric-image project, parsed back and compared deep-equal; cover/contain math; missing asset reported; asset-key safety; new props are serialized. Limitation of this test: it is pure-data (no Fabric canvas / browser, not allowed), so the actual canvas paint and `loadFromJSON` of Image `src` is not exercised.
- Files: design-document-snapshot.ts, use-fabric-image-editor.ts, editor-objects.ts (props), types.ts, fabric-controller-core.ts, FabricImageControls.tsx (layer name).

## Remaining limitations
- Assets are loaded from the first-party bucket by key; an unreachable asset blocks the open (by design). SVG icons with no intrinsic size fall back to the element box.
- First save of a design item writes a new image revision (fabric project); the original design-document revision is untouched, but text/shape edits are not written back in design-document form.
- Not covered: pre-existing failures image-edge-snapping #10 (controller source regex) and d4-design-handshake-origin (`lastDirtyRevisionRef is not defined`, not in W08 files). No browser verification (not allowed).
