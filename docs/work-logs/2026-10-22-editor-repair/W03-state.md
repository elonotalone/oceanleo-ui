# W03 state — design canvas load compatibility

Updated: 2026-10-22

## Current facts

- Both owned repositories are on `main`; `oceanleo-ui` began clean and is ahead 16, `design` began clean and matches `origin/main`.
- Read the exact Library artifact `cbf7147b-9c6c-4a62-a833-accff1e12ae8` through `oceanleo-library`; its source is 15,080 bytes and declares `schema: oceanleo.design-document.v1`.
- The artifact contains 51 elements: 20 `rect`, 5 `ellipse`, 26 `text`; element fields are flat (`id`, `type`, `x`, `y`, `width`, `height`, `z`, and type-specific fields), with no editor `props` object. The document has no `id`, `title`, `updatedAt`, or `sourceMode`; the envelope has title, palette, fonts, attribution, and assets.
- `validateDesignCompositeSource(..., { validation: "open" })` routes every schema-v1 source without `sceneGraph` to `publishedPackageEvidence`, whose element validator requires `props`; this rejects element[0] of the real carrier.
- `packages/gallery-editor/src/lib/embed-design-project.ts::normalizeDesignProjectSource` only accepts its typed canonical envelope or a schema-less flat template. A carrier with the same v1 schema but no typed-composite envelope is rejected before conversion.
- Nav impact: shared validator and `DesignCanvasLocalRoute` are mapped to 35 `ui-consumers`; the design repo converter path reports `unmapped=true`.
- No implementation edits yet. Existing identity, revision, dependency-closure and carrier schema checks must remain in force.

## Current reproduction

- Added a minimized synthetic fixture with the exact 51-element distribution and carrier fields, without copying Library text or assets.
- Shared UI focused test (with repository TypeScript loader) fails at `publishedPackageEvidence`: `published design package element[0] 结构或 identity 无效。` (`design-source-invalid-structure`). Existing local canvas parse/serialize assertions already prove all 51 flat elements and root palette/fonts/attribution round-trip.
- Design repo focused test fails at `normalizeDesignProjectSource`: `Canonical Design source 缺少 typed composite identity` (`design-source-invalid-structure`). Existing duplicate-ID and NaN-geometry negatives continue to reject.
- These two causal red regressions are committed before any converter implementation.

## Next

1. Implement the explicit shared open-validation adapter while preserving digest, closure, schema and duplicate-ID checks.
2. Implement the design-repo known-carrier adapter, lossless source sidecar and save/reopen preservation.
3. Run focused tests in both repos, write delivery evidence, commit only owned paths on `main`.
