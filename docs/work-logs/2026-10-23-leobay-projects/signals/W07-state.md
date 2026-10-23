# W07 state（被打断时只靠它续接）

更新：2026-10-23 重派接手（第二轮）

## 已确认的事实

- 两个仓都在 `main`。共享 UI 仓开工时工作区干净（别的 owner 的在途改动已由父 agent 入库）；门户仓只有他人的 4 个未提交文件（`package.json`、`pnpm-lock.yaml`、`.github/workflows/oceanleo-cn-frontend.yml`、`backend/scripts/retire_operator_examples_20261021.py`），不碰。
- 上一轮留下并已入库（共享 UI `cdf86420`）：`BayTermsPublic` 正式实现（加载/失败重试/就绪三态、目录 + 各节锚点）、`terms-text.tsx` 的 `tone`/`anchors` 与 `BayTermsFullTextLink`/`formatBayTermsDate`、`lib/bay/terms.ts` 的 `BAY_TERMS_PAGE_PATH`/`BAY_TERMS_PAGE_ANCHOR`/`bayTermsPagePath`、弹窗与条款门里的「在条款页查看全文」链接、`lbp-w07-copy.ts` 的 `fullTextLink`（17 语）。
- 门户一行没动（`legal-shell.tsx`、`marketplace/page.tsx`、`terms/page.tsx` 都还是旧的）；`tests/lbp-w07-terms.test.mjs` 还不存在。
- 接手时基线：`bay-settings-terms`（13）、`bay-buy-sell-terms`（5）、`bay-settings-lib`（6）、`bay-settings-section`（8）全绿。
- 网关 `GET https://api.dev.oceanleo.com/v1/talent/terms/current`：第 3 版，生效 2026-08-18，9 节（knowledge_only / how_it_works / fees / off_platform / dispute / verification / data_residency / privacy / dispute_forum），正文只有中文，不登录可读。
- 网关 v3 的 fees 一节写「当前版本不接入任何支付通道」，与条款页第 2、7 节（Stripe 托管、通道费 3.9% + $0.30）矛盾。文本在库里（migration 0186），我不能改，写进交卷的「发现」。
- 门户 `LegalSection` 没有 id 参数 → 要在 `legal-shell.tsx` 加可选 `id`（别的页不受影响）。
- 门户 `/legal/marketplace` 是服务端组件（有 metadata），挂客户端的 BayTermsPublic 必须隔一层客户端文件（照 `app/legal/rights-notice/rights-notice-form.tsx`，放页面同目录），并按 `app/_components/clone-shell.tsx` 的做法用 `next/dynamic` + `importWithChunkReload` 惰性取 `@oceanleo/ui/shell`。
- 门户法律页永远是白底（`LegalShell` 写死 `bg-white`），而 `dark:` 是 `<html class="dark">` 触发 → BayTermsPublic 不带 `dark:` 类（已做，`tone="paper"`）。
- 门户测试 `tests/talent-entry-domain-family.test.mjs` 要求条款页源码里仍有 `LeoBay`、`原名「OceanLeo Bay」「真人协作」`、`/bay`，且不含 `talent.oceanleo.com`：改副标题时必须保留这些。
- 条款页现状：第 2 节已写「平台不抽佣」与通道费 3.9% + $0.30（买方承担）；「可收款国家」只写了「以开户页列出的为准」，没有列表 → 要补。后端 `SUPPORTED_PAYOUT_COUNTRIES` 是 43 个国家码（`backend/app/talent/stripe_connect.py`），通道费常量 `CHANNEL_FEE_BPS = 390`、`CHANNEL_FEE_FIXED_MINOR = 30`。
- 帮助文章（`content/help/bay/{terms-entry,fees}.md`）仍写「设置窗 → LeoBay → 规则与条款 / 钱」，`app/refund/page.tsx`、`app/privacy/page.tsx`、`app/legal/subprocessors/page.tsx` 仍有「人才市场」字样，都不在任何 owner 边界内 → 交卷里报给父 agent。
- 门户 typecheck 基线在 `/tmp/w07-portal-typecheck-baseline.txt`：`lib/oceanleo-ai.ts`、`lib/supabase.ts`、`proxy.ts`（两条）共 4 条错（两份 supabase-js / next 版本），与我无关。

## 正在做

- 第 2 步：共享 UI 收尾（`terms-flow.tsx` 注释、旧测试里的措辞、新测试 `tests/lbp-w07-terms.test.mjs`、文案闸与类型检查）。

## 下一步

1. 共享 UI：`tests/lbp-w07-terms.test.mjs`（BayTermsPublic 渲染 9 节/失败重试、弹窗与条款门链接地址）；跑 `bay-settings-terms` / `bay-buy-sell-terms` / `bay-settings-lib` / `bay-settings-section`；`tests/i18n-tt-key-coverage.test.mjs`；共享 UI `pnpm typecheck`（基线 3 条错在 `video-project-doc.ts`）。提交。
2. 门户：`legal-shell.tsx`（`LegalSection` 加 `id`、导航改名）、`marketplace/page.tsx`（新一节「LeoBay 使用规则」挂 `BayTermsPublic` + 「平台怎么收费」含可收款国家 + 去「人才市场」）、`terms/page.tsx`（改名）、同目录客户端文件 `bay-terms-public-client.tsx`。门户 typecheck 对照基线。提交。
3. HTTP 验证 LeoDev 槽 `/legal/marketplace`、`/terms` 渲染；写交卷 `verdicts/W07-delivery.md`；提交。

## 复现命令

```bash
cd /root/projects/oceanleo-ui
node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/lbp-w07-terms.test.mjs
curl -s https://api.dev.oceanleo.com/v1/talent/terms/current
curl -s https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/legal/marketplace
```
