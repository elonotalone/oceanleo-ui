# Final source contract reconciliation

Scope: only the five files assigned by `tasks/CODEX-final-source-contracts.md` plus this verdict. No product,3D-specific test, host, Bay or browser change; no network write, runtime restart, dependency change, push or full-suite run.

## Results

| Run | Tests | Pass | Fail | Cancel/skip |
| --- | --- | --- | --- | --- |
| Before |35|29|6|0/0|
| First alignment |35|34|1|0/0|
| Final |35|35|0|0/0|

Logs: `/tmp/codex-final-source-before.log`, `/tmp/codex-final-source-after.log`, `/tmp/codex-final-source-final.log`. The initial baseline invocation was automatically demoted by the guard; it was repeated before edits with `OCEANDINO_FORCE_HEAVY=1`, and both subsequent five-file batches also used that explicit heavy admission. No suite-wide claim is made here.

```bash
OCEANDINO_FORCE_HEAVY=1 bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- \
  node --import ./tests/helpers/assert-dom-guard.mjs \
  --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test \
  tests/advanced-project-autosave.test.mjs \
  tests/office-real-file-roundtrip.test.mjs \
  tests/lightweight-office-frontend.test.mjs \
  tests/image-edge-snapping.test.mjs \
  tests/rendition-callback-identity.test.mjs
```

## Exact obsolete contracts and their replacements

- `advanced-project-autosave`: two failing cases assumed3D saved a conditional journal checkpoint and explicit download invoked `persist(true)`. The current approved implementation forces a typed save plan, exports fresh canonical GLB and publishes that GLB; export/download directly returns current bytes without creating a Library version. Assertions now require `force:true`, GLB export passed to `persistModel3DProject`, the same journal/checkpoint commit protections, and a loaded-runtime export path that cannot call persist/commit. Existing image/video render-free project saves, PDF canonical bytes, preview safety, content-bound upload identity and all Office delivery checks remain. The case title now accurately distinguishes project-only autosave from the typed3D save. No3D product or3D-specific test file was edited.
- `office-real-file-roundtrip`: the native Deck route no longer has a hosted/pro split or `proSaved` shadow item. It must pass `officeSource.item` and its access-error callback into `useDeckEditor`; the retired pro state is now explicitly forbidden. Route admission checks are exact: Deck/Grid use `item`, rich doc uses `openedItemRef.current`, not an expanded set of accepted alternatives. The next assertion exposed Grid's changed reload callback: it refreshes the rendition **and** increments `reloadNonce`; both actions are required. PNG rejection, source/full-only selection, signed403 refresh, exact cache mode and real PPTX/XLSX/DOCX mutation/reopen tests are unchanged and pass.
- `lightweight-office-frontend`: Grid's old independent `!snapshotReady &&` spinner became an error-first `sourceFailed ? ... : !snapshotReady ? ...` branch. The check now requires the actual failure panel, rendition retry, parser nonce increment, loading marker and the delegated loader's `role="status"`. Accessibility/error exits were preserved, not removed.
- `image-edge-snapping`: the moving handler now calls `constrainActiveCrop()` rather than inline document-only clamping. The assertion follows this exact helper and pins both its object-host clamp/early return and its document fallback. All nine mathematical snapping tests, motion/zoom hysteresis, Alt behavior, geometry permission, scale/finalize and shared gesture-state assertions remain unchanged.
- `rendition-callback-identity`: the loader now constructs an inert `GridLoadIdentity` before the waiting guard, so literal first-line matching was obsolete. The test locates the unique real `loadGridSheets` effect through TypeScript AST, requires dependency array exactly `[loadKey]`, allows only the `identity` declaration before `waitingForSource`, requires its early return/loading signal and forbids source parsing/snapshot creation/ready state in the waiting branch. Existing same-instance workbook replacement, signed-source condition, stable callback identities, retry keys and honest failure actions remain.

## Remaining gaps

No behavioral defect was found in this five-file reconciliation. These checks do not replace parent-owned global suite/typecheck/host acceptance. No safety assertion, mathematical case, Office roundtrip, timeout budget or test was deleted/skipped; test count remains35. `git diff --check` passes for all five files.
