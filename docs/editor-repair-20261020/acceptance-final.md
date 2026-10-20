# V1-r3 final independent acceptance — editor repair 2026-10-20

Independent behavioral acceptance after W1-r4 and ComputerDock landed. No product source edits. No ComputerDock edits. No browser, Playwright, screenshots, production, dep installs, service changes, child agents, LeoDev, or push.

**Verdict: not complete.** V1-r2 blockers are closed on landed commits: `pnpm typecheck` exit 0, `pnpm api:check` pass, `pnpm architecture:check` without the ComputerDock facade import. The wave still does not pass: **W6-r4 is not on main**, so pdf / audio / video-timeline / threed / game / video-canvas stay outside V1 class (a). Class (d) stays unverified.

Measured on oceanleo-ui `a06f249ffce890f6629307f887b9a02af68d049b` (ComputerDock) after W1-r4 `446b5bc63cc37204e478d716a5530fc1fd1f5e60`. Parent docs record `23a75157ceba9e2e78e996bacb341c302283c33c` followed (PARENT.md only; no product source). This report: `e99495990c91e258f956cafc50d7121e7032750d`. Integrity / CAS / origin / permission checks were not loosened. Pass here is never from source-string greps.

Round-1 `acceptance.md` overclaimed “13 plugins have load/mutate/save/reopen”. That was registry metadata. This file replaces that claim. Do not revive it.

## Claim classes

| Class | What it proves | What it does not prove |
|---|---|---|
| **(a) Positive source→edit→save→reopen** | Host-side model load, mutate, serialize, reopen for tested families | Browser clicks, pixel layout, every plugin UI |
| **(b) Negative no-blank-save** | Missing/unreadable source cannot become a saveable blank | Operator item `21c1e4d9-…` was not re-fetched |
| **(c) Static registration / contract** | Theme id, routable registry, save-contract shape, ≠ office | Actual hydrate or toolbar |
| **(d) Unverified real-browser** | — | Visual chrome, composer docking on screen, hosted iframe clicks in a real page |

No browser consent, so (d) stays unverified.

## Operator defects → owners (delivered vs pending)

| # | Symptom | Owner | Committed? | V1 coverage |
|---|---|---|---|---|
| 1 | Preview has body; Edit/Umo blank | W1 | r2 `c73a7b08` + sanitizer `91eb28b4` + r3 `f065cd3a` + r4 `446b5bc6` | source-load + richdoc-image |
| 2 | Autosave `integrity-failed` | W2 | UI `d97ef932` / `2863881f`, gateway `3ace4e8f` | save-integrity |
| 3 | Shared edit bar | W5 | `c1914a55` / `5a18771d` / `a4916f3d` | edit-bar (live `SelectionCommandGate` + `SelectionToolbar`) |
| 4 | Icon-only row + share/favorite | W3 | `f612459c` / `97347ee1` | chrome dedicated slots |
| 5 | 我的库 without SplitWorkspace | W3 | `97347ee1` / `034f3a22` | chrome + social receiver |
| 6 | Left AI composer mid-column | W4 | `70380329` + CSS `16494476` | chat-layout; generated CSS contains `data-agent-conversation` |
| 7 | Other adapters blank-open / save | W6 | `59e9e746` / `466ab3bf` / r3 `fe970ebe` | source-load + six-family (a); deck-hosted. **W6-r4 not landed** |

## (a) Actual positive round-trips (not the 13-plugin matrix)

Proven in `tests/editor-repair-acceptance-round-trip.test.mjs` (6/6), rerun on `446b5bc6`:

| Family | Load | Mutate | Reopen / gate |
|---|---|---|---|
| richdoc | markdown hydrates HTML | — | HTML reopen keeps 自评报告 |
| grid | csv hydrates 上海 | in-memory cell `99` | sourceless durable **throws** |
| chart-editor@1 | inline option | series `[120]→[240]` | JSON reopen |
| website | stored `website-source@1` | `website.set-theme-accent` | accent `#112233` |
| design-canvas | stored design-document | title command (title ≥ 8 chars) | serialized title |
| image | Fabric project JSON | — | reopen text; `imageSaveAdmitted` refuses until `sourceReady` |

Not claimed as V1 (a): **pdf, audio, video-timeline, threed, game, video-canvas, deck**. Host-side parsers exist for some of those families. That is not a V1 serialize-reopen. W6-r2 owner tests include a constructed timeline mutate/reopen and a workflow-graph add-node path; those stay owner evidence, not this file’s (a) matrix. Game W6-r2 still mixes a preview planner with source-string checks — not (a).

## (b) Negative no-blank-save

- Richdoc durable without URL → `source: "empty"` / 缺少可验证的 source/full (`source-load` + `richdoc-image`).
- Grid durable without source throws.
- Chart missing inline → `ChartSourceError`.
- PDF `allowBlank: false` rejects.
- Deck `deckProjectUrlFor` empty bytes → `""`.
- Image empty project JSON fetch rejects.
- Save contracts refuse missing `full`, http, view-only, empty digest (`EMPTY_BLOB_SHA256` local refusal).
- `artifactSaveFailureRetryable({ code: "integrity-failed" }) === false`.
- CAS conflict keeps dirty draft (`withRecovery`); integrity-failed is not auto-retried (W2 focused 17/17).

## (c) Static registration

`plugin-matrix` 3/3: 13 `PLUGIN_THEME_SPECS` ids match registry/theme/save-contract/capability routing. **Not a round-trip.**

## Live consumers (not deleted helpers)

- **Edit bar:** `EditBarCommandDispatcher` is gone (`5a18771d`). Tests use `SelectionCommandGate.holdInteraction` / `releaseInteraction` and a live `SelectionToolbar` bold click through `onCommand` into Fabric. Stale / released / switched ids rejected.
- **Chrome:** share and favorite sit in dedicated `data-global-row-slot` share/favorite (`97347ee1`).
- **我的库 / social:** share copies identity and toasts `已复制`; delayed favorite cannot flip a new item; `/library` typed `mine`/`edit` receipt opens a different item and ignores invalid envelopes (`034f3a22`).
- **Chat:** `FunctionAgentChat` column fills height; composer last/`shrink-0`. `PluginAgentPanel` + chrome aside form a `min-h-0` flex column. Generated `ui.css` contains `:has([data-agent-conversation])` (`16494476`).
- **Sanitizer:** real DOMPurify under JSDOM; XSS stripped; unavailable sanitizer throws (parent `91eb28b4`).
- **W1-r4:** `loadHtml` stubs without `source` still admit image-only HTML; DOCX `Uint8Array` views copy into a real `ArrayBuffer` (`446b5bc6`, V1 image 2/2 + W1 20/20).
- **Hosted deck:** human fill stamps `origin: "user"`; forged agent `origin:user` stays unstamped (`fe970ebe`, V1 deck 4/4 + W6-r3 5/5).

## Precise pending gaps (do not mark wave pass)

### 1. W6-r4 not landed

No `deliveries/W6-r4.md`, no `tests/W6-r4-*.test.mjs`, no W6-r4 commit. `signals/W6-r4.md` is an untracked inventory journal only. Parent `signals/PARENT.md` (`23a75157`): do not treat W6-r4 as landed until that delivery exists with a commit id.

Remaining families stay classified:

| Family | Honest class on this tree |
|---|---|
| pdf | **(b)** missing-source refuse. Host `loadPdfDocument` / manifest exists. No V1 (a). |
| audio | **(b)** admission + no mutate until ready. Host parse/serialize exists. No V1 (a). |
| video-timeline | W6-r2 constructed-doc mutate/reopen (not a stored library item). **Not V1 (a).** |
| threed | **(b)** persistence admission. No V1 (a). |
| game | **(b)** durable missing envelope. Play preview non-editable. Code preview planner is not serialize-reopen. **Not V1 (a).** |
| video-canvas | W6-r2 workflow-graph add-node / flush stub. Persist lives in workflow-carrier. **Not V1 (a).** |
| deck | Hosted toolbar + origin gate (command), empty-bytes **(b)**. **Not V1 (a)** serialize-reopen. |

### 2. Unverified (d)

No browser. No LeoDev HTTP. No production. Item `21c1e4d9-0818-4bbe-ae33-b4d01a5beafd` not re-opened. Full package suite is parent-only.

### 3. Closed this round (were V1-r2 blockers)

W1 `tsc` errors in `richdoc-pro-source.ts` and `rich-doc-model.ts` are gone on `446b5bc6`. ComputerDock `../../facades/devices` import is gone on `a06f249f` (`../../api/devices` `listDevices`). Independently: `pnpm typecheck` exit 0; `pnpm architecture:check` `domain boundaries ok (7729 import/export edges)`.

## V1 owned suite

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
After W1-r4 landed, richdoc-image + source-load + round-trip rerun **16/16**.

| File | Tests | Result | Landed commit |
|---|---|---|---|
| plugin-matrix | 3 | 3 pass | registry (c) |
| source-load | 8 | 8 pass | rerun on `446b5bc6` |
| save-integrity | 3 | 3 pass | W2 |
| edit-bar | 5 | 5 pass | W5-r3 |
| chrome | 2 | 2 pass | W3 |
| chat-layout | 2 | 2 pass | W4 |
| round-trip | 6 | 6 pass | rerun on `446b5bc6` |
| social | 2 | 2 pass | W3-r3 |
| richdoc-image | 2 | 2 pass | W1-r3 / rerun W1-r4 |
| deck-hosted | 4 | 4 pass | W6-r3 `fe970ebe` |
| **Total** | **37** | **37 pass** | no W6-r4 files |

## Focused owner regressions (not full suite)

| Suite | Result |
|---|---|
| W1-r4 + W1 image-empty + source-import + hosted-selection | **20/20** on `446b5bc6` |
| W2 session/integrity/retry/record-saved-item | 17/17 |
| W3 chrome + W3-r3 receiver + W4 conversation | 18/18 |
| W5-r3 hold + W5-r2 lifetime + W5 effects | 15/15 |
| W6-r2 + W6 source lifecycle + W6-r3 toolbar + iframe sandbox | 24/24 (8+7+5+4) |
| oceanleo `backend/tests/test_w2_revision_wire_integrity.py` | 11 passed, 1 warning (deprecation). No production DB write. |

Did not run `tests/W6-r2-commands-hosted-deck.test.mjs` as final deck evidence: it still imports r2 helpers. Did not run ComputerDock suites (not V1). Did not treat untracked `signals/W6-r4.md` as delivery.

## Package checks

```
bash .../agent-io-guard.sh run-heavy -- pnpm typecheck
# exit 0 on a06f249f after 446b5bc6 — `tsc --noEmit`, no errors

bash .../agent-io-guard.sh run-light -- pnpm api:check
# pass (`scripts/public-api-snapshot.mjs --check`)

bash .../agent-io-guard.sh run-light -- pnpm architecture:check
# pass — domain boundaries ok (7729 import/export edges)
# ComputerDock.tsx imports ../../api/devices, not ../../facades/devices
```

Generated CSS: `src/theme/ui.css` still contains `data-agent-conversation` (`16494476`).

## Parent-only remaining

1. **W6-r4** must land (`deliveries/W6-r4.md` + commit id) with host-model (a) or honest hosted-iframe fail-closed + command-reaches-API tests. Resume V1-r3 for that delta only. V1 must not invent cores or edit W6 product files.
2. Full package suite. LeoDev freshness / twin-only bump. **No 上线. No production. No push by V1.**
3. Unverified (d).

Parent independently reruns required checks per kernel.
