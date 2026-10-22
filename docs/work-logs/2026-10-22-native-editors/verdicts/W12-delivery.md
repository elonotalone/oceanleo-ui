# W12 delivery — backend stops producing `chart` artifacts

Repo: /root/projects/oceanleo (backend). Commit `0dd359d` (main).

## Classification of the listed files
Producers (changed or already image-only):
- `app/agent_tools.py` make_material: schema/description no longer offer `oceanleo.chart.v1` (3 project-json envelopes: design-document, video-canvas, timeline; "charts are delivered as images"). `_exec_make_material` now refuses `project-json` with `meta.envelope == oceanleo.chart.v1` before any image fetch/sandbox work.
- `app/prompts/skills/material/chart.md` rewritten: charts = matplotlib PNG via `upload_artifact`; README table row updated. (This is the doc returned by `make_material(tool="chart")` without body.)
- `app/worldbank_owid_ingest/pipeline.py`: `ASSET_TYPE` "chart" -> "grid" (rows are CSV data series; bytes unchanged; CSV is an allowed grid source kind).
- `app/public_editable_catalog/pack.py`: `chart_editing` removed from `RELEASED_EDITOR_FEATURE_IDS` (no more editable chart sources handed out; 6 -> 5 released classes).
- Agent paths (`agent_engine.py`, `agent_smol_engine.py`, `excel_sandbox_runner.py`, `restricted_exec.py`): chart intent already routes to codeact + matplotlib PNG + upload (an image); the `chart` key in sandbox results is a result field, not an artifact. No change needed.

Readers kept tolerant (unchanged): typed_artifact_wire.py, typed_artifact_backfill.py, typed_artifact_legacy.py, template_materials.py (type allowlist), template_material_preview.py, asset_material_catalog/cleanup.py, credit_injection, supa.py (old-row editor descriptors), asset_synonyms.py, work_replay/sources.py, im/messages.py, talent/bay_feed.py (already maps chart -> image), routers/assets_router.py.

## Tests
- Added `tests/test_chart_producers_retired.py` (5 tests): schema has no chart envelope; project-json refuses chart envelope; chart skill doc routes to PNG; worldbank rows not chart; pack does not release chart_editing.
- Edited `tests/test_editor_source_released_classes.py`: whitelist six -> five rows, chart row/case removed (asserted-deleted behavior). No tests deleted.
- Commands (cd /root/projects/oceanleo/backend; `.venv/bin/python -m pytest -q` via agent-io-guard run-light):
  - test_chart_producers_retired, test_editor_source_released_classes, test_public_editable_catalog, test_carrier_catalog_completeness, test_assets_catalog_pack, test_asset_material_catalog, test_agent_gateway_tool_tier, test_advanced_capability_release_integrity, test_edition_c6_cn_blocks, test_material_tools_registry, test_typed_upload_closure: all pass.
  - Pre-existing failures on untouched HEAD (verified by stash): tests/test_reviewed_material_catalog.py (6 fail), test_reviewed_material_catalog_real_validation.py (10 errors), test_edition_c6_global_unchanged::test_c3_verdicts_in_edition_py_are_untouched (edition.py digest). Not caused by W12.

## Cross-owner requests / not done
1. `app/typed_artifact_models.py` (W08/not mine): keep `ArtifactType.CHART` and `oceanleo.chart.v1` for reading old rows. Nothing to change now.
2. `app/typed_uploads.py` (W08's): the structured-upload profile map still maps `chart`/`chart_editing` -> `chart_editing`, so a client upload of a chart JSON can still register a chart. Request: remove those two map entries (uploads then fall through to generic handling) once W08 is done there.
3. `app/reviewed_material_catalog.py` + `scripts/publish_reviewed_material_catalog.py`: `chart_editing` is one of 12 pinned REQUIRED_EDITOR_CLASSES in release manifests/receipts; the publisher can still emit a chart item. Removing it changes pinned manifest verification of already-published releases, so I left it. Parent decision: stop running the publisher for the chart class (data step) or re-pin the manifest to 11 classes.
4. `material-tools/registry.json` / `MANIFEST.json` / `bundles/project-json.mjs` are generated from oceandino `scripts/material-infra/assemblers/`; the bundle still accepts the chart envelope and registry `skill: "chart"`/mustKnow say "four envelopes". Backend refuses chart before the bundle runs; the source assembler should drop the chart envelope and the registry skill should become `composite-image`.
5. `supa.py` still builds a `chart-editor` descriptor for old platform_assets chart rows (read path); UI side must treat as read-only (W01).

## Deps
None.

## Limitations
- Server-side ECharts rendering was not added (no renderer exists); chart pipelines now just use matplotlib PNG.
- No data written to any database; existing chart rows untouched.
