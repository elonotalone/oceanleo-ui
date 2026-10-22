# W11 delivery — three.js sandbox runtime, generator, GameRoute single mode

## Live path findings
- Sandbox document is built by `buildSandboxDocument` in game `lib/ugc/bundle.ts`; the only runtime slot is the
  string `engineRuntime` (and `skeletonRuntime`), inlined as `<script>` in `<head>`. CSP `connect-src 'none'`, iframe
  `sandbox="allow-scripts allow-pointer-lock"` live elsewhere and are untouched.
- Main-site in-place play (`components/UgcGameFrame.tsx`, uses `lib/ugc/stored-play.ts`) assembles the document in the page
  via `srcDoc`-style stored play; it fetches `/leoplay-engine.js` + `/leoplay-skeleton.js` only for legacy `format === "js"`.
  For full `html` documents (the current format) no engine runtime is injected today at all.
- Library/editor preview uses `SandboxPreviewHost.tsx` / `UgcArtifactPlayer.tsx` (same stored-play path). Published `s-<32hex>`
  hosts use the publisher scripts reading `engine-runtime.generated.js` (same slot).

## What changed
### game repo (commit cc834e2, new files only)
- `lib/engine3d/build-three-runtime.mjs` (+ `leo-engine3d.runtime.js`): builds three r180 (pinned by game `package.json`,
  from `node_modules/three/build/three.cjs`, minified with Next's bundled swc, no new deps) into one IIFE that installs frozen,
  non-writable `window.THREE` and `window.LeoEngine3D` (`createStage` = renderer/scene/camera/lights/resize/rAF loop/dispose).
  Output `lib/engine3d/three-runtime.generated.js` and `public/leoplay-three.js` (696,517 bytes, deterministic, content-hash version).
  `node lib/engine3d/build-three-runtime.mjs [--check]`.
- `lib/ugc/three-runtime.ts`: `gameNeedsThree(source)` (uses `THREE.` / `LeoEngine3D`, or `<meta name="leoplay-runtime" content="three">`),
  `composeEngineRuntime({gameSource, engineRuntime, threeRuntime})` (appends three to the engine string only for 3D games; 2D untouched;
  3D without runtime throws, fail closed), `fetchThreeRuntime()`. It rides the existing `engineRuntime` slot, so it sits outside the
  user 2MB budget and needs no change to bundle.ts, CSP or sandbox attributes.
- `tests/ugc-three-runtime.test.ts` (5 tests): artifact in sync, evaluates in a bare vm and exposes frozen THREE r180/LeoEngine3D,
  detection, 3D doc includes three while 2D doc does not and CSP is identical (`connect-src 'none'`, no `<script src>`), fail-closed.
### oceanleo backend (commit 39bb7ab)
- `app/game_generation.py`: `THREE_RUNTIME_DOC` (window.THREE r180, LeoEngine3D, no import/CDN, add the meta tag) added to every
  prompt; `THREE_EXEMPLAR_SOURCE` (ski-derived 3D document, lint-clean) appended and `ski` exemplar prioritized when category/brief/remix
  indicates 3D (`wants_three`); lint rejects `import ... from "three"`, `import("three")`, `require("three")`, CDN module imports and
  `<script src=...three...>` with `THREE_IMPORT_HINT` repair text (flows through `build_repair_prompt`); other external scripts keep the
  generic rejection; THREE usage is accepted.
- `tests/test_game_three_runtime.py` (5 tests).
### oceanleo-ui (commit 6209c6dd)
- `GameRoute.tsx`, `game-editor/game-pages.ts`, `GameCodeStage.tsx`, `game-next-mode.ts`: removed `gameModeUnavailable`,
  `GAME_PRO_UNAVAILABLE`, `proUnavailableReason`, the adapter `mode`, `applyGameNextMode`/`isGameNextPro`/hosted-editor mode import.
  Game has Edit + Code aux page only, one mode.
- Tests: `tests/game-core-swap.test.mjs` (rewrote the "pro never mounts hosted frame" test into a single-mode regression test that fails
  if `gameModeUnavailable`/`proUnavailableReason`/`mode:`/`mode === "pro"`/`applyGameNextMode`/hosted-editor return or a `pro` page row is
  built; the two assertions of `game-pro-unavailable` title now assert absence), `tests/eas-w20-game-video-canvas.test.mjs` (one line flipped).
  No tests deleted.

## Verification
- `cd /root/projects/game && node --import ./tests/register-tsx.mjs --test tests/ugc-three-runtime.test.ts tests/ugc-engine-runtime.test.ts` -> 11 pass, 0 fail.
- `node lib/engine3d/build-three-runtime.mjs --check` -> ok.
- `cd /root/projects/oceanleo/backend && python3 -m pytest -q tests/test_game_three_runtime.py tests/test_game_generation_chain.py` -> 15 passed.
  (`test_game_iteration_preflight.py` and `test_game_generate_router_document.py` fail at collection in this environment on a pre-existing
  fastapi/pydantic `PYDANTIC_V2` import error, unrelated; not run.)
- oceanleo-ui: `run-light ... --test tests/game-core-swap.test.mjs tests/eas-w20-game-video-canvas.test.mjs` -> 12 pass, 0 fail.
- Typecheck of oceanleo-ui: see journal/final note below.
- `collab/adapters/game.ts` needed no change (no mode code).

## Now live: runtime travels inside the stored document (parent follow-up)
Every play path (main site, Library, s-hosts) plays the stored HTML, so the backend inlines the runtime at generation time; no
dirty game-repo host file is needed.
- `node lib/engine3d/build-three-runtime.mjs --out <dir>` also writes `<dir>/leoplay-three.js` + `<dir>/VERSION` (version + sha256).
  Vendored to `oceanleo/backend/app/game_runtime/` (commit in oceanleo repo). Re-run the same command after any three/helper change.
- `game_generation.py`: `game_needs_three` (mirror of `gameNeedsThree`), `inject_three_runtime` (one
  `<script data-leoplay-runtime="three@r180">` at the very start of `<head>`, head/html created if missing, `</script` and `<!--` escaped
  like `escapeForInlineScript`; idempotent; a forged marker script from the model is stripped and replaced by the real one),
  `strip_three_runtime`. `run_generation_chain` strips the runtime from `previous_source`/`remix_source` before they reach the model
  (repair/remix/iterate never feed 700KB back), lint ignores the marked script, injection happens after lint and before the 2MB
  `MAX_DOCUMENT_BYTES` check with a clear message when the runtime pushes the document over; `play_source` (moderation input) stays runtime-free.
- Host: `composeEngineRuntime` (game `lib/ugc/three-runtime.ts`) returns the engine unchanged when the document already carries the marker.
- Tests: `backend/tests/test_game_three_runtime.py` (13 tests: exactly one escaped inline runtime at head start, 2D unchanged, idempotent,
  forged marker, head creation, lint ignores runtime, vendored sha256 == VERSION and == game-repo artifact when present, chain stores runtime /
  hides it from repair context / 2D has none / cap error); game `tests/ugc-three-runtime.test.ts` (6).
- Verification: `cd backend && python3 -m pytest -q tests/test_game_three_runtime.py tests/test_game_generation_chain.py` -> 23 passed;
  `cd /root/projects/game && node --import ./tests/register-tsx.mjs --test tests/ugc-three-runtime.test.ts tests/ugc-engine-runtime.test.ts` -> 12 pass.

## Remaining
- Documents stored before this change that already use THREE have no runtime until regenerated/iterated; the host-side wiring in
  dirty game files (`UgcGameFrame.tsx` etc., `composeEngineRuntime` + `fetchThreeRuntime` with `public/leoplay-three.js`) is optional
  and now only covers those; not applied.
- Code page (`GameCodeStage`, not wired for this) shows the full stored source including the ~700KB inlined runtime script and counts it
  toward size; a UI that hides/re-attaches the marked script is a follow-up (the strip/inject functions make it simple). Saves from the Code
  page keep the script verbatim, so nothing is lost.
- `public/leoplay-three.js` and `fetchThreeRuntime` remain only for the optional host path above.

## Honest limitations
- WebGL inside the sandboxed frame was not verified (no browser allowed); `allow-scripts` iframes normally get WebGL, and the stage
  throws a visible fatal through the failure observer if context creation fails.
- Runtime adds ~700KB per 3D game document load (not cached across documents since inlined).
- Detection is textual; a game that builds the identifier `THREE` dynamically without the meta tag would not get the runtime.
- Backend router tests could not be run (env import error above). The prompt exemplar is a hand-condensed ski derivative, not run in a browser.
