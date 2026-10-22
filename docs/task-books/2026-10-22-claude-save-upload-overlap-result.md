# Result: save upload overlap (claude_upload_overlap_1022)

## Change
`saveFileToLibraryWithDependencies` in `src/shell/doc-editors/doc-io.ts` (only that function) now runs the project, delivery and cover uploads concurrently.
- Each upload is an async task that never rejects; it settles to `null` or `{step, detail}` and sets its prepared receipt/url on success.
- Start order: project upload call -> delivery built/hashed -> delivery upload call -> cover rendered/hashed -> cover upload call. `uploadFile` call order and idempotency keys are unchanged.
- The cover starts only if the input-only identity checks (new helper `typedIdentityFailure`, same messages) pass, there is no reusable `preparedPreview`, and `createPreview` exists.
- Join in pipeline order: project, then delivery, then (at the old location, after identity/contract/commitSource checks) cover, then plan, publish.
- `projectOnly` URL resolution moved after the join. Prepared receipts, the creation branch and the typed branch are unchanged.
- New test: `tests/save-upload-overlap-1022.test.mjs`. No existing test changed.

## Why precedence and order hold
- Failures are read in pipeline order, so an earlier step wins even if a later one fails first. Nothing is published before the join.
- Delivery-build failures (and the unclassified delivery hash throw) first await the project task and report its failure if it has one. The cover is never started after a build failure.
- A cover render failure is still only `previewWarning`. A cover upload failure is reported only when the earlier checks pass, exactly as before.

## Tests
- Run through `agent-io-guard.sh run-light`, 4 files at a time; all 21 files that import `doc-io` plus the new one were run.
- New file: 6/6 pass.
- Existing event-order tests: d1-r5-deck-persistence, deck-delivery-producer, w2-editor-save-contract, d12-model3d-host-save, w13-upload-idempotency-digest, w13-project-only-working-head all pass.
- Other `doc-io` importers pass, except one: `tests/rich-doc-core-swap.test.mjs` fails 1 of 38 tests (the jsdom `RichDocRoute` iframe test). The cause is a stub module missing the `cacheableRenditionTwin` export, which is another owner's file change and not related to `doc-io.ts`.
- `pnpm typecheck` (via `run-heavy`): no errors.

## Residual risk
- When the project upload fails, the delivery upload has already been issued, so a wasted upload is possible. Idempotency keys bind content digests, so a retry is safe.
- Failure results can now carry `fileName`, `sourceFormat` and `preparedDelivery` from the other steps, which helps retry.
- Preview is started speculatively before the "no source digest" contract check. That check only matters when `crypto.subtle` is missing.
- The first failing step is returned without waiting for later uploads. Their receipts are not guaranteed in the result.
