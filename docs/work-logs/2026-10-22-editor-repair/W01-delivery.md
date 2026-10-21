# W01 delivery — Library launch and shared edit bar

## Delivered

- Standalone Library editing opens at usable editor width with its existing Task conversation mounted but closed/inert. One explicit edit-bar Agent button reveals/toggles that same conversation on first click; reopen/switch remains closed unless explicitly requested. Existing Task hosts preserve their mounted chat behavior.
- Common edit-bar pin/unpin affordance is removed while drag/dock/keyboard/collapse behavior remains. All common edit-bar Agent buttons use the shared code-native glyph. The left context action no longer exposes an AI-only chooser when there is no usable non-agent panel.
- The real Library-to-Task runtime acceptance retains live file context, command review, source/project bytes, revision receipt, Task snapshot, history/reopen, and stale-reply assertions.
- Acceptance now uses per-artifact immutable fixture heads with CAS validation and unique revision IDs. Opening/hydrating without a user action must produce zero uploads and zero revision commits. The accepted marker edit/save must produce exactly one r1→r2 receipt, whose precise project bytes contain the marker and whose Task/history head references that same revision.
- The one-task loader follows Mammoth’s declared browser-entry mapping so Node/JSDOM exercises the real browser DOCX parser without launching a browser or replacing the parser with a mock.

## Commits and owned files

- `cae64416 fix(ui): keep Library agent closed until requested`
- `07bf3412 fix(ui): make Library agent opt-in and simplify edit bar`
- `f6d5e38c test(ui): align Library chrome runtime acceptance`
- `3ef9f69a test(ui): enforce Library save isolation acceptance`

Follow-up acceptance files committed by W01: `tests/helpers/one-task-library-source-loader.mjs`, `tests/editor-repair-acceptance-chat-layout.test.mjs`, `tests/editor-repair-acceptance-chrome.test.mjs`, `tests/library-shared-split-runtime.test.mjs`, `tests/workspace-render-stability.test.mjs`, and `tests/one-task-library-agent-acceptance.test.mjs`. The original implementation commits contain the scoped standalone host, split visibility callback, shared glyph, and edit-bar cleanup described above.

## Verification

- Full canonical one-task Library/Task acceptance: **8/8 passed**, including the zero-write hydration control and exact-one-revision marker receipt.

  ```sh
  bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=1 --test-timeout=180000 tests/one-task-library-agent-acceptance.test.mjs
  ```

- Four Library/chrome runtime cases: **15/15 passed**.

  ```sh
  bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=1 tests/editor-repair-acceptance-chat-layout.test.mjs tests/editor-repair-acceptance-chrome.test.mjs tests/library-shared-split-runtime.test.mjs tests/workspace-render-stability.test.mjs
  ```

- Earlier canonical-loader W01 slices: shared chrome tests **40/40** and v8 shared edit-bar plus one-task image runtime **11/11** (recorded in `W01-journal.md`).
- Parent owns the shared typecheck, broad integration sweep, and dev-slot freshness checks. W01 did not run a browser, screenshot, build, or full suite.

## Causal note and boundary

The strict hydration negative control exposed a real Tiptap no-op update: `Editor.setEditable` emits `update` with `docChanged=false`, no steps, and no metadata, which the RichDoc `onUpdate` handler had counted as a user mutation. Root owns the narrow RichDoc correction; W01 made no product edit for that issue. V01’s isolated current/pre-correction A/B reproduced the same cause. Temporary process-only event and transport tracing was removed before commit.

Parent independently verifies the landed commits and cross-owner integration. No production/deploy action was performed.
