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
- The standalone host opts into an explicit close callback; the shared edit-bar agent control reflects that pane state and toggles the same conversation open/closed. Hosts without the callback retain their existing active-state/button behavior.
- A focused runtime case verifies the agent stays hidden on initial open, closing/reopening the same typed file, and switching to another canonical Library artifact. The original live-context, command-review, r2-save, and Task-snapshot path remains in the edit acceptance test.
- The shared edit bar has no redundant pin/unpin button; Alt+Enter, keyboard movement, drag/dock, collapse, and restore continue to own its placement. All edit-bar agent buttons use the new `EditBarAgentIcon` glyph. The AI-only chooser remains absent where its capability launcher is unavailable.
- The one-task source loader now narrowly falls back to reading package JavaScript with its nearest `package.json` module format only for Node 22's `ERR_INVALID_RETURN_PROPERTY_VALUE` from the canonical asynchronous TS loader composition. The same focused runtime test therefore runs with the package's generic loader chain instead of omitting it.
- `git diff` remains limited to the above W01 files plus other owners' concurrent W02/W03 changes; those are not part of W01 commits.

## Verification

- Focused Library/Task-history runtime passed **4/4** using the canonical loader chain and DOM guard: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-name-pattern='real Library→MyLibrary→MaterialStandaloneEditor|real Library Edit keeps Task chat closed until the edit-bar agent action|standalone Library editor keeps its Task conversation hidden|real Task history reopens the saved Library revision' tests/one-task-library-agent-acceptance.test.mjs`.
- Focused shared edit-bar runtime/source guards passed **40/40** with the canonical loader chain: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/edit-bar-single-row.test.mjs tests/edit-bar-dock-console.test.mjs tests/plugin-chrome-agent-drawer.test.mjs tests/advanced-editor-v9-edit-bar.test.mjs`.
- The shared v8 edit-bar and one-task image runtime slice also passed **11/11** with the canonical loader chain. This covers the tools-launcher registration/focus target and confirms the Library image route retains its Agent focus behavior after pin/glyph cleanup.
- The initial one-task loader composition exposed Node's CommonJS `react-dom/index.js` fallback error. With the narrowly scoped helper fallback above, the same canonical command passed 4/4; no assertion was disabled. The two initial chrome failures were brittle static-source expectations (a 160-character window and pre-toggle optional-chain spelling); those checks now express the marker/class structure and current focus call, and all 40 tests pass.

Parent owns the shared typecheck and dev-slot freshness checks; no browser or full suite is authorized.
