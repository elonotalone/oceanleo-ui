# LeoBay / Projects continuation acceptance

2026-10-23. Implementation commits: shared UI `1cd9e24d`; portal `1200c7a`.
No production or twin deployment. No browser, screenshot, mail or database writes.

## User-visible results checked

| Result | Evidence |
| --- | --- |
| Value-only dropdowns with shared styles and keyboard behavior | W01 tests, including real nested-modal interaction |
| Sale/wanted dropdown and five consistent delivery kinds | W02/W03 tests; five supply listing_kind values return HTTP 200 |
| Mine has three underlined tabs and four transaction lists | W04 render/state/deep-link tests; purchases have amounts/statements |
| Payment settings, seller ledger, verification and app-login grants moved | W05/W06 tests; legacy entry-point integration test |
| Versioned rules linked from public terms; development payment status explicit | W07 tests, portal legal/help tests, live dev terms v3 and payments config |
| Same messages/notices/cases surfaces in cn and com | W08/W09, LeoChat surface tests; both dev slots render `/leochat?im=notices` |
| Cases do not occupy normal navigation | No general settings entry; recovery action appears only for owners with actual cases |
| Cases remain reachable beyond the latest 200 notices | Independent owner-case lookup in NoticesView; regression includes empty/loading/old-case/signed-out states |
| Old account/settings case URLs reach Messages | Both editions emit streamed NEXT_REDIRECT to `/leochat?im=cases` |
| Tasks/composer left, configuration/cards right; no white bands | W10 shared/portal layout tests, side-card interaction tests, synchronized theme artifact |
| Project filters/forms and plan translations | W11 tests; eight portal files audited: missing static keys=0, raw CJK outside tt=0 |
| Help follows actual destinations and edition behavior | Updated old money/profile/verification/case/publication instructions; portal help tests |

## Commands and results

Run in the named repository with `agent-io-guard.sh` (focused files light; suite/typecheck/build heavy).

- UI: loader-enabled `node --test --test-concurrency=2 tests/lbp-*.test.mjs
  tests/project-workspace-primitives.test.mjs tests/leochat4-surfaces.test.mjs`:
  **314 passed, 0 failed** (`/tmp/lbp-final-ui.log`).
- UI after independent-case recovery: `tests/lbp-w08-notices.test.mjs`:
  **52 passed, 0 failed** (`/tmp/lbp-notices-final.log`); adds one regression to
  the previous set. Do not add overlapping test counts together.
- Portal, focused files: project assets/config/index/plan/import/tasks, both LBP
  files, help content/routes/Bay instructions, old case routes and help cache:
  **87 passed across 13 files, 0 failed** (`/tmp/lbp-portal-focused-final.log`).
- Backend: bay feed listing-kind/feed/zones, moderation actions/store/routes/
  publish check, work-chat wiring: **97 passed and 105 subtests passed**
  (`/tmp/lbp-backend.log`).
- `pnpm build:css`: passed. `tests/theme-artifact-in-sync.test.mjs`:
  **3 passed, 0 failed**, including rebuild from committed HEAD
  (`/tmp/lbp-css-gate.log`). `pnpm api:check`: passed.
- Both dev gateways: `/v1/notifications`, `/v1/moderation/my-cases`,
  `/v1/im/conversations` return **401 without credentials**, verifying routes
  exist and stay authenticated. No user messages were sent or marked read.
- Both portal editions: `/leochat?im=notices`, `/projects`, `/legal/marketplace`
  return **200**, with no detected module/build/server render error. Old case
  routes use Next streaming redirects (200 envelope with NEXT_REDIRECT and
  the correct `/leochat?im=cases` target); do not misreport them as HTTP 307.
- `oceanleo-dev-slots-fresh.sh`: **2 FRESH(dev), 0 STALE**.

Developer previews:

- com: https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/
- cn: https://p-bcc0822d00d8456d8599b5377ffdbe1c.dev.oceanleo.com/

## Limits: full repository acceptance is not green

The shared checkout is also being changed by the independent editor overhaul.
The initial shared UI typecheck passed. Subsequent typechecks report:
`src/shell/advanced-draft.ts(91,34): TS2339`, because the new private-working-draft
receipt metadata union does not declare `sha256`. This is outside this task's
files. The portal's four pre-existing Next/Supabase nominal-version errors were
fixed by deriving adapter types from the shared implementation; its remaining
reported diagnostic is the same editor receipt error. Do not describe either
latest whole-repository typecheck as passed.

Global i18n collision gate: **2 passed, 2 failed**. Conflicts concern existing
chat strings (置顶 / 消息免打扰 / 备注 / 已选人数) and the generic 游戏 translation.
Global tt coverage gate: **8 passed, 2 failed**. Remaining failures concern
editor/realtime keys outside this task and dead historical baseline entries.
The two already-healed baseline entries were removed; this task's W11 dictionary
and portal-visible project copy pass their dedicated checks. No exemptions or
assertions were weakened to hide those global failures.

HTTP checks establish route availability/redirects and test suites cover behavior
with controlled data. No authenticated visual acceptance or real payment was
performed. Payment processing remains disabled on the dev gateway.
