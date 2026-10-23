# roster（父维护）

| ID | 状态 | 派出时间 |
|---|---|---|
| W01–W11 | 已派（Sonnet 5.5 max，后台） | 2026-10-23 约 18:50 |

## 父 agent 收尾清单（随交卷累积）
- [x] bay-state.ts 两处 `other`（W02 请求）`9a31e864`；W02 todo 测试转正 `7ba00bc0`
- [x] 删 `BayTermsOverview.tsx`；settings:vetting/profile 老链接转我的主页 `0c115e20`；数据面板 listing_kind 后端 `9543a73`；`/settings/<tab>/<view>` 路由 `f61bbbe`
- [ ] 重编 `src/theme/ui.css`（`pnpm build:css`，heavy）并跑 `tests/theme-artifact-in-sync.test.mjs`
- [ ] `pnpm api:snapshot` 更新公开 API 快照（MenuSelect、BayTermsPublic 等新导出）
- [ ] `tests/i18n-tt-key-coverage.test.mjs` 收尾：补缺、清 `PRE_EXISTING_GAPS` 死条目
- [ ] `bay-links.ts` 里没人用的 `BAY_MINE_UI_TABS` 与过时注释
- [x] 重启开发网关 21:3x；出售侧 listing_kind 五类 HTTP 200（库里无已发布条目，皆空）
- [ ] `oceanleo-dev-slots-fresh.sh`
- [ ] 操作员决定项：网关条款第 3 版「费用」节写「当前版本不接入任何支付通道」，与条款页 Stripe 托管段落矛盾（W07 报，条款在库里，本波不写库）
- [x] 境内 LeoChat 整页与侧栏放开（W08/W09 请求）`08835f09` / `ffd66ed`；发布检查申诉提示改指 LeoChat
