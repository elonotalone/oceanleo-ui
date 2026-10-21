# W06 delivery — legacy video node fidelity

Date: 2026-10-22 (Asia/Shanghai)

W06 restores the actual v1 workflow node view through the adopted LeoNode and existing canvas command APIs. Legacy nodes render their original named input/output handles with accessible labels and deterministic positions; source kind and parameters are shown as React text/forms. Known scalar parameters have bounded local edits, while unsupported and non-scalar source values remain read-only and the complete original node data is preserved. Title and graph-position edits update the source representation as well as the project model.

Legacy source nodes are rejected by provider, generation, and Run command availability and execution before provider adapters or receipts, with a clear no-cost result. Native v2 generation and its existing generic ports remain covered by regression controls. W06 does not add a second workflow engine or claim every legacy parameter is editable.

The focused regression uses the pinned actual artifact `/tmp/w04-video-source.bin` (SHA-256 `a9cf73ccd3ac858cdac83e09d7b616e8ebabfd715b65563dfb5c28c72fcd8b31`). It renders nodes from the actual `projectToFlow` result and asserts that `legacySourceNode` is copied into view data, then checks named handles, actual params, safe text rendering, project round-trip edits, read-only/stale/out-of-range rejection, legacy no-provider behavior, native-v2 behavior, and selection controls.

Verification:

```text
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --experimental-strip-types --test tests/legacy-workflow-node.test.mjs
4 tests passed, 0 failed
```

The test runner emits the existing `react-test-renderer` deprecation warning. No browser/Playwright, install, full typecheck, full suite, build, production path, deployment, push, or remote-history operation was run. Parent owns full/shared/video typechecks and final integration acceptance. W04 owns the shared `project-model.ts` source projection, save-receipt and resource-dependency work, and its commit; W06 did not edit or stage those files.

Video commits:

- `cf00d30 fix: preserve legacy video workflow fidelity` — W06 renderer, command guard/edits, selection filtering, and helper.
- `c71a559 test: verify legacy video source projection` — focused runtime regression through the real `projectToFlow` projection.

UI evidence commits:

- `411377a2 docs: record W06 legacy video repair` — initial W06 state and journal.
- This delivery record is committed with the updated state and journal in a dedicated W06 evidence commit.

## Test-only hosted-save integration follow-up

Parent later authorized W06 to take exclusive ownership of the actual hook runtime test and narrowly repair the test loader. Commit `2573f3e test: cover hosted video save lifecycle` contains only:

- `tests/workflow-history-hook.test.tsx`
- `tests/canvas-workflow.test.mjs`

The hook test drives real `useCanvasWorkflow` behavior through hosted open/save messages. It verifies private source/preview staging (and no public write/export), correlated `VIDEO_SAVE_FAILED` errors, same/wrong/already-seen old revision receipt rejection, newer-edit dirty retention, and a fresh-grant reopen where source edits persist but runtime locators do not. It also exercises A-slow/B-fast load ordering and verifies that the late A continuation cannot replace B and that A's discarded runtime URL is revoked. The canvas test loader supplies the actual legacy helper module required by the command registry. That canvas test file also retains adjacent W04 assertions already present and explicitly requested to be preserved; no W04 product file was included in this test commit.

Focused verification after W04's seen-revision guard landed:

```text
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- ./node_modules/.bin/tsx --require ./tests/css-stub-loader.cjs --test --test-force-exit tests/workflow-history-hook.test.tsx
2 tests passed, 0 failed

bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --experimental-strip-types --test tests/canvas-workflow.test.mjs
18 passed, 0 failed, 1 opt-in actual-source test skipped
```

No full suite, full typecheck, build, browser/Playwright, install, production path, deployment, or push was run. Parent owns remaining integration acceptance.
