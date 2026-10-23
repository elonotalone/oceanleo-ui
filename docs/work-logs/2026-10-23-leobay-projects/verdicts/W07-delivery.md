# W07 交卷 · 「规则与条款」搬到条款页

owner：W07（重派，Sonnet 5.5）。日期：2026-10-23。两个仓都在 `main`，没有 push、没有重启容器、没有写库、没有开浏览器。

## 1. 用户看到的变化

1. **门户 `/legal/marketplace`**（标题现在是「LeoBay 条款 LeoBay Terms」）
   - 页顶多了「本页要点」，两条链接直达「平台怎么收费」和「LeoBay 使用规则」。
   - 第 7 节改成「平台怎么收费与税务 / How Fees Work & Tax」（`#fees`）：平台不抽佣（不抽成）、不收服务费和成交手续费；Stripe 支付通道费由买方承担，合同金额 × 3.9%（向上取整到分）+ $0.30，算例「合同 $100，通道费 $3.90 + $0.30 = $4.20，买方一共付 $104.20」（与帮助文 `fees.md` 同一个例子）；**可收款国家 / 地区 43 个**，按亚太 / 欧洲 / 北美 / 中东分组，中英文各一份（`#payout-countries`）；税务一段保留。中英双语，照这页原有的「中文段 + 灰色英文段」写法。
   - 新增第 10 节「LeoBay 使用规则（站内同意的版本）」（`#bay-terms`）：挂 `BayTermsPublic`，浏览器里向网关取**当前生效版本**，不用登录；显示版本号、生效日期、目录、网关下发的 9 节（每节 `#bay-terms-<key>`）；取不到时给原因和「重试」。原来的「联系我们」顺延为第 11 节。
   - 境内版（`isCnEdition`）：页顶「境内版说明」保持；第 10 节不挂 `BayTermsPublic`（境内没有 LeoBay、网关取不到），只写「境内版暂未开放，没有需要在站内同意的使用规则」。
   - 正文里的「人才市场」「Marketplace Terms」「《OceanLeo 真人协作使用条款》」全部改成 LeoBay 的叫法（见第 3 节）。「最后更新」从 2026-09-16 改为 2026-10-23。
2. **条款区导航**（所有法律页的页眉与页脚共用一个常量）：「人才市场条款 Marketplace」→「LeoBay 条款 LeoBay Terms」。`/terms` 第 11 节同步改名并多一句「以及平台怎么收费」。
3. **站内同意弹窗（`ensureBayTerms`）与条款门（`BayTermsGate`）**：标题区多一个「在条款页查看全文」链接，新窗口打开，地址 `portalHref("/legal/marketplace")` + `#bay-terms`（子站上是 `https://oceanleo.com/legal/marketplace#bay-terms`，在门户自己的域名上保持相对路径）。条款取不到、只剩「重试」时链接仍在。弹窗里「你同意过版本 N（时间）。条款已更新，需要重新同意。」保留。
4. **「你同意过第几版」不再有展示位**：公开条款页（`BayTermsPublic`）只讲规则本身。旧的 `BayTermsOverview.tsx`（设置里「规则与条款」页签）我没有删；它现在只剩 `BaySettingsSection.tsx`（W05 的文件）在引用，W05 摘掉后由父 agent 删除。我的两份测试都不碰它。

## 2. 条款页新结构（`/legal/marketplace`）

| 位置 | 标题 | 锚点 | 备注 |
|---|---|---|---|
| 页顶（仅境内版） | 境内版说明 / Mainland Edition | | 保持 |
| 页顶 | 本页要点 / At a Glance | | 新；链到 `#fees`、`#bay-terms` |
| 1 | 三方关系 | | 「人才市场」→「LeoBay」 |
| 2 | 下单、托管与放款 | | 收款账户一句改成「可开通的国家见第 7 节，并以开户页列出的为准」 |
| 3 | 取消与退款 | | 不变 |
| 4 | 争议 | | 不变 |
| 5 | 接单方义务 | | 不变 |
| 6 | 买方义务 | | 不变 |
| 7 | **平台怎么收费与税务 / How Fees Work & Tax** | `#fees`、`#payout-countries` | 原「平台费与税务」，补齐三件事 |
| 8 | 禁止内容 | | 「人才市场」→「LeoBay」 |
| 9 | 适用法律 | | 指向第 10 节，统一叫《LeoBay 使用规则》 |
| 10 | **LeoBay 使用规则（站内同意的版本）** | `#bay-terms`；内含 `#bay-terms-<key>` ×9 | 新；`BayTermsPublic` |
| 11 | 联系我们 | | 原第 10 节 |

副标题保留测试要求的「原名「OceanLeo Bay」「真人协作」」「/bay」，只把末尾的《OceanLeo 真人协作使用条款》换成《LeoBay 使用规则》（全文公开在本页第 10 节）。

## 3. 改名清单

| 位置 | 旧 | 新 |
|---|---|---|
| 门户 `app/_components/legal-shell.tsx` 的 `LEGAL_NAV`（页眉、页脚两处用） | 人才市场条款 Marketplace | LeoBay 条款 LeoBay Terms |
| 门户 `app/terms/page.tsx` 第 11 节标题 | 11. 人才市场 / Talent Marketplace | 11. LeoBay / LeoBay Marketplace |
| 同上，链接文字（中 / 英） | 人才市场条款 / Marketplace Terms | LeoBay 条款 / LeoBay Terms |
| 同上，正文 | 找真人接单或接活 | 通过 {品牌} 的 LeoBay 找真人接单或接活，…以及平台怎么收费 |
| 门户 `app/legal/marketplace/page.tsx` H1 与 `metadata.title` | LeoBay 条款 Marketplace Terms | LeoBay 条款 LeoBay Terms |
| 同上，正文 ×3（第 1、8、11 节）与英文「Marketplace questions」 | 人才市场 / Marketplace questions | LeoBay / LeoBay questions |
| 同上，副标题与第 9 节 | 《OceanLeo 真人协作使用条款》 | 《LeoBay 使用规则》 |

**没改（不在我的边界，已确认仍有旧叫法，交给父 agent）**：
- 门户：`app/refund/page.tsx` 80–82 行「人才市场里的订单不走本政策，按 人才市场条款」；`app/privacy/page.tsx` 47、76、146 行「人才市场」；`app/legal/subprocessors/page.tsx` 63 行「人才市场收款方开户与打款」；`app/_components/clone-shell.tsx` 622 行注释。
- 帮助文：`content/help/bay/terms-entry.md`（「设置窗里的 LeoBay，打开 规则与条款：能看到你同意过哪些条款…」整段已过时；链接文字「LeoBay 市场条款」）、`fees.md`（「设置窗里的 LeoBay → 钱 …平台怎么收费的说明」；链接文字「LeoBay 市场条款」）、`payment-and-refund.md`（链接文字「LeoBay 市场条款」）。
- 共享 UI：`src/shell/index.ts`、`src/api/talent-handoff.ts` 里的「人才市场」字样（看上去是注释，未细核）。

## 4. 文件清单

**共享 UI `/root/projects/oceanleo-ui`**
- 实现（第一轮，父 agent 以 `cdf86420` 入库）：`src/shell/bay/settings/{BayTermsPublic,terms-text,BayTermsDialog,BayTermsGate}.tsx`、`src/lib/bay/terms.ts`、`src/i18n/ui/messages/lbp-w07-copy.ts`
- 本轮：`src/shell/bay/settings/terms-text.tsx`、`BayTermsPublic.tsx`（只换成 `ui.css` 里已有的类，见第 6 节 D）、`terms-flow.tsx`（一行注释）、`tests/lbp-w07-terms.test.mjs`（新）、`tests/bay-settings-terms.test.mjs`（一条断言消息）
- 提交：`cdf86420`（第一轮，父 agent 入库）、`ee044dcb`（测试 + 注释）、`2387ad70`（换类）；`cda5124c`、`a1850ac5` 是 signals 状态文件；交卷提交就是带本文件的那一个

**门户 `/root/projects/oceanleo`**
- `app/_components/legal-shell.tsx`、`app/legal/marketplace/page.tsx`、`app/terms/page.tsx`
- **边界外新增 2 个文件（有意的）**：`app/legal/marketplace/bay-terms-public-client.tsx`（页面是服务端组件，`BayTermsPublic` 是客户端组件，必须隔一层 `"use client"`；照 `app/legal/rights-notice/rights-notice-form.tsx` 的先例放在页面同目录，用 `next/dynamic` + `importWithChunkReload` 惰性取，和 `shared-shell-client.tsx` 同一形状）；`tests/lbp-w07-legal-pages.test.mjs`（门户侧源码断言，见第 5 节）
- 提交（顺序）：`c94705c`（导航改名、第 7 / 10 节、`/terms`、客户端包装、测试）、`01901a3`（措辞「不抽佣（不抽成）」、算例写成 $100）、`badb773`（第 10 节说明站内弹窗的标题叫「使用条款」）

## 5. 测试与类型检查（原文）

共享 UI（`/root/projects/oceanleo-ui`，命令 `node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs`，经 `agent-io-guard.sh run-light`）：

```
lbp-w07-terms            # tests 18 # pass 18 # fail 0     （新增）
bay-settings-terms       # tests 13 # pass 13 # fail 0
bay-buy-sell-terms       # tests 5 # pass 5 # fail 0
bay-settings-lib         # tests 6 # pass 6 # fail 0
bay-settings-section     # tests 8 # pass 8 # fail 0
bay-orders-panes         # tests 9 # pass 9 # fail 0
bay4-mine-trade          # tests 10 # pass 10 # fail 0
```

`lbp-w07-terms` 覆盖：BayTermsPublic 加载态 / 版本号与生效日期（UTC 日历日，`TZ=Pacific/Auckland` 下也绿）/ 9 节各带 `#bay-terms-<key>` / 目录 9 链接指向存在的锚点 / 只请求 `GET /v1/talent/terms/current`（`anonymous: true`，没有 status、没有任何写、不弹登录）/ 不出现「你同意过、你已同意、还没有同意、登录后查看、同意时间、同意并继续」/ `<script>` 当文本 / 一个 `dark:` 类都没有 / 失败给原因 + 重试、重试成功渲染、再失败仍可重试 / 空文档按失败处理 / 无日期只写版本 / 老式整篇正文显示成一节 / 带 `#bay-terms-fees` 打开就绪后滚到该节、别的锚点和不存在的节不滚；弹窗（买家、卖家、条款取不到、改版后）与条款门里的「在条款页查看全文」：`https://oceanleo.com/legal/marketplace#bay-terms`、`target=_blank`、`rel` 含 `noopener noreferrer`、点它不关窗不 POST；门户域名上保持相对路径；`bayTermsPagePath` / 常量；BayTermsPublic 源码不引用 `use-bay-load`、`terms-flow`、`bay-state`、`BayTermsOverview`；I-9 出口行在；`lbp-w07-copy` 17 语种都有译文且只登记本波新增的一条。变异检查：去掉链接 `target`、去掉锚点 → 7 条变红（已还原）。

`tests/i18n-tt-key-coverage.test.mjs`：`# tests 10 # pass 7 # fail 3`。第 1–7 条绿（含「统一外壳用到的 key 16 语不缺」「本波词典 16 语齐全」）；第 8、9、10 条（全仓缺口基线 / 死条目 / 棘轮）红，**红的全是别人的文件**（`bay/apps`、`messages/*`、`media-editors`、`bay/seller/ServiceEditorPane.tsx` 等），没有一条在我的文件里，我新增的唯一一条文案「在条款页查看全文」17 语齐全。

共享 UI `pnpm typecheck`（`run-heavy`，21:0x 的最后一次）：

```
$ tsc --noEmit
exit=0
```

0 条错误（开工时的 3 条基线错误已被别的工程修掉；我中途 20:3x 跑的那一次有 3 条错，全在 W08 在途的 `messages/MessagesHost.tsx`、`leochat/LeoChatPage.tsx`、`leochat/LeoChatPanel.tsx`，后来也消失了；任何一次里我的文件都是 0 条）。

门户（`/root/projects/oceanleo`，`node --test tests/<名字>.test.mjs`）：

```
lbp-w07-legal-pages          # tests 9 # pass 9 # fail 0     （新增）
talent-entry-domain-family   # tests 7 # pass 7 # fail 0
legal-rights-notice          # tests 4 # pass 4 # fail 0
```

`lbp-w07-legal-pages` 是源码断言：导航与 `/terms` 改名且无「人才市场」；页面保留老测试要求的字样；`LegalSection` 的 `id`；第 10 节 `id="bay-terms"` 挂 `BayTermsPublicSection`、境内分支不挂；共享包 `BAY_TERMS_PAGE_ANCHOR` 与页面 id 对得上；客户端边界形状；第 7 节内容；**通道费常量与后端 `payments.py` 的 `CHANNEL_FEE_BPS = 390`、`CHANNEL_FEE_FIXED_MINOR = 30` 逐个相等、算例与帮助文一致；43 个国家码与后端 `stripe_connect.py` 的 `SUPPORTED_PAYOUT_COUNTRIES` 逐个相等**（后端改了名单，这页会红）。变异检查：删一个国家、改 BPS、还原旧导航名 → 3 条变红（已还原）。

门户 `pnpm typecheck`（`run-heavy`，最后一次，在我最后一次改页面之后）：

```
lib/oceanleo-ai.ts(24,3): error TS2322: Type 'import("/root/projects/oceanleo-ui/node_modules/.pnpm/@supabase+supabase-js@2.108.1/…/SupabaseClient<any, "public", "public", any, any> | null' is not assignable to type 'import("/root/projects/oceanleo/node_modules/.pnpm/@supabase+supabase-js@2.108.2/…
lib/supabase.ts(13,3): error TS2322: Type 'import("/root/projects/oceanleo-ui/node_modules/.pnpm/@supabase+supabase-js@2.108.1/…
proxy.ts(58,27): error TS2345: Argument of type 'import("/root/projects/oceanleo-ui/node_modules/.pnpm/next@16.2.9_…/NextResponse<unknown>' is not assignable to parameter of type 'import("/root/projects/oceanleo/node_modules/.pnpm/next@16.2.6_…
proxy.ts(58,47): error TS2345: Argument of type 'import("/root/projects/oceanleo/node_modules/.pnpm/next@16.2.6_…/NextRequest' is not assignable to parameter of type 'import("/root/projects/oceanleo-ui/node_modules/.pnpm/next@16.2.9_…
[ELIFECYCLE] Command failed with exit code 2.
```

恰好是开工前基线（`/tmp/w07-portal-typecheck-baseline.txt`）里的那 4 条（两份 supabase-js / next 版本并存造成的既有错误），**逐条相同、没有新增**；`app/legal/marketplace/*`、`app/_components/legal-shell.tsx`、`app/terms/page.tsx` 0 条。中途（20:3x）有过 4 条新增，全在共享 UI 的他人文件（W02 的 `bay/shell/BayList.tsx`、W08 的 leochat / messages），后来也消失了。

门户 `eslint`（`app/legal/marketplace app/_components/legal-shell.tsx app/terms/page.tsx`）：无输出（0 错 0 警告）。

HTTP（LeoDev 门户槽 `https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/`，只看状态码与 HTML）：`/legal/marketplace` 200，`<title>` 为「LeoBay 条款 LeoBay Terms — OceanLeo」，导航新名、无「人才市场条款」，`<section id="fees">`、`<section id="bay-terms">`、`<p id="payout-countries">` 在，12 个 h2（本页要点、1–11），第 7 节算例与 43 国渲染正确，第 10 节服务端 HTML 里是占位「正在加载… Loading…」；`/terms` 200，第 11 节新名；客户端包装块 `…bay-terms-public-client_tsx_….js` 200 且含 `importWithChunkReload`、`ssr: false`、`BayTermsPublic`。开发网关 `GET /v1/talent/terms/current` 对 `Origin: https://p-511a…dev.oceanleo.com` 和 `https://oceanleo.com` 都返回 `access-control-allow-origin` 等于该 origin（浏览器里的取数不会被 CORS 拦）。没有开浏览器，所以「条款页第 10 节在真浏览器里画出 9 节」靠上面的组件测试（JSDOM）与 HTTP 证据，没有目视。

## 6. 发现，以及需要父 agent / 操作员决定的事

**A. 【需要操作员拍板】网关当前条款（第 3 版）的「费用」一节与条款页互相矛盾。** 网关下发的 `fees` 一节正文是：「**本平台不抽佣。** 平台抽佣恒为 0 …… 当前版本不接入任何支付通道，合同金额、里程碑与账单只用于记录与对账；实际收付款由你们双方自行完成。」而条款页第 2、3、7 节写的是 Stripe 托管、放款、退款与通道费。第 10 节上线后，**这两种说法会出现在同一页**，而第 9 节规定「若有不一致，以你接受的站内版本为准」——也就是以「不接入任何支付通道」为准。文本在库里（`backend/migrations/0186_talent_terms_offplatform_v1.sql` 插入的 v3 行，表 `talent_terms_versions`），我无权写库也不该改法律文本。可选做法由操作员定：发 v4 把「费用」一节改成与付款开放状态一致；或在付款开放前改条款页的措辞。在此之前，把第 10 节挂上线等于公开这个矛盾。
**B. 公开页的服务端 HTML 里没有站内条款正文**（`ssr: false`，只有占位）。这符合「条款改版立即生效、不进边缘缓存」，但不执行 JS 的读者（含部分审核爬虫）只能看到第 1–9 节的写死文本。若要补，做法是门户页服务端取一次再传给 `BayTermsPublic`（它现在只有 `className` 一个 prop，I-9 没有给 `initial`），不在本次范围。
**C. `cache-policy.ts` 里 `/legal/marketplace` 的理由写着「无 fetch、无 cookie 读」**：服务端渲染仍然如此（取数在浏览器里、取的是公开数据、不进 HTML），所以公开缓存档仍然成立；但这句话读起来与第 10 节矛盾，建议父 agent 补一句「第 10 节由客户端组件在浏览器取公开条款，SSR 只给占位」。不在我的边界。
**D. `src/theme/ui.css`（预编译产物）**：`tests/theme-artifact-in-sync.test.mjs` 当前红（当时「少了 28 条真在用的规则」，都是别人的新类名）。我最初用了 3 个产物里没有的类（`scroll-mt-6`、`hover:text-neutral-950`、`dark:hover:text-white`），已换成产物里已有的 `scroll-mt-4`、`hover:text-neutral-900`、`dark:hover:text-neutral-100`（提交 `2387ad70`），所以**我的文件不给产物增加任何缺口**；父 agent 收尾时仍需 `pnpm build:css` 并提交 `src/theme/ui.css`，处理别人的 28 条。
**E. `src/architecture/public-api.snapshot.json` 已陈旧**（`node scripts/public-api-snapshot.mjs --check` → "Public API snapshot is stale"）。快照只记入口文件里的直接声明；我没有碰任何入口文件（`settings/index.ts` 不是入口，`BayTermsPublic` 的导出行是父 agent 放的），所以不是我造成的，收尾时统一 `pnpm api:snapshot`。
**F. 删 `BayTermsOverview.tsx` 之后可清的东西**（都不在我的边界）：`src/i18n/ui/messages/bay-money-copy.ts` 里只有它用的词条（`acceptedTerms`「你同意过的条款」、`youAccepted`「你已同意第 {n} 版」、`notAcceptedYet`「你还没有同意过当前条款」、`signInForTerms`「登录后查看你的同意记录」，以及 `terms`「规则与条款」页签名）；`use-bay-load.ts` 的头部注释还提「规则与条款」。留着不会出错，只是死词条。
**G. 老的红**（与本任务无关）：门户 `tests/bay-portal-help.test.mjs` 第 9 条（`what-is-bay.md` 里没有「LeoSlides」，早先「类目标签去掉 Leo」提交留下的）；门户 `tests/first-screen-barrel.check.mjs`（`clone-shell.tsx` 静态引了别人加的几个 barrel 导出）。
**H. 门户测试对共享 UI 的耦合**：`tests/lbp-w07-legal-pages.test.mjs` 第 5 条经 `node_modules/@oceanleo/ui` 读共享 UI 的 `lib/bay/terms.ts` 核对锚点。本地软链下是绿的；门户 `package.json` 里 `@oceanleo/ui` 还钉在 `#v0.233.82`，没升到包含本波的版本之前，在固定版本的安装上跑这一条会红（页面本身的 `BayTermsPublic` 导入也一样要求新版本）。升版本是父 agent 的事。
**I. 页面「最后更新」**：我把 `/legal/marketplace` 改成 2026-10-23（新增整节与国家名单，是实质修改）；`/terms` 只是改了一处链接叫法，没动 `UPDATED`（2026-10-03）。如要一起改，在 `app/terms/page.tsx` 一处常量。

## 7. 对其他 owner 的接口说明

- `src/lib/bay/terms.ts` 新增：`BAY_TERMS_PAGE_PATH`（`"/legal/marketplace"`）、`BAY_TERMS_PAGE_ANCHOR`（`"bay-terms"`）、`bayTermsPagePath(sectionKey?)`（相对地址，带锚点；子站上外面再包 `portalHref()`）。W05 若要在设置页放「去条款页」链接，可直接用 `BayTermsFullTextLink`（`src/shell/bay/settings/terms-text.tsx`，已带新窗口、`noopener`、`tt`）。
- `terms-text.tsx` 仍导出 `bayUiLocale`（W05 的 `money-ui.tsx` 在用）、`formatBayTermsTime`、`BayTermsSections`（默认行为不变，新增可选的 `tone`、`anchors`）。
- `BayTermsPublic`（I-9）：`{ className? }`，自带取数，不依赖 `use-bay-load.ts`、`terms-flow.tsx`、`bay-state.ts`，所以 W05 删 / 改这些文件不会牵连它。
- 门户 `LegalSection` 多一个可选 `id`；不传时输出与以前一字不差。

## 8. 没做完的和原因

没有未完成项。没做的是目视：本任务未批准开浏览器，条款页在真浏览器里的样子（第 10 节 9 节的版式、国家名单的折行）只有 JSDOM 测试与 HTTP 证据。
