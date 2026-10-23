# W05 state (settings -> LeoBay one page; money page removed; dashboard money; entry redirects)

Updated: 2026-10-23 (redispatch round 2, start; nothing of W05 was in the tree when I took over)

## Confirmed facts
- Repo /root/projects/oceanleo-ui, branch main. Bootstrap OK. Tree was clean at takeover (a08f3083 already holds the dashboard OverviewChart/StatTile work, so no "adopt WIP" any more).
- Entry points: apppaid/* use openBay({kind:"settings",pane:"money"}); OrderPane/MyServicesPane/MyDashboardTab use openBaySettings("money"|"vetting").
- BaySettingsPaneName type must stay "profile"|"vetting"|"money" (bay-state.ts/bay-links.ts/deal-actions.ts still use it; not mine).
- Dev gateway: payments/config buyer_ready=false seller_ready=false.
- Baseline (before my edits), per-file runs: all related tests green EXCEPT tests/bay-settings-copy.test.mjs #3 (W07's key 在条款页查看全文 not in BAY_MESSAGES/base: scans every settings/*.tsx literal against bay-copy + HEAD base dicts) and tests/i18n-tt-key-coverage.test.mjs #8/#9/#10 (global gaps from other waves: messages/Inbox, PDF, video...; none in my paths). Baseline output kept in /tmp/w05-baseline*.txt.
- Prod DB (read-only): talent_ledger_entries has 4 "in" rows, all event=completed, contract_id NULL, currency USD (2 users x $25.00 + $9.90). Backend dashboard counts talent_contracts completed -> $0. So ledger rows and dashboard totals differ for the operator; ledger list on the dashboard needs a "figures above are the ones that count" note.
- Backend ledger writes an "in" row per contract event with the full contract total, so unfiltered lists can show one contract several times; list is faithful to the API (direction=in), no client-side filtering.
- Tools (not in repo): /tmp/w05-run-each.sh (per-file test runner, light slot), /tmp/w05-tools/keycheck.mjs (which tt keys already have 16 translations).
- Existing keys I can reuse: 收款账户, 付款暂未开放, 收款暂未开放, 暂未开放, 绑卡暂未开放, 开户暂未开放, 提现暂未开放, 已绑卡 · {brand} ·••• {last4}, 有效期 {month}/{year}, 卡, 收款账户状态：{state}, 导出 CSV, 加载更多, 还没有流水, 查看对账单, 去设置付款方式, 去开通收款, 去检查付款方式. NEW (mine): 付款卡, 收款设置, 资质核验 (same en as 资质审核 = Verification, W06 may define it too), 收入流水, 收款状态, ...
- 网站与软件服务 only has en in the dictionary (15 languages missing) - W03 owns that gap; I only reference it dynamically via productKindLabel.

## Doing now
Step 1: settings single page (BaySettingsSection/Pane/store/open, delete ProfileDoor + BayMoneySection, index.ts, lib payout status helper).

## Next
2 dashboard money blocks (payout tile next to escrow, income ledger card with statement + CSV, white cards, product kind names)
3 MyDashboardTab buttons (收款设置 -> openBaySettings(); 资质核验 -> requestMinePageEdit()+openBay mine page)
4 entry redirects (OrderPane, AppPurchaseBar x2, PricingManagePanel, MyBoughtAppsPane, MyServicesPane)
5 section 5.1 sweep in boundary (apppaid strings, MyServicesPane strings, dashboard-model kind labels, comments)
6 tests: fix red ones (bay-settings-section/store/copy, bay-seller-panes, bay-seller-profile-reveal), new tests/lbp-w05-settings-dashboard.test.mjs
7 copy table lbp-w05-copy.ts (17 languages), typecheck, coverage gate delta check
8 verdicts/W05-delivery.md, commit

## Repro
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<name>.test.mjs
(per-file loop: /tmp/w05-run-each.sh tests/a.test.mjs tests/b.test.mjs)
