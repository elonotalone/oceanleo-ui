# W01 state — Library launch and common edit bar

## Facts

- Required bootstrap passed: `agent-bootstrap.sh` reports `main-only OK`.
- Repository is `main`, clean at start, `HEAD=32509307`; local history is ahead 16.
- Navigation chains read: `typed-artifact-editing`, `plugin-unified-chrome`, and `video-durable-run`.
- `useInlineAdvancedPanels` initializes `activeDrawerId` to the empty string; `usePluginChromePanels` initializes from explicitly pinned panels. The shared agent drawer is not pinned.
- `MyLibrary` mounts `MaterialStandaloneEditor` for a selected Library edit. When there is no existing right-pane slot, `MaterialStandaloneEditor` currently renders `TaskFileWorkspace` inside a `WorkspaceSessionProvider`. Its comment says the Library editor should keep the conversation visible from the first frame.
- Existing Task workspaces take the `existingPane` branch and reuse the already-mounted Task conversation. That behavior is distinct from opening a standalone Library editor and should remain intact.
- Parent approved adding `src/shell/material-library-standalone.tsx` and its focused runtime tests to W01 scope; existing Task behavior must remain intact, while standalone Library open/switch/reopen stays closed until the single edit-bar agent button is clicked.
- Correct absolute-path navigation impacts were recorded before edits: `material-library-standalone.tsx`, `FloatingContextToolbar.tsx`, `SelectionToolbar.tsx`, `selection-toolbar-chrome.tsx`, `plugin-chrome/PluginChromeFrame.tsx`, and `EditBarDockControls.tsx` are mapped to `oceanleo-ui`; `material-library-standalone.tsx` impacts `typed-artifact-editing` and the shared UI consumer set. An initial impact attempt used a repo-relative path from oceandino and returned `exists:false`; it was rerun using the full oceanleo-ui path and mapped correctly.

## Confirmed cause

A standalone Library edit automatically opens the left agent conversation because `MaterialStandaloneEditor` creates a Task-shaped workspace. The common editor drawer defaults closed, so changing its initial state would treat a downstream symptom and could break explicit toggling. The focused runtime reproducer confirms the current fresh-edit path mounts the Task chat beside the editor.

## Exact reproduction and next step

Baseline command: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-name-pattern='real Library→MyLibrary→MaterialStandaloneEditor|real Library Edit opens Task chat beside same editor' tests/one-task-library-agent-acceptance.test.mjs` — **2/2 passed**. The second case passed while asserting that a fresh Library edit has a left AgentChat from its first frame, confirming the defect in the current implementation and the contradictory historical expectation.

## Implementation

- `MaterialStandaloneEditor` keeps its Task-shaped conversation runtime but asks `TaskFileWorkspace` to start with the agent pane hidden. The prop defaults to visible, so Task history and other hosts keep their existing behavior.
- `SplitWorkspace` now invokes the host's visibility callback before focusing the mounted agent console. That makes the edit-bar button reveal the same real Task conversation rather than leaving it inert behind the hidden pane.
- The fresh standalone Library acceptance test now asserts the left pane is closed/inert on editor open, then clicks the explicit edit-bar agent button and verifies the same pane opens before exercising its existing command-review and r2-save flow.
- `git diff` remains limited to the above W01 files plus other owners' concurrent W02/W03 changes; those are not part of W01 commits.

## Verification

- Focused runtime test passed **2/2** with the test-specific loader and DOM guard: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --test --test-name-pattern='real Library→MyLibrary→MaterialStandaloneEditor|real Library Edit keeps Task chat closed until the edit-bar agent action' tests/one-task-library-agent-acceptance.test.mjs`.
- Important harness detail: omit `--experimental-loader ./tests/ts-extension-loader.mjs` for this one-task runtime test. Its `installOneTaskLibrarySourceLoader()` already resolves and transpiles the source graph; layering the generic loader makes Node 22.22 reject the CommonJS `react-dom/index.js` fallback with `ERR_INVALID_RETURN_PROPERTY_VALUE` before the test runs. A clean process using the test-specific loader passes.

Parent owns the shared typecheck and dev-slot freshness checks; no browser or full suite is authorized.
