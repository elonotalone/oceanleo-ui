# Final Library host harness follow-up

Scope: the six assigned tests and the explicitly added `tests/e2-right-pane-fixture.mjs` (task extension0fac06f2). Only four files required edits; the e2 test bodies and website restore assertions are unchanged. No product, browser, dependency, runtime, full-suite, push or deployment work was performed by this owner.

## Actual execution counts

| File | Before actual cases | Before result | Final actual cases | Final result |
| --- | ---: | --- | ---: | --- |
| cross-site-library |12|11pass/1fail|12|12pass|
| e2-result-canvas-stability |0|import failed before registration|3|3pass|
| e2-right-pane-claims |0|import failed before registration|8|8pass|
| g3-portal-typed-editor |0|import failed before registration|6|6pass|
| g3-website-material-restore |4|1pass/3fail|4|4pass|
| w1-material-edit-route |0|import failed before registration|8|8pass|
| **Total real cases** |**16**|12pass/4fail +4 import failures|**41**|**41pass,0fail/cancel/skip**|

The baseline reporter counted20 units (12pass/8fail) because each of the four never-running files appeared as one failed unit. This is not described as20 executed behavioral cases. Intermediate runs reported20 units13pass/7fail,32 units24pass/8fail, then41 actual cases38pass/3fail. Final batch is41/41.

All six-file batches used forced heavy admission with canonical loader/DOM guard:

```bash
OCEANDINO_FORCE_HEAVY=1 bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- \
  node --import ./tests/helpers/assert-dom-guard.mjs \
  --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test \
  tests/cross-site-library.test.mjs tests/e2-result-canvas-stability.test.mjs \
  tests/e2-right-pane-claims.test.mjs tests/g3-portal-typed-editor.test.mjs \
  tests/g3-website-material-restore.test.mjs tests/w1-material-edit-route.test.mjs
```

Logs: `/tmp/codex-final-library-before.log`, `/tmp/codex-final-library-after1.log`, `after2.log`, `after3.log` (same prefix), `/tmp/codex-final-library-final.log`.

## Harness repairs, not weaker behavior

- Shared e2 fixture: completed the popover `runAfterOverlayExit(element,done):cancel` stub with asynchronous callback and cancellation; completed the existing route fixture's capability/route exports. Real SplitWorkspace, shell ownership, same-item multiple claims, fullscreen state, identity of slot callbacks, editor mount counts and unsaved input preservation remain under test. No fixture-wide module compiler/DOM guard was changed.
- Portal: broke the data-module cycle only at unrelated `AgentChat` orchestration, returning its supplied `workspaceContent`. Real TaskFileWorkspace, MyLibrary, ArtifactActions, typed dispatcher, material host, current identity and ownership path still execute. Added the verified `getUserIdSnapshot`/AUTH event exports to the existing auth mock, with userId`owner` matching server fixture ownership. Upload functions still throw if unexpectedly invoked.
- Portal's pending Edit action is now icon-only: old text expectation became exact disabled/aria-disabled checks; the existing spinner check and no-early-editor/no-success-row checks remain. Website dispatch now stubs and expects the native `WebsiteLocalRoute`, not retired EmbeddedRoute/downstream real leaf imports.
- The current Library task belongs to `{appId:'library',siteId:'oceanleo'}`, as required by `libraryStandaloneEditorBinding`, not the material's origin site. The expected binding is exact, not one of multiple tolerated sites. Tests additionally pin editor app/site to that host and snapshot the original material site **before rendering**, requiring it to remain unchanged. Strict same item object, artifact/revision, source URL, exact once prepare and no-navigation assertions remain.
- W1 routing fixture: supplies the real `cacheableRenditionTwin` helper and its real pure artifact-contract prerequisites. The existing local-routing/capability-denied assertions are unchanged; no permissive no-op twin was substituted.
- Cross-site source contract: closed panels are intentionally retained instead of `display:none`; the test now requires closed-state marker, aria-hidden, inert and pointer-events-none/opacity-zero, while preserving the runtime-mount assertion and safe-origin/action/identity tests.

## Real defect found and handled by product owner

The website's three original red assertions were **not** changed. `useLibraryEditIntent`'s new raw URL fallback was firing on `/workspace/...`, before catalog resolution and then again after its action envelope. This caused a duplicate GET and consumed the bare location before the app was resolved. Reported with exact source and baseline failures; parent repaired it in29ecd7eb by limiting no-envelope restoration to `/library` (including trailing slash). Parent independently demonstrated original website tests1/4→4/4 and ran Library positive controls; this six-file batch also passes those unchanged four cases. This owner made no product patch.

## Remaining scope

No remaining red among these41 actual cases. No tests were deleted/skipped, no timeout/budget raised, and no owner/scope/late-response/current-identity/no-phantom behavior was relaxed. Parent owns global suite/typecheck and actual host acceptance. Bootstrap separately warned that the code map still references missing `website-editor-w11.test.mjs`; navigation metadata is outside this test-only scope and was reported without alteration.
