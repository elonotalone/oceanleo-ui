# Editor repair 2026-10-21 — independent acceptance

**Verdict: complete**

Measured on `/root/projects/oceanleo-ui` `main` after W1–W4 deliveries existed and were non-empty, then again on committed HEAD including W3 `45c08d98`.

No W delivery reported a failed owner suite. V1 did not edit `src/`. No browser. No production. No CSS regeneration. No push.

## Command

```
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- \
  node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
  --experimental-loader ./tests/ts-extension-loader.mjs --test --test-timeout=180000 \
  tests/editor-repair-20261021-acceptance*.mjs
```

## Measured result (HEAD, after W3 landed)

- tests **13**
- pass **13**
- fail **0**
- duration_ms **2695.779373**

Same command earlier on the worktree that already contained W3 (before `45c08d98`): tests 13, pass 13, fail 0, duration_ms 2799.520992.

Per case (HEAD):

| Defect | Test | Result |
|---|---|---|
| Markdown opens with body | `screenshot-shaped markdown load fills hosted state with the body` | pass |
| Empty load is not ready-empty | `empty markdown load of an existing item is not ok ready-empty` | pass |
| 410 without refresh is not ok | `HTTP 410 without a successful refresh is not ok ready-empty` | pass |
| 410 then refresh fills body | `410 then refresh that returns markdown fills the body` | pass |
| Save of md is not Word | `persistUmoPayload of an md item writes a text/markdown File, not Word` | pass (`File.type` = `text/markdown`) |
| Autosave needs user edit | `observe dirty+new revision with userEdited:false does not call flushRevision` | pass |
| Omitted userEdited does not flush | `observe dirty+new revision with userEdited omitted defaults to no flush` | pass |
| Real edit still autosaves | `observe dirty+new revision with userEdited:true does schedule flushRevision` | pass |
| No 结构/皮肤 on ImageRoute | `ImageRoute does not mount ImageCanvasViewSwitch or 结构/皮肤` | pass |
| No primary XY | `image toolbar builder has no primary position-x / position-y` | pass |
| Listed image AI gone | `image AI capability lists used by the editor no longer offer the deleted tools` | pass |
| Overlay not on save | `loading overlay is not shown when sourceReady && saving` | pass |
| Download not filled circle | `download launcher is not IconButton variant=secondary` | pass (`data-leo-button` ≠ `secondary`) |

## Owner landings (not trusted as proof; V1 re-measured)

| Owner | Delivery | Product commit | Owner suite claim |
|---|---|---|---|
| W1 | `docs/editor-repair-20261021/deliveries/W1.md` | `cc302a78` (umo-hosted `onSave` claimed `07de39f`) | pass 28 / fail 0 |
| W2 | `docs/editor-repair-20261021/deliveries/W2.md` | `751095b2` | 20/20 |
| W3 | `docs/editor-repair-20261021/deliveries/W3.md` | `45c08d98` | 4/4 |
| W4 | `docs/editor-repair-20261021/deliveries/W4.md` | `f9bd25cb` | pass 3 / fail 0 |

V1 tests: `a5bdc673`, fixture fix `0cbb76d3`.

## Unverified — class (d)

Real browser / Playwright / screenshot of the operator item `21c1e4d9-0818-4bbe-ae33-b4d01a5beafd` was **not** run. This task has no browser consent. Class (d) remains unverified.

Also unverified here (parent allowlist): `pnpm typecheck`, LeoDev slot freshness, twin pin `--only oceanleo`.
