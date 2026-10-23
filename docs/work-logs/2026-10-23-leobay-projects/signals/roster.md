# roster（父维护）

| ID | 状态 | 派出时间 |
|---|---|---|
| W01–W11 | 已派（Sonnet 5.5 max，后台） | 2026-10-23 约 18:50 |

## 父 agent 收尾清单（随交卷累积）
- [x] bay-state.ts 两处 `other`（W02 请求）`9a31e864`；W02 todo 测试转正 `7ba00bc0`
- [ ] W05 摘掉引用后删 `BayTermsOverview.tsx`
- [ ] 重编 `src/theme/ui.css`（`pnpm build:css`，heavy）并跑 `tests/theme-artifact-in-sync.test.mjs`
- [ ] `pnpm api:snapshot` 更新公开 API 快照（MenuSelect、BayTermsPublic 等新导出）
- [ ] `tests/i18n-tt-key-coverage.test.mjs` 收尾：补缺、清 `PRE_EXISTING_GAPS` 死条目
- [ ] `bay-links.ts` 里没人用的 `BAY_MINE_UI_TABS` 与过时注释
- [ ] 重启开发网关（W02 信息流、W09 审核链接），按 W02 交卷 §10 发 HTTP 验
- [ ] `oceanleo-dev-slots-fresh.sh`
- [ ] 操作员决定项：网关条款第 3 版「费用」节写「当前版本不接入任何支付通道」，与条款页 Stripe 托管段落矛盾（W07 报，条款在库里，本波不写库）
