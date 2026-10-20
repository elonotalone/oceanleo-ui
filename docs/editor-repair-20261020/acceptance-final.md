# V1-r3 final independent acceptance — editor repair 2026-10-20

Independent behavioral acceptance after W1-r4, ComputerDock, and W6-r4 landed. No product source edits. No ComputerDock edits. No browser, Playwright, screenshots, production, dep installs, service changes, child agents, LeoDev, or push.

**Verdict: complete** for V1 host-side acceptance on the commits that landed. `pnpm typecheck` exit 0, `pnpm api:check` pass, `pnpm architecture:check` without the ComputerDock facade import (measured on `a06f249f` after W1-r4; W6-r4 added tests/docs only). W6-r4 `96bf746a` independently rerun **6/6**. Class (a) now covers eleven host-side families. Game is not a document round-trip. Class (d) stays unverified (no browser consent). This is not a 13-plugin metadata pass.

Measured on oceanleo-ui `96bf746a9ce9a5c65e3177d5aa253f3c04f935f2` (W6-r4) after ComputerDock `a06f249f` and W1-r4 `446b5bc6`. Prior V1-r3 report `e9949599` / id record `c3e487d7`. Integrity / CAS / origin / permission checks were not loosened. Pass here is never from source-string greps.

Round-1 `acceptance.md` overclaimed “13 plugins have load/mutate/save/reopen”. That was registry metadata. This file replaces that claim. Do not revive it.

## Claim classes

| Class | What it proves | What it does not prove |
|---|---|---|
| **(a) Positive source→edit→save→reopen** | Host-side model load, mutate, serialize, reopen for tested families | Browser clicks, pixel layout, every plugin UI |
| **(b) Negative no-blank-save** | Missing/unreadable source cannot become a saveable blank | Operator item `21c1e4d9-…` was not re-fetched |
| **(c) Static registration / contract** | Theme id, routable registry, save-contract shape, ≠ office | Actual hydrate or toolbar |
| **(d) Unverified real-browser** | — | Visual chrome, composer docking on screen, hosted iframe clicks in a real page |

No browser consent, so (d) stays unverified.

## Operator defects → owners

| # | Symptom | Owner | Committed? | V1 coverage |
|---|---|---|---|---|
| 1 | Preview has body; Edit/Umo blank | W1 | r2 `c73a7b08` + sanitizer `91eb28b4` + r3 `f065cd3a` + r4 `446b5bc6` | source-load + richdoc-image |
| 2 | Autosave `integrity-failed` | W2 | UI `d97ef932` / `2863881f`, gateway `3ace4e8f` | save-integrity |
| 3 | Shared edit bar | W5 | `c1914a55` / `5a18771d` / `a4916f3d` | edit-bar (live `SelectionCommandGate` + `SelectionToolbar`) |
| 4 | Icon-only row + share/favorite | W3 | `f612459c` / `97347ee1` | chrome dedicated slots |
| 5 | 我的库 without SplitWorkspace | W3 | `97347ee1` / `034f3a22` | chrome + social receiver |
| 6 | Left AI composer mid-column | W4 | `70380329` + CSS `16494476` | chat-layout; generated CSS contains `data-agent-conversation` |
| 7 | Other adapters blank-open / save | W6 | `59e9e746` / `466ab3bf` / r3 `fe970ebe` / r4 `96bf746a` | source-load + eleven-family (a); deck-hosted; game not (a) |

## (a) Actual positive round-trips (not the 13-plugin matrix)

V1 file `tests/editor-repair-acceptance-round-trip.test.mjs` (6/6), rerun on `96bf746a`:

| Family | Load | Mutate | Reopen / gate |
|---|---|---|---|
| richdoc | markdown hydrates HTML | — | HTML reopen keeps 自评报告 |
| grid | csv hydrates 上海 | in-memory cell `99` | sourceless durable **throws** |
| chart-editor@1 | inline option | series `[120]→[240]` | JSON reopen |
| website | stored `website-source@1` | `website.set-theme-accent` | accent `#112233` |
| design-canvas | stored design-document | title command (title ≥ 8 chars) | serialized title |
| image | Fabric project JSON | — | reopen text; `imageSaveAdmitted` refuses until `sourceReady` |

W6-r4 `tests/W6-r4-remaining-families.test.mjs` independently **6/6** on `96bf746a`. Five of those are host-side (a). Game is not.

| Family | Load | Mutate | Reopen / gate |
|---|---|---|---|
| pdf | pdf-lib bytes admitted | `addPdfTextAnnotationAt` 页边批注 | `loadPdfDocument` keeps the note; no-bytes refuse |
| audio | `inspectAudioProject` next + `hasSource` | `keepWindowsAfterCut` / delete command | serialized cut windows `[0–2],[4–10]`; commands empty while loading |
| threed | `inspectModel3DProject` stored next | `applyModel3DNextControl` background `#112233` | JSON reopen keeps view; empty model refuse-save |
| video-timeline | `oceanleo.timeline.v1` envelope | clip text 片头字幕 → 修订后的字幕 | parse/reopen restores text |
| video-canvas | inline workflow graph | `addVideoCanvasNode` `fx1` | flush/reopen last node `fx1`; `sourceReady: false` refuse blank |

Not claimed as (a):

- **game** — play preview `planGamePreviewControl` does not edit the game document; durable missing envelope is fail-closed **(b)**. Not a document round-trip.
- **deck** — hosted toolbar + origin gate (command), empty-bytes **(b)**. No host serialize-reopen.

Audio/3D proofs are project/command surfaces, not a browser waveform or model-viewer click.

## (b) Negative no-blank-save

- Richdoc durable without URL → `source: "empty"` / 缺少可验证的 source/full (`source-load` + `richdoc-image`).
- Grid durable without source throws.
- Chart missing inline → `ChartSourceError`.
- PDF no bytes / `allowBlank: false` rejects.
- Deck `deckProjectUrlFor` empty bytes → `""`.
- Image empty project JSON fetch rejects.
- Audio capture null refuse; 3D `modelLoaded: false` refuse; video-canvas `sourceReady: false` refuse; game durable missing envelope refuse.
- Save contracts refuse missing `full`, http, view-only, empty digest (`EMPTY_BLOB_SHA256` local refusal).
- `artifactSaveFailureRetryable({ code: "integrity-failed" }) === false`.
- CAS conflict keeps dirty draft (`withRecovery`); integrity-failed is not auto-retried (W2 focused 17/17).

## (c) Static registration

`plugin-matrix` 3/3: 13 `PLUGIN_THEME_SPECS` ids match registry/theme/save-contract/capability routing. **Not a round-trip. Not eleven-plus-two (a).**

## Live consumers (not deleted helpers)

- **Edit bar:** `EditBarCommandDispatcher` is gone (`5a18771d`). Tests use `SelectionCommandGate.holdInteraction` / `releaseInteraction` and a live `SelectionToolbar` bold click through `onCommand` into Fabric. Stale / released / switched ids rejected.
- **Chrome:** share and favorite sit in dedicated `data-global-row-slot` share/favorite (`97347ee1`).
- **我的库 / social:** share copies identity and toasts `已复制`; delayed favorite cannot flip a new item; `/library` typed `mine`/`edit` receipt opens a different item and ignores invalid envelopes (`034f3a22`).
- **Chat:** `FunctionAgentChat` column fills height; composer last/`shrink-0`. `PluginAgentPanel` + chrome aside form a `min-h-0` flex column. Generated `ui.css` contains `:has([data-agent-conversation])` (`16494476`).
- **Sanitizer:** real DOMPurify under JSDOM; XSS stripped; unavailable sanitizer throws (parent `91eb28b4`).
- **W1-r4:** `loadHtml` stubs without `source` still admit image-only HTML; DOCX `Uint8Array` views copy into a real `ArrayBuffer` (`446b5bc6`, V1 image 2/2 + W1 20/20).
- **Hosted deck:** human fill stamps `origin: "user"`; forged agent `origin:user` stays unstamped (`fe970ebe`, V1 deck 4/4 + W6-r3 5/5).

## Residual (not V1 blockers)

### 1. Unverified (d)

No browser. No LeoDev HTTP. No production. Item `21c1e4d9-0818-4bbe-ae33-b4d01a5beafd` not re-opened. Full package suite is parent-only.

### 2. Closed this wave (were V1-r2 / early V1-r3 blockers)

W1 `tsc` errors gone on `446b5bc6`. ComputerDock facade import gone on `a06f249f`. W6-r4 landed `96bf746a` and independently 6/6.

## V1 owned suite (rerun on `96bf746a`)

Loader (six files together are classified heavy; ran in batches of ≤5):

```
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- \
  node --import ./tests/helpers/assert-dom-guard.mjs \
  --experimental-strip-types \
  --experimental-loader ./tests/ts-extension-loader.mjs \
  --test --test-concurrency=1 --test-timeout=180000 \
  tests/editor-repair-acceptance-<file>.test.mjs
```

Batch 1 (21/21): plugin-matrix, source-load, save-integrity, edit-bar, chrome.
Batch 2 (16/16): chat-layout, round-trip, social, richdoc-image, deck-hosted.

| File | Tests | Result |
|---|---|---|
| plugin-matrix | 3 | 3 pass |
| source-load | 8 | 8 pass |
| save-integrity | 3 | 3 pass |
| edit-bar | 5 | 5 pass |
| chrome | 2 | 2 pass |
| chat-layout | 2 | 2 pass |
| round-trip | 6 | 6 pass |
| social | 2 | 2 pass |
| richdoc-image | 2 | 2 pass |
| deck-hosted | 4 | 4 pass |
| **Total V1** | **37** | **37 pass** |

W6-r4 owner file (not V1-owned; independently rerun):

```
bash .../agent-io-guard.sh run-light -- \
  node --import ./tests/helpers/assert-dom-guard.mjs \
  --experimental-strip-types \
  --experimental-loader ./tests/ts-extension-loader.mjs \
  --test --test-concurrency=1 --test-timeout=180000 \
  tests/W6-r4-remaining-families.test.mjs
# 6/6 pass on 96bf746a
```

## Focused owner regressions (earlier this owner, still landed)

| Suite | Result |
|---|---|
| W1-r4 + W1 image-empty + source-import + hosted-selection | **20/20** on `446b5bc6` |
| W2 session/integrity/retry/record-saved-item | 17/17 |
| W3 chrome + W3-r3 receiver + W4 conversation | 18/18 |
| W5-r3 hold + W5-r2 lifetime + W5 effects | 15/15 |
| W6-r2 + W6 source lifecycle + W6-r3 toolbar + iframe sandbox | 24/24 (8+7+5+4) |
| W6-r4 remaining families | **6/6** on `96bf746a` (this delta) |
| oceanleo `backend/tests/test_w2_revision_wire_integrity.py` | 11 passed, 1 warning (deprecation). No production DB write. |

Did not run `tests/W6-r2-commands-hosted-deck.test.mjs` as final deck evidence: it still imports r2 helpers. Did not run ComputerDock suites (not V1). Did not commit untracked `signals/W6-r4.md`.

## Package checks

```
bash .../agent-io-guard.sh run-heavy -- pnpm typecheck
# exit 0 on a06f249f after 446b5bc6 — `tsc --noEmit`, no errors
# W6-r4 96bf746a is tests + deliveries/W6-r4.md only; no src/ change

bash .../agent-io-guard.sh run-light -- pnpm api:check
# pass (`scripts/public-api-snapshot.mjs --check`)

bash .../agent-io-guard.sh run-light -- pnpm architecture:check
# pass — domain boundaries ok (7729 import/export edges)
# ComputerDock.tsx imports ../../api/devices, not ../../facades/devices
```

Generated CSS: `src/theme/ui.css` still contains `data-agent-conversation` (`16494476`).

## Parent-only remaining

Full package suite. LeoDev freshness / twin-only bump. Unverified (d). **No 上线. No production. No push by V1.**

Parent independently reruns required checks per kernel.
