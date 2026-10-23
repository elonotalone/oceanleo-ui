# W07 state（被打断时只靠它续接）

更新：2026-10-23 开工

## 已确认的事实

- 两个仓都在 `main`。共享 UI 仓里有别的工程的大量未提交改动（editor-overhaul、W01/W02/W04/W05 的在途文件），我的边界文件开工时都是干净的。
- 网关 `GET https://api.dev.oceanleo.com/v1/talent/terms/current`：第 3 版，生效 2026-08-18，9 节（knowledge_only / how_it_works / fees / off_platform / dispute / verification / data_residency / privacy / dispute_forum），正文只有中文，不登录可读。
- 网关 v3 的 fees 一节写「当前版本不接入任何支付通道」，与条款页第 2、7 节（Stripe 托管、通道费 3.9% + $0.30）矛盾。文本在库里（migration 0186），我不能改，写进交卷的「发现」。
- 门户 `LegalSection` 没有 id 参数 → 要在 `legal-shell.tsx` 加可选 `id`（别的页不受影响）。
- 门户 `/legal/marketplace` 是服务端组件（有 metadata），挂客户端的 BayTermsPublic 必须隔一层客户端文件（照 `app/legal/rights-notice/rights-notice-form.tsx` 的先例，放在页面同目录）；共享包 barrel 在门户有首屏字节回归纪律（`next/dynamic` + `importWithChunkReload`）。
- 门户法律页永远是白底（`LegalShell` 写死 `bg-white`），而 `dark:` 是 `<html class="dark">` 触发 → BayTermsPublic 不能带 `dark:` 类（否则暗色主题下白字落白底）。
- `BayTermsSections` 目前是弹窗、条款门共用；给它加 `tone`/`anchors` 可选参数，默认行为不变。
- 不依赖 `settings/use-bay-load.ts`（W05 的文件，可能改/删）：BayTermsPublic 自带取数状态。
- 已有词条可复用（17 语齐全）：正在加载… / 重试 / 条款加载失败，请稍后重试 / 当前版本 {version} / 生效时间：{time} / 条款正文只有中文；节标题会随界面语言变化。 / 九节标题。
- 帮助文章（`content/help/bay/{terms-entry,fees}.md`）仍写「设置窗 → LeoBay → 规则与条款 / 钱」，不在任何 owner 边界内 → 交卷里报给父 agent。
- `app/refund/page.tsx`、`app/privacy/page.tsx`、`app/legal/subprocessors/page.tsx` 仍有「人才市场」字样，不在我的边界 → 交卷里报。

## 正在做

- 第 1 步：BayTermsPublic + terms-text 的 tone/anchors + lib/bay/terms.ts 的条款页地址常量。

## 下一步

1. 弹窗（与条款门）加「在条款页查看全文」链接，新窗口。
2. `lbp-w07-copy.ts` 补新词条（17 语）。
3. 测试：`tests/lbp-w07-terms.test.mjs`；跑相关旧测试（bay-settings-terms / bay-settings-section / bay-settings-lib）。
4. 门户：`legal-shell.tsx`（id 参数、导航改名）、`marketplace/page.tsx`（新一节 + 平台怎么收费 + 可收款国家 + 去「人才市场」）、`terms/page.tsx`（改名）。
5. 门户 typecheck（基线在 /tmp/w07-portal-typecheck-baseline.txt）、共享 UI typecheck、`tests/i18n-tt-key-coverage.test.mjs`。
6. HTTP 验证 LeoDev 槽渲染；写交卷 `verdicts/W07-delivery.md`。

## 复现命令

```bash
cd /root/projects/oceanleo-ui
node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/lbp-w07-terms.test.mjs
curl -s https://api.dev.oceanleo.com/v1/talent/terms/current
curl -s https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/legal/marketplace
```
