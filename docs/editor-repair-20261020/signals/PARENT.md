# Parent signal — editor repair 2026-10-20 close

Independent parent verification after V1-r3 and the late W6-r4 live-surface commit. Child reports are claims; numbers below were rerun in this parent shell.

## Landed on oceanleo-ui main

- W1-r4 `446b5bc6` — typed admitted source + DOCX ArrayBuffer copy
- ComputerDock `a06f249f` — `api/devices`, not facade
- W6-r4 helper reopen `96bf746a` — `tests/W6-r4-remaining-families.test.mjs`
- V1-r3 first report `e9949599` / id `c3e487d7` / W6-r4 delta `8d21fed6` / id `6fde5fe5`
- W6-r4 live command surfaces `d42136bf` — extracted timeline seed + canvas command helper; `tests/W6-r4-source-lifecycle.test.mjs`

Did not treat the child's earlier inventory-only `signals/W6-r4.md` as a delivery. That file is now the journal for `d42136bf`.

## Parent-rerun results on `d42136bf`

| Suite | Result |
|---|---|
| V1 acceptance (10 files, two batches) | **37/37** |
| W6-r4 remaining-families | **6/6** |
| W6-r4 source-lifecycle | **7/7** |
| W6-r2 source-lifecycle + W6-r3 toolbar + non-richdoc lifecycle | **20/20** |
| W6-r2 hosted-deck commands | **4/4** |
| `pnpm typecheck` | exit 0 on `a06f249f`; bump will rerun on the tag |
| `pnpm api:check` | pass |
| `pnpm architecture:check` | pass (7738 edges); ComputerDock stays `api/devices` |
| Gateway `test_w2_revision_wire_integrity.py` | already 11 passed on `3ace4e8` |

Class (a) remains eleven host-side families. Game play is not a document round-trip. Class (d) unverified (no browser consent). Integrity / CAS / origin / sandbox not loosened.

## LeoDev

`oceanleo` slot `p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com` — `FRESH(dev)`, `uiLinked=true`, preview HTTP 200. `api.dev.oceanleo.com/health` ok. No production, no sites-push, no promote.

## Next (parent)

Twin-only pin `@oceanleo/ui` `v0.233.71` → `v0.233.72`, then `oceanleo-ui-bump.sh --only oceanleo` and portal `main` push (oceanbizs.com). Includes gateway `3ace4e8`.
