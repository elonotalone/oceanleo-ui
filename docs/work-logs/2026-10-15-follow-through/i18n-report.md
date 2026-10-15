# I18N handoff — 2026-10-15

Status: implemented the work within the assigned clean-file boundary; integration is NOT green. Changes are uncommitted. No pushes, installs, generated CSS, version changes, browser use or deployment. Parent owns integration and dev-slot verification.

## Changes

- Added `src/i18n/ui/messages/follow-through-copy.ts`: 18 missing keys translated into all 16 non-zh locales (288 translations). Registered through the existing `shell-overhaul-copy.ts` aggregator, which both index.ts and the request loader already consume. Covers pricing/delivery, monthly pricing, official assets, save confirmation, CPU/memory selection, key replacement, plan acceptance, file attachment controls and connector authorization.
- Registered the new source in the existing coverage dictionary checks: completeness, placeholders, Chinese source identity and Chinese leakage checks remain enforced. Added request-loader verification for all 16 non-zh locales, comparing the new translations against both the source fragment and global dictionary.
- Aligned seven of eight base-English collisions: model market, AI Models, meeting minutes, sign-in method, email, asset source and pricing. Fixed seven of eight work-chat conflicts by using consistent English for shared count/access/expiry/project-chat/group-chat/delivery labels, including capitalized Everyone in Bay posting.
- Aligned enterprise `已停用` in es, es-419, fr, it, pt-BR, pt-PT, tr, ko and th with the global shared status. Spanish now uses `Desactivado`; the label also serves non-feminine subjects in the global flat dictionary. zh-TW is deliberately unchanged pending the boundary issue below.
- Extended work-chat collision coverage from the stale 11-fragment list to the 14 actually registered fragments (PDF/workflow/grid were missing). Added exact registration-list parity so another fragment cannot silently bypass this guard.
- Removed 46 fully translated historical gap entries and two obsolete entries from `PRE_EXISTING_GAPS`. The obsolete BYOK audit sentence no longer occurs in product source; ApiPage's old Bailian/Volcengine pricing summary was replaced by the already-translated `价格来自各厂商官方实时源，每小时自动更新。共收录`. The three existing indirect-reference exceptions and ceiling remain unchanged. No baseline expansion or collision allowlist additions.

## Files changed by I18N

All source paths below are relative to `src/i18n/ui/messages/`:

- `follow-through-copy.ts` (new)
- `shell-overhaul-copy.ts`
- `shell-overhaul-settings-copy.ts`
- `mcp-catalog-copy.ts`
- `account-layout-copy.ts`
- `mail-bot-copy.ts`
- `bay-asset-copy.ts`
- `bay-posting-copy.ts`
- `enterprise-copy-western.ts`
- `enterprise-copy-eastern.ts`
- `im-conversation-copy.ts`
- `im-people-copy.ts`
- `im-talent-copy.ts`

Tests: `tests/i18n-bundle-boundary.test.mjs`, `tests/i18n-key-collision.test.mjs`, `tests/i18n-tt-key-coverage.test.mjs`. This report is the only documentation edited.

Did not edit the initially dirty `bay-mine-copy.ts`, `bay-money-copy.ts`, `bay-shell-copy.ts`, or `bay-supply-copy.ts`. No product source outside `src/i18n` was edited. Do not stage the entire i18n directory: it contains those concurrent changes.

## Exact verification

Run from `/root/projects/oceanleo-ui`:

```bash
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/i18n-*.test.mjs
```

Final result: **24 tests, 21 passed, 3 failed**. All tt-key coverage tests, the 16-locale runtime check, server-safe checks, server-page collision check and work-chat registration check pass. Three remaining failures are listed below; they were not waived.

```bash
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/account-layout-copy.test.mjs tests/bay-posting-copy.test.mjs tests/mcp-catalog-copy.test.mjs tests/settings-i18n-copy.test.mjs tests/bay-orders-copy.test.mjs
```

Guard classified this five-file diagnostic as light and demoted automatically. **14 tests, 12 passed, 2 failed**: account-layout's old `Sign-in methods` expectation and bay-posting's old `price` expectation. Its following `everyone` expectation is also stale (execution stops at `price`). Source translations now agree with the flat global dictionary; those two test files are outside the named `tests/i18n-*` ownership boundary and were left unchanged. Parent should align the three exact expectations to `Sign-in method`, `Pricing`, `Everyone`, retaining the other assertions.

```bash
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- ./node_modules/.bin/tsc --noEmit
```

Typecheck: **passed, exit 0**, with no diagnostics.

`git diff --check -- <the tracked files listed above>` passed. Initial bare Node invocation without the repository extension loader failed with `ERR_MODULE_NOT_FOUND`; reran using the repository's exact loader/import setup as shown above. An attempted combined ten-file light run was rejected by the IO guard (exit 64); the executed commands above respected its classification.

## Remaining scope boundaries for parent

1. **Dirty Bay dictionary**: `src/i18n/ui/messages/bay-mine-copy.ts:117` registers English `其他: Others`, overriding base `Other`. This is the sole remaining base-English collision. Its owner should use `Other` for this category label. No whitelist should be added.
2. **Real semantic key collision requiring product-source coordination**: `src/shell/replay/work/WorkReplayTimeline.tsx:24` passes `tt("{n} 分")` for elapsed minutes, while `src/shell/bay/orders/order-review.tsx:170` uses that identical key for rating points. `work-replay-copy.ts` supplies `{n} min`, but the later Bay aggregation supplies `{n} pts`. English work duration is therefore rendered as points. Change the replay caller to the existing translated `tt("{n} 分钟")` and remove its obsolete `{n} 分` registrations from `work-replay-copy.ts` across all 17 locales; retain the Bay points dictionary. Do not simply change one English value or waive the collision. Neither caller was edited because source outside src/i18n is excluded.
3. **Traditional Chinese shared-word conflict**: dirty `bay-money-copy.ts:167` uses `已停用` for `已停用`, while enterprise retains `已關閉`. The enterprise parity test fails only for zh-TW now. Blindly switching enterprise to `已停用` makes its separate no-verbatim-copy test fail: this is a legitimate short phrase identical in simplified/traditional, not missing translation. Coordinate the dirty Bay owner and decide shared status wording; alternatively explicitly review a narrowly checked shared-vocabulary rule in the enterprise test. I left both its copy guard and dirty Bay file untouched, rather than relaxing a test solely for green.
4. **Related historical test assertions**: the account-layout and bay-posting exact-copy expectations above require parent coordination before the whole suite can pass.

Stop here before expanding to those owners' files. Final consumer/dev-slot verification remains with the parent as assigned in tasks.md.
