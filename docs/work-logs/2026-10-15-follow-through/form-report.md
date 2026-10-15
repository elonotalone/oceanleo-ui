# FORM report — 2026-10-15

Scope: FORM in `tasks.md`. Changes are uncommitted for the parent. No grandchildren, browser, screenshots, installs, typecheck duplication, CSS generation, version changes, commits, pushes or deployment operations.

## Own deliverable

Only these product/test files were changed by FORM:

- `src/shell/bay/form/bay-deadline.ts`
- `src/shell/bay/form/BayDeadlineField.tsx`
- `src/shell/bay/form/BayAutoTextarea.tsx`
- NEW `tests/bay-form-follow-through.test.mjs`

`BayChoice.tsx`, `BayRevealForm.tsx` and `listing-terms-fields.tsx` were audited without changes. `CheckoutPane.tsx` and all initially dirty tests/source remain read-only. In particular, the dirty `BayCoverDrop.tsx` and later concurrent `BaySelectMembers.tsx` changes are not FORM work.

Confirmed repairs:

- DST gap: New York 2026-03-08 02:30:05 previously became 01:30:05. It now moves forward to 03:30:05. Repeated wall times choose the earlier occurrence. Coverage includes New York/London gaps and overlaps, Lord Howe's 30-minute gap, Apia's skipped day, Kathmandu's 45-minute offset, invalid dates and leap days. Invalid date-only values such as February 30 now return null rather than rolling into March.
- Time fields retain a one-digit draft while typing, allowing the second digit before `maxLength=2` blocks it. Values clamp to valid ranges, arrows wrap, blur restores two-digit formatting.
- An already-open deadline panel now disables all its controls when the parent disables the field; date emissions and timezone preference writes also guard disabled state.
- Timezone options include the explicit device zone and the resolved current zone (including stored aliases), and display offsets at the selected deadline rather than today's possibly different DST offset. Switching zone preserves the stored UTC instant.
- Textarea fitting now handles uncontrolled input and focus in addition to controlled values/width changes, preserves caller handlers, includes borders for border-box sizing and excludes padding for content-box sizing. Hidden fields defer measurement; reopening and resize rerun it. Tests use explicit mocked layout dimensions, not visual evidence.

Audited behavior: choices begin expanded, selecting collapses to the chosen tile/chevron, clicking that tile reopens without emitting a selection, then choosing another tile collapses again. Required labels/invalid markers remain present; a highlighted collapsed group exposes its field for focus. The actual submit/scroll effect lives in `seller/ServiceEditorPane.tsx:233` onward, outside FORM ownership; the new test checks the form's visibility/focus prerequisite, not an end-to-end publish click or visual scrolling. Existing publish tests run in the Bay diagnostic suite.

## Exact verification

From `/root/projects/oceanleo-ui`:

```bash
TZ=America/Los_Angeles bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=1 --test-timeout=60000 tests/bay-form-follow-through.test.mjs tests/bay-deadline.test.mjs tests/bay-choice.test.mjs tests/bay-reveal-form.test.mjs
```

Result: **22 passed, 0 failed** (6 new tests, 16 existing). Initial exploratory run found one test-fixture error: jsdom's default textarea padding differed from the CSS-less expected fixture. The hidden-field fixture now explicitly sets box sizing/border; production checks were not weakened.

Committed-source isolation: used existing `measureOnCommittedTree` from `tests/helpers/clean-tree-baseline.mjs`, with commit **3e113634fd1166f181d2673e61176256db07ebda**, archive pathspecs `src tests package.json tsconfig.json`, and a symlink to existing dependencies. Copied only the four FORM deliverable files listed above into that temporary archive. Ran the same Node test command with `TZ=Asia/Shanghai`. The archive helper ran under `OCEANDINO_FORCE_HEAVY=1 .../agent-io-guard.sh run-heavy -- node --input-type=module -`.

Result: **22 passed, 0 failed** on committed source plus FORM only. This is the evidence that these repairs do not depend on concurrent dirty product/test changes. Temporary fixture was automatically removed by the existing archive helper.

```bash
git diff --check -- src/shell/bay/form/bay-deadline.ts src/shell/bay/form/BayDeadlineField.tsx src/shell/bay/form/BayAutoTextarea.tsx
```

Result: passed. Parent is running the direct local TypeScript binary; FORM did not duplicate it.

Bay full-suite diagnostic:

```bash
OCEANDINO_FORCE_HEAVY=1 bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- bash -c 'node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=2 --test-timeout=60000 tests/bay*.test.mjs > /tmp/oceanleo-form-bay-heavy-20261015.log 2>&1; result=$?; tail -n 14 /tmp/oceanleo-form-bay-heavy-20261015.log; exit "$result"'
```

Final forced-heavy result: **821 passed, 1 failed / 822**, exit 1, 77.77 seconds; log `/tmp/oceanleo-form-bay-heavy-20261015.log`. Sole failure is the translation assertion detailed below. Earlier exploratory full-suite run: **788 passed, 1 failed / 789**, log `/tmp/oceanleo-form-bay-suite-20261015.log`. Additional concurrent tests explain the changed total; do not interpret the extra passes as FORM changes. That initial invocation requested `run-heavy` but the shell wrapper was automatically classified/demoted to `run-light`; the explicit forced-heavy command above corrects the execution lane. Neither result describes a clean committed tree.

## Committed failures versus concurrent work

Separately extracted the same **3e113634fd1166f181d2673e61176256db07ebda** commit with the archive helper, without FORM overlays or dirty files. Ran:

```bash
node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=1 --test-timeout=60000 tests/bay-seller-profile-reveal.test.mjs tests/bay3-profile.test.mjs tests/bay-supply-checkout.test.mjs
```

Result: **10 passed, 2 failed**. The two failures are file-load failures with zero registered cases executed (seller-profile expects 2 cases; bay3-profile expects 13), not merely two failing assertions.

| Contract | Committed result | Current dirty tree / ownership | Minimal repair boundary for parent |
| --- | --- | --- | --- |
| seller-profile reveal | Database stub exports `uploadFile` but the barrel import reaches `BayDigitalWorksField` requiring `getStorageUsage`; ES module load fails | Concurrent test removes old seller-profile import and asserts replacement profile/settings structure; associated product deletion and profile redesign are dirty | For a test-only committed-source repair, extend this test's database stub with the real result shape for `getStorageUsage`, then rerun for further missing edges. Prefer narrow direct imports/stubs for the library picker rather than pulling its unrelated app graph. Do not claim the concurrent profile deletion/redesign as FORM repair. |
| bay3-profile | Auth stub exports `getUserId` only, but reached `artifact-client` requires `accessToken`; file load fails | Concurrent test stubs `../needs/LibraryWorkPicker` and auth configuration, and has substantive profile editing/import changes | Minimal first repair: add the library-picker stub at the existing boundary if that picker is irrelevant to the profile tests; otherwise supply real-shape auth exports, then rerun. Preserve the 13 committed cases. Avoid committing the dirty redesign merely to repair a fixture edge. |
| checkout paid gating | All 10 committed checkout cases pass, including readiness false/true, login, terms rejection and no automatic payment | Checkout source/helper are dirty from removing add-ons and simplifying tiers; this does not establish a new payment fix | Existing tests intentionally permit order creation when payment is unavailable, then suppress payment UI. They do not reproduce a separate paid-gating defect. A request to prevent paid order creation would change that explicit test contract. Any such fix needs a narrowly owned `CheckoutPane.tsx`/checkout-helper change plus a new focused test coordinated with the dirty-file owner; FORM made none. |

The current dirty suite's i18n failure is `tests/bay-posting-copy.test.mjs:56`: expected English `价格` = `price`, actual `Pricing`. This is outside FORM ownership; coordinate with I18N/parent. No translation/assertion baseline was changed by FORM.

## Handoff boundary

FORM's deliverable is ready for parent review and own-file integration; no claim that the other dirty repairs landed. Parent owns final TypeScript verification, generated assets, LeoDev freshness and shipping. No production checks or browser visual claims were made.
