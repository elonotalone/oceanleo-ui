# W03 state — design canvas load compatibility

Updated: 2026-10-22

## Current facts

- Both owned repositories are on `main`; `oceanleo-ui` began clean and is ahead 16, `design` began clean and matches `origin/main`.
- Read the exact Library artifact `cbf7147b-9c6c-4a62-a833-accff1e12ae8` through `oceanleo-library`; its source is 15,080 bytes and declares `schema: oceanleo.design-document.v1`.
- The artifact contains 51 elements: 20 `rect`, 5 `ellipse`, 26 `text`; element fields are flat (`id`, `type`, `x`, `y`, `width`, `height`, `z`, and type-specific fields), with no editor `props` object. The document has no `id`, `title`, `updatedAt`, or `sourceMode`; the envelope has title, palette, fonts, attribution, and assets.
- `validateDesignCompositeSource(..., { validation: "open" })` routes every schema-v1 source without `sceneGraph` to `publishedPackageEvidence`, whose element validator requires `props`; this rejects element[0] of the real carrier.
- `packages/gallery-editor/src/lib/embed-design-project.ts::normalizeDesignProjectSource` only accepts its typed canonical envelope or a schema-less flat template. A carrier with the same v1 schema but no typed-composite envelope is rejected before conversion.
- Nav impact: shared validator and `DesignCanvasLocalRoute` are mapped to 35 `ui-consumers`; the design repo converter path reports `unmapped=true`.
- At initial inspection, no implementation edits existed. Existing identity, revision, dependency-closure and carrier schema checks were identified as invariants and remain in force.

## Current implementation

- Shared UI open validation now has a strict `oceanleo.design-document.v1` carrier branch. It uses the declared carrier schema, duplicate layer/asset identity and reference closure checks, preserves the source digest and pinned closure evidence, and keeps canonical/editor-package branches separate. Open does not enforce publication-only byte-floor, raster, quality, or license gates.
- Design source normalization now recognizes only the exact v1 carrier envelope, adapts text/rect/ellipse/line layers, image and asset-backed icon layers when pinned HTTPS asset URLs are present, and simple one-level groups as native `groupId` membership. The complete original carrier remains in `sourceCarrier` through save/reopen; carrier adaptation uses the pinned artifact identity/revision and clean-load behavior.
- Current core limits are explicit: arbitrary `pathData`, `chart-embed`, pathData-only icons, unresolved image/font assets, non-fill image fit, and group shapes the flat group model cannot represent fail closed. Existing canonical source conversion remains separate.

## Reproduction and verification

- Added a minimized synthetic fixture with the exact 51-element distribution and carrier fields, without copying Library text or assets.
- Shared UI focused test (with repository TypeScript loader) fails at `publishedPackageEvidence`: `published design package element[0] 结构或 identity 无效。` (`design-source-invalid-structure`). Existing local canvas parse/serialize assertions already prove all 51 flat elements and root palette/fonts/attribution round-trip.
- Design repo focused test fails at `normalizeDesignProjectSource`: `Canonical Design source 缺少 typed composite identity` (`design-source-invalid-structure`). Existing duplicate-ID and NaN-geometry negatives continue to reject.
- These two causal red regressions are committed before any converter implementation.

- The actual Library source at `/tmp/library-repair-20261021/design_canvas/source.bin` is 15,080 bytes and matches Library-list SHA-256 `5bbf4a776be490a5cc9e86c834dede56b63ade9bdad527bbdf565531f7c80e99`. It was run through shared open validation and Design normalization using pinned artifact `cbf7147b-9c6c-4a62-a833-accff1e12ae8`, revision `754ff828-32fb-423c-9f5a-576e875a9ef0`, and project revision `0`. Both reported 51 layers (20 rect, 5 ellipse, 26 text), layered mode, and the Design project retained the byte-equivalent source carrier. The shared validator's one-off LibraryItem used those pinned IDs and a locally computed source-only closure projection because `oceanleo-library list` exposes the artifact hash but not its server source-closure fields. No source content was printed or committed.
- Design normalization can be rerun without emitting source text using `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node tests/helpers/inspect-published-design-carrier.mjs /tmp/library-repair-20261021/design_canvas/source.bin cbf7147b-9c6c-4a62-a833-accff1e12ae8 754ff828-32fb-423c-9f5a-576e875a9ef0 2026-10-21T15:38:43.475731Z`. The helper prints only source digest/size, pinned IDs, type counts, layer IDs, and structural preservation status.
- Design source/persistence focused command passed 18/18: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --test tests/design-source-handshake.test.mjs tests/embed-editor-persistence.test.mjs`.
- Dependent Design focused command passed 28/28: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --test tests/workflow-source-producer.test.mjs tests/design-advanced-editor-contracts.test.mjs tests/design-model-capabilities.test.mjs tests/typed-composite-artifact.test.mjs`.
- Shared UI focused command passed 15/15: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/design-composite-commit.test.mjs`.
- `git diff --check` passed in both owned repositories. Typechecks remain with the parent agent; no duplicate typecheck was run.

## Remaining

- Parent owns final shared/design typechecks and any dev HTTP acceptance. No production publish/deploy or raw operator source was committed.
