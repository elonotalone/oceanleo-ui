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
