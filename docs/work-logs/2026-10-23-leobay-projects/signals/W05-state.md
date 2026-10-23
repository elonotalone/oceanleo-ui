# W05 state (settings -> LeoBay one page; money page removed; dashboard money; entry redirects)

Updated: 2026-10-23 (start)

## Confirmed facts
- Repo /root/projects/oceanleo-ui, branch main. Bootstrap OK.
- dashboard/DashboardPane.tsx, StatTile.tsx, OverviewChart.tsx (untracked) and tests/bay-dashboard-overview.test.mjs (untracked) are
  uncommitted work from the earlier same-day wave docs/work-logs/2026-10-23-bay-library-dashboard (W3-result.md, verified 10/10 by its parent).
  They are inside my boundary; I build on them and commit them together with my changes (will say so in the delivery).
- Entry points: apppaid/* use openBay({kind:"settings",pane:"money"}); OrderPane/MyServicesPane/MyDashboardTab use openBaySettings("money"|"vetting").
- BaySettingsPaneName type must stay "profile"|"vetting"|"money" (bay-state.ts/bay-links.ts/deal-actions.ts still use it; not mine).
- Dev gateway: payments/config buyer_ready=false seller_ready=false.

## Doing now
Step 0: baseline of relevant tests (before edits).

## Next
1 settings single page (BaySettingsSection/Pane/store/open, delete ProfileDoor, index.ts)
2 dashboard money blocks (payout status next to escrow tile, income ledger list + statement + CSV)
3 MyDashboardTab buttons; 4 entry redirects; 5 BayMoneySection unmount/remove; 6 section 5.1 names; 7 tests + copy table

## Repro
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<name>.test.mjs
