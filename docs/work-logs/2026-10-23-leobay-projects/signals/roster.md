# roster（父维护）

| ID | 状态 | 派出时间 |
|---|---|---|
| W01–W11 | 已派（Sonnet 5.5 max，后台） | 2026-10-23 约 18:50 |

## 父 agent 收尾清单（随交卷累积）
- [x] bay-state.ts 两处 `other`（W02 请求）`9a31e864`；W02 todo 测试转正 `7ba00bc0`
- [x] 删 `BayTermsOverview.tsx`；settings:vetting/profile 老链接转我的主页 `0c115e20`；数据面板 listing_kind 后端 `9543a73`；`/settings/<tab>/<view>` 路由 `f61bbbe`
- [x] 重编 `src/theme/ui.css`；`tests/theme-artifact-in-sync.test.mjs` 3/3 通过（Codex continuation）
- [x] `pnpm api:snapshot`，`pnpm api:check` 通过
- [ ] 全仓翻译闸仍有其他工程缺口与历史死条目；本波词条齐全，已删除「全部站点 / 解锁」两条已修基线，见最终验收记录
- [x] 清理 `BAY_MINE_UI_TABS` 与过时注释
- [x] 重启开发网关 21:3x；出售侧 listing_kind 五类 HTTP 200（库里无已发布条目，皆空）
- [x] `oceanleo-dev-slots-fresh.sh`：com / cn 两槽 FRESH(dev)，0 STALE
- [x] 条款页已明确当前开发版不接支付，Stripe 流程仅在通道开放后适用；与网关 v3 及支付配置一致，不改库内条款及同意记录
- [x] 境内 LeoChat 整页与侧栏放开（W08/W09 请求）`08835f09` / `ffd66ed`；发布检查申诉提示改指 LeoChat
