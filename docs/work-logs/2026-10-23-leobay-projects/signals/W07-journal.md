# W07 journal

- 2026-10-23 开工：读完 W07 任务书、_COMMON、00-contract、V01；两仓 `main`；边界文件干净。
- 实测：`GET /v1/talent/terms/current` → 200，v3，生效 2026-08-18，9 节，0.08s。
- 实测：网关 v3 fees 一节写「当前版本不接入任何支付通道」，与门户条款页的 Stripe 托管描述矛盾（文本在 migration 0186 的库行里，我不改）。
- 实测：`GET /v1/talent/payments/config` 的 `payout_countries` 是 43 个国家码，与 `backend/app/talent/stripe_connect.py` 的 `SUPPORTED_PAYOUT_COUNTRIES` 一致；通道费 390bps + 30 minor 与页面常量一致。
- 实测：LeoDev 槽 `/legal/marketplace` 当前 200，导航仍是「人才市场条款 Marketplace」。
- 实测：现有 `useUI` 在没有 provider 时回退中文，不抛错；`bayGet(..., {anonymous:true})` 先走带凭据请求，401 再裸 fetch。
- 2026-10-23 重派接手：读完 `cdf86420`；门户三个文件一行未改，`tests/lbp-w07-terms.test.mjs` 未建；共享 UI 工作区干净。
- 实测（接手基线）：`bay-settings-terms` 13/13、`bay-buy-sell-terms` 5/5、`bay-settings-lib` 6/6、`bay-settings-section` 8/8 全绿。
- 实测：门户测试 `talent-entry-domain-family` 要求条款页保留 `LeoBay`、`原名「OceanLeo Bay」「真人协作」`、`/bay`；条款页第 2/7 节已有「平台不抽佣」与 3.9% + $0.30，缺的是可收款国家列表。
- 2026-10-23 实测：新增 `tests/lbp-w07-terms.test.mjs`（共享 UI，18 条）全绿；`TZ=Pacific/Auckland` 下也绿（生效日按 UTC 日历日）；变异检查（去掉链接 target、去掉锚点）使 7 条变红，已还原。
- 实测：`bay-settings-terms` 13/13、`bay-buy-sell-terms` 5/5、`bay-settings-lib` 6/6、`bay-settings-section` 8/8 在我的改动后仍全绿。
- 实测：`tests/i18n-tt-key-coverage.test.mjs` 10 条里 3 条红（8/9/10：全仓缺口基线），红的全是别人的文件（messages/Inbox、collection-chrome、编辑器 PDF 等），没有一条在我的文件里；第 5、6 条（本波词典 16 语齐全）绿。
- 实测：共享 UI `pnpm typecheck` 3 条错，全在 W08 在途的 `messages/MessagesHost.tsx`、`leochat/LeoChatPage.tsx`、`leochat/LeoChatPanel.tsx`（LeoChatTabId 不含 "notices"），我的文件 0 条。
- 实测：门户 `pnpm typecheck` 比基线（4 条）多 4 条，全在共享 UI 的他人文件（W02 `bay/shell/BayList.tsx` 缺 `other`、W08 的 leochat/messages 三条），门户我的四个文件 0 条。
- 门户已提交 `c94705c`：`legal-shell.tsx`（导航改名 + `LegalSection` 可带 id）、`marketplace/page.tsx`（第 7 节「平台怎么收费与税务」含不抽成/通道费算例/43 个可收款国家，第 10 节挂 BayTermsPublic，页顶「本页要点」）、同目录 `bay-terms-public-client.tsx`（next/dynamic 惰性）、`terms/page.tsx` 第 11 节改名、新测试 `tests/lbp-w07-legal-pages.test.mjs`（9 条，对照后端 `CHANNEL_FEE_*` 与 `SUPPORTED_PAYOUT_COUNTRIES`，变异检查 3 条变红已还原）。
- 实测：LeoDev 槽 `/legal/marketplace` 20:40 前 200，标题 `LeoBay 条款 LeoBay Terms — OceanLeo`，导航新名，`#fees`/`#bay-terms`/`#payout-countries` 三个 id 在，11 个 h2，第 10 节占位「正在加载… Loading…」；开发网关 CORS 对该槽 origin 和 `https://oceanleo.com` 都放行 `/v1/talent/terms/current`。
- 注意：20:41 起 LeoDev 槽对所有页返回 500，原因是别人的在途文件 `oceanleo-ui/src/shell/bay/mine/MineCategoryBar.tsx` 暂时没有导出（W04 正在重写），与我无关。
- 门户测试：`talent-entry-domain-family` 7/7、`legal-rights-notice` 4/4 绿；`bay-portal-help` 第 9 条红（`what-is-bay.md` 里没有「LeoSlides」，早先「类目标签去掉 Leo」提交留下的红，与本任务无关）。
