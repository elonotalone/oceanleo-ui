# Toolbar interactions — result

## Outcome

Dropdown commands now reach their handlers without entering the dock controller's pointer-press/drag replay path. The fix is shared by all floating toolbar consumers: the controller ignores pointer starts from DOM-external targets and explicitly marked anchored-popover/selection-overflow surfaces, while ordinary controls physically inside the pill retain the established press/hold gesture policy. The dock host no longer reserves or displays a layout row; a zero-height host keeps a 40px absolute drop sentinel, and only an active floating drop shows its placeholder overlay. Docked positioning is anchored at the stage top, so the host no longer shifts editor content.

The causal failure was React portal bubbling: a dropdown's pointer event bubbled through the toolbar's logical React ancestor despite the menu being outside the toolbar DOM. The toolbar controller treated the press as a drag gesture, capturing/replaying input and preventing the actual command click. Filtering only external/menu surfaces fixes this without disabling main-pill movement gestures.

## Changed files

- `src/shell/edit-bar-dock-controller.tsx` — added narrow portal/outside-target exclusion at pointer-down; retained in-pill control gesture behavior.
- `src/shell/EditBarDockHost.tsx` — removed the reserved/visible dock band, kept a 40px absolute sentinel and active-drop-only overlay.
- `src/shell/floating-toolbar-geometry.ts` — positioned the docked bar over the stage top edge without a clearance/reserved row.
- `tests/W5-edit-bar-command-effects.test.mjs` — exercises the real `FloatingContextToolbar` ancestor with actual image/video context-toolbar components and command effects. Image overflow actions cover rotate, lock, layer-up, copy, and delete; video dropdown covers duplicate/delete. Tests assert menu presses do not arm drag state and commands dispatch once. Also covers keyboard Enter activation and confirms the main-pill More trigger still arms/replays its established gesture.
- `tests/edit-bar-dock-console.test.mjs` and `tests/eas-w12-edit-bar-height.test.mjs` — update geometry/host assertions for a zero-height host and 40px sentinel, including default and active-drop states.

## Verification

All tests were run with `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test <file>`.

- `tests/W5-edit-bar-command-effects.test.mjs`: 10/10 passed.
- `tests/b18-edit-bar-gesture.test.mjs`: 3/3 passed.
- `tests/e1-edit-bar-double-press.test.mjs`: 24/24 passed.
- `tests/edit-bar-flight-grab.test.mjs`: 3/3 passed.
- `tests/eas-w12-edit-bar-height.test.mjs`: 4/4 passed.
- `tests/edit-bar-dock-console.test.mjs`: 12/12 passed.
- `git diff --check` on the owned source/test files passed.

## Limitations

No browser/Playwright or production checks were used, per task constraints. The tests use the DOM test harness; its existing jsdom CSS parser warning for `@starting-style` is non-fatal. Full typecheck/integration remains with the parent. PluginChromeFrame's matching zero-height host seam is owned by the layout-save agent and was coordinated separately.
