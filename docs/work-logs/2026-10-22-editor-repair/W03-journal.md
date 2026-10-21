# W03 journal — design canvas load compatibility

- 2026-10-22: Ran the required workstation bootstrap and read the live kernel, workstation instructions, OceanLeo/parallel-rollout/architecture-debug packs, code map, editor plan, three requested nav slices, and W03 task book.
- 2026-10-22: Checked both repository states; both were clean on `main`. Shared UI impact maps to 35 consumers. Design-repo converter impact is `unmapped=true`.
- 2026-10-22: Found artifact `cbf7147b-9c6c-4a62-a833-accff1e12ae8` with the read-only `oceanleo-library` helper and downloaded its source to `/tmp` as untrusted JSON. The source has 51 flat-schema elements (20 rect, 5 ellipse, 26 text), none with `props`; element[0] has an ID and known flat fields.
- 2026-10-22: Traced shared open validation to `publishedPackageEvidence`, which treats all schema-v1 carriers as legacy editor packages and rejects the first element for missing `props`. Traced design source normalization to an envelope/flat-template-only parser that rejects a schema-v1 carrier without `artifactType`/scene/history.
- 2026-10-22: No source changes made yet. Parent requested a minimized synthetic 51-element fixture, preservation assertions, and duplicate/non-finite negative controls.
- 2026-10-22: Added exact-shape, synthetic regressions in both repos. Shared UI open validation reproduces the first-layer `props` rejection; local schema parse/serialize preserves every flat element field and the envelope metadata. Design normalization reproduces its missing typed-composite-identity rejection. Duplicate-ID and non-finite geometry controls reject in both repos.
- 2026-10-22: Committing only the two regression tests and W03-owned state/journal before implementation, as requested by parent.
