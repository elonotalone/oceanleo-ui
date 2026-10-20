# V1-r2 final independent acceptance — editor repair 2026-10-20

Independent behavioral acceptance. No product source edits. No browser, Playwright, screenshots, production, dep installs, service changes, child agents, or full package suite.

**Verdict: not complete.** Non-deck delivered owners are green under focused checks. Two ACTIVE r3 slices are still uncommitted (`W6-r3` hosted deck toolbar / agent origin, `W1-r3` image-only and intentional-empty document admission). This report does not mark the wave passing.

Measured on oceanleo-ui `85895785` plus **uncommitted W6-r3 and W1-r3 worktrees**. Integrity / CAS / origin / permission checks were not loosened. Pass here is never from source-string greps.

Round-1 `acceptance.md` overclaimed “13 plugins have load/mutate/save/reopen”. That was registry metadata. This file replaces that claim.

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
| 1 | Preview has body; Edit/Umo blank | W1 | r2 `c73a7b08` + sanitizer `91eb28b4`; **r3 uncommitted** | source-load + richdoc-image (r3 WIP) |
| 2 | Autosave `integrity-failed` | W2 | UI `d97ef932` / `2863881f`, gateway `3ace4e8f` | save-integrity |
| 3 | Shared edit bar | W5 | `c1914a55` / `5a18771d` / `a4916f3d` | edit-bar (live `SelectionCommandGate` + `SelectionToolbar`) |
| 4 | Icon-only row + share/favorite | W3 | `f612459c` / `97347ee1` | chrome dedicated slots |
| 5 | 我的库 without SplitWorkspace | W3 | `97347ee1` / `034f3a22` | chrome + social receiver |
| 6 | Left AI composer mid-column | W4 | `70380329` + CSS `16494476` | chat-layout; generated CSS now contains `data-agent-conversation` |
| 7 | Other adapters blank-open / save | W6 | `59e9e746` / `466ab3bf`; **r3 uncommitted** | source-load + round-trip families; deck-hosted (r3 WIP) |

## (a) Actual positive round-trips (not the 13-plugin matrix)

Proven in `tests/editor-repair-acceptance-round-trip.test.mjs` (6/6):

| Family | Load | Mutate | Reopen / gate |
|---|---|---|---|
| richdoc | markdown hydrates HTML | — | HTML reopen keeps 自评报告 |
| grid | csv hydrates 上海 | in-memory cell `99` | sourceless durable **throws** |
| chart-editor@1 | inline option | series `[120]→[240]` | JSON reopen |
| website | stored `website-source@1` | `website.set-theme-accent` | accent `#112233` |
| design-canvas | stored design-document | title command (title ≥ 8 chars) | serialized title |
| image | Fabric project JSON | — | reopen text; `imageSaveAdmitted` refuses until `sourceReady` |

Not claimed as (a): pdf, audio, video-timeline, threed, game, video-canvas, **deck**. Those have W6 fail-closed / lifecycle tests, not a V1 serialize-reopen.

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

## Precise pending gaps (do not mark pass)

### 1. W6-r3 hosted deck — uncommitted

No `docs/editor-repair-20261020/deliveries/W6-r3.md`. HEAD still has no `DeckHostedContextToolbar.tsx`. Committed `deck-hosted-selection-command.ts` still exports `hostedDeckInsertTextCommand` / `buildDeckHostedCommandSurface` with the r2 `send` stamp path; parent `bf53f828` set planner `origin: null`.

Uncommitted WIP in this worktree (not V1-owned, not in this commit):

- `src/shell/advanced-routes/DeckHostedContextToolbar.tsx`
- `DeckHostedRoute.tsx` wires `renderContextToolbar` → shared `SelectionToolbar`, `origin: "user"` only from the human callback, `readOnly` from `deckHostedItemReadOnly(item)`
- Agent `sendDeckHostedAgentSelectionCommand` omits `origin` even when `params.origin === "user"`; `applied: false`, `reviewed: true`
- Missing object selection is `请先选中对象再改格式。`, not a fake `slide-1`

V1 `tests/editor-repair-acceptance-deck-hosted.test.mjs` is **4/4 on that WIP**. It will fail on clean HEAD until W6-r3 commits. Parent should resume this chat after that commit and rerun that file.

### 2. W1-r3 image-only / intentional empty — uncommitted

Parent `b2974536` / registry `85895785`. HEAD `c73a7b08` treats tag-stripped length as admission, so image-only HTML is `source:empty`.

Uncommitted WIP (not V1-owned): `rich-doc-model.ts`, `richdoc-pro-source.ts`, `use-rich-doc-editor.ts`, W1 tests.

V1 `tests/editor-repair-acceptance-richdoc-image.test.mjs` is **2/2 on that WIP** using the **real sanitizer** (script stripped, `img` kept). Missing URL still refuse. Parent should resume after W1-r3 commits.

Current `pnpm typecheck` on the mixed WIP is red on W1:

```
src/shell/advanced-routes/richdoc-pro-source.ts(287,45): error TS2345:
  Property 'source' is missing in type '{ html: string; json?: unknown; error: string; }'
```

V1 must not edit that file. An earlier typecheck during W6-r3 editing also reported `DeckHostedRoute.tsx` `SelectionRevision` vs `number`; that line later moved and was not in the last tsc output.

### 3. `pnpm architecture:check` — pre-existing, not this wave

```
src/shell/cloud-computer/ComputerDock.tsx: ../../facades/devices:
  implementation modules must not depend on public facades
```

Import present since `d8295b1b` (2026-09-28). Not an editor-repair owner file. Parent-owned remaining.

### 4. Unverified (d)

No browser. No LeoDev HTTP. No production. Item `21c1e4d9-0818-4bbe-ae33-b4d01a5beafd` not re-opened. Full package suite is parent-only.

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

| File | Tests | Result | Depends on uncommitted r3? |
|---|---|---|---|
| plugin-matrix | 3 | 3 pass | no |
| source-load | 8 | 8 pass | no (sanitizer uses DOM; image-only is a separate file) |
| save-integrity | 3 | 3 pass | no |
| edit-bar | 5 | 5 pass | no (W5-r3 committed) |
| chrome | 2 | 2 pass | no (W3 committed) |
| chat-layout | 2 | 2 pass | no |
| round-trip | 6 | 6 pass | no |
| social | 2 | 2 pass | no (W3-r3 committed) |
| richdoc-image | 2 | 2 pass | **yes W1-r3 WIP** |
| deck-hosted | 4 | 4 pass | **yes W6-r3 WIP** |
| **Total this worktree** | **37** | **37 pass** | 6 of those 37 need r3 commits |

## Focused owner regressions (not full suite)

| Suite | Result |
|---|---|
| W1 `W1-richdoc-source-import` + `W1-richdoc-hosted-selection` | 13/13 pass (before W1-r3 typecheck red) |
| W2 session/integrity/retry/record-saved-item | 17/17 pass |
| W3 chrome + W3-r3 receiver + W4 conversation | 18/18 pass |
| W5-r3 hold + W5-r2 lifetime + W5 effects | 15/15 pass |
| W6-r2 + W6 source lifecycle (not r2 hosted-deck helper) | 15/15 pass |
| `tests/hosted-editor-iframe-sandbox-render.test.mjs` | 4/4 pass (audio/3D/deck/richdoc iframe sandbox tokens) |
| oceanleo `backend/tests/test_w2_revision_wire_integrity.py` | 11 passed, 1 warning (deprecation). No production DB write. |

Did not run `tests/W6-r2-commands-hosted-deck.test.mjs` as final deck evidence: it still imports r2 helpers (`hostedDeckInsertTextCommand`, synthetic `origin:user` on `surface.run`) that W6-r3 is replacing.

## Package checks

```
bash .../agent-io-guard.sh run-heavy -- pnpm typecheck
# exit 2 — W1-r3 WIP richdoc-pro-source.ts:287 missing `source` (see gap 2)

bash .../agent-io-guard.sh run-light -- pnpm api:check
# pass (`scripts/public-api-snapshot.mjs --check`)

bash .../agent-io-guard.sh run-light -- pnpm architecture:check
# fail — ComputerDock facades/devices (see gap 3)
```

Generated CSS: `src/theme/ui.css` contains `data-agent-conversation` (`16494476`). Round-1 CSS gap is closed.

## Parent-only remaining

1. Land **W6-r3** (toolbar + agent unstamped review) and **W1-r3** (image-only / empty valid docs); keep DOMPurify fail-closed and never restore synthetic `origin:user` on the agent surface.
2. Resume V1 after those commits: rerun `editor-repair-acceptance-deck-hosted` + `editor-repair-acceptance-richdoc-image` on the committed tree; rerun typecheck.
3. Parent-owned `architecture:check` ComputerDock facade import.
4. Full package suite once V1 tests are stable on committed r3. LeoDev freshness / twin-only bump. **No 上线. No production. No push by V1.**

Parent independently reruns required checks per kernel.
