# W05 交卷：设置 → LeoBay 一页化、钱页拆除、数据面板加卖家的钱、入口改指

仓：`/root/projects/oceanleo-ui`，分支 `main`，不 push。任务书七条全部做完，没有留尾巴；没做的和需要父 agent 接手的在 §7。

提交（均只含 W05 边界路径，路径限定提交）：

| 提交 | 内容 |
|---|---|
| `263df010` | 设置一页化、钱页与「编辑主页」门删除、数据面板收款状态 + 收入流水、入口改指、退役种类名清扫、分表、旧测试改绿 |
| `65b9ea39` | 新测试 `tests/lbp-w05-settings-dashboard.test.mjs`，state/journal |
| `9f3b14f0` | 收入流水卡的说明等收款状态取到再写；新增一条用例；journal |
| `8734244f` | 右栏老深链转走的用例（代码是父 agent 的 `0c115e20`）；`money.ts` 注释；journal |
| 本交卷提交 | 本文件 + state/journal |

## 1. 用户看到的变化

1. **设置 → LeoBay** 现在只有一页，没有页签，两块白色圆角卡片：
   - 「付款卡 / Payment card」：买家下单托管扣款用的卡。有卡显示「已绑卡 · visa ·••• 4242」和有效期；付款没开放写「付款暂未开放」+「绑卡暂未开放」；付款开放了但没存卡写「还没有付款卡」+「绑卡暂未开放」。
   - 「收款账户 / Payout account」：通道没开放写「收款暂未开放」，开放了写「收款账户状态：可以收款 / 开户办理中 / 通道审核中 / 收款受限 / 已停用 / 还没有收款账户」；有原因时列在「为什么还收不了款」下面；最后固定两句「开户暂未开放」「提现暂未开放」。
   - 没登录：「登录后查看付款卡和收款账户」+ 登录按钮。加载失败：错误句 + 重试。境内：整块不渲染，也不发请求。
   - 全页仍然没有任何会碰 Stripe 的按钮（契约 §7）。
2. **旧入口都落到这一页**：`openBaySettings(pane?)` 签名不变，传 `profile` / `vetting` / `money` 或不传都只是打开设置窗的 LeoBay 栏；Bay 右栏里 `?bay=settings:money` 与 `?bay=settings`（`BaySettingsPane`）显示同一页，「在设置中打开」照旧。**例外**：`?bay=settings:vetting` / `settings:profile`（网关通知与旧书签仍会发）在右栏里直接转去「我的 → 我的主页」（`vetting` 带 `requestMinePageEdit("vetting")` 滚到核验块，`profile` 只进编辑），不显示付款页。这一处转走的代码是父 agent 按我 journal 里的发现提交的（`0c115e20`，「W05 request」），不是我写的；我复核了 `replaceBay`（换掉当前这一层详情，不新增返回层）和 `requestMinePageEdit` 的用法，补了用例「右栏的老深链 settings:vetting / settings:profile…转去我的主页」。
3. **数据面板**（我的 → 数据面板，及 `?bay=dashboard`）：
   - 统计格里「托管中」右边多了一格「收款状态」：值是「暂未开放 / 可以收款 / 通道审核中 …」，下面一句说明——没开放：「平台暂时不代收代付；开放后，订单款验收通过即转入你的收款账户。」；可收款：「订单款先托管，验收通过后转入你的收款账户。」；账户还没办好：「收款账户还不能收款，点开看原因。」。点这一格打开设置的新单页。
   - 三张白色卡片隔开：总览图（原有，含统计格）/「商品明细」（原来裸表，现在进卡）/ 新的「收入流水」。页头（标题 + 时间段）和面板外框不加白底（§5.3）。
   - **收入流水**卡：逐笔列出账本里 `direction=in` 的记录（首屏 20 笔，「加载更多」按页追加，按 id 去重）；有订单的行有「查看对账单」，点开在卡内展开对账单（`StatementPanel`），可关；「导出 CSV」翻完所有页（每页 100，最多 50 页）导出，带 BOM，文件名 `bay-income.csv`；卡上说明：没开放时「下面的金额是记账，不是可动用的钱：平台目前不代收代付」，开放后「订单款由 Stripe 托管，验收后直接转入你的 Stripe 收款账户；平台不抽佣。」，再一句「流水只是逐笔记录，收入数字以上面的为准。」。收款状态还没取到时先不写那句（不先写错再换）。流水取不到只在这张卡里给重试，其余数字照常。
   - **收入数字只有一套**：全 src 里只剩数据面板的「累计收入」一个；原钱页的「本月收入 / 累计收入 / 进行中订单 / 12 个月柱状图」随钱页一起没了；不再调用 `/v1/talent/ledger/summary`。
   - 商品行「种类」列改用统一名字：网站与软件服务 / 课程 / 套餐 / 人工服务 / 现成文件 / 其他 / 其他订单（旧的「作品」「服务」退役）。
4. **我的 → 数据面板顶上两个按钮**：「收款设置」→ `openBaySettings()`；「资质核验」→ `requestMinePageEdit("vetting"); openBay({ kind: "mine", tab: "page" })`（I-8；W06 的可选参数 `"vetting"` 保证一定滚到核验块，无参调用只在主页已公开时才滚）。旧的「认证」「收款」按钮没了。
5. **钱页拆除**：`BayMoneySection.tsx`、`BaySettingsProfileDoor.tsx` 已删，src 里零引用；买家花销归 W04、收费说明归 W07。两处旧缺陷（「本月花了」= 累计、支出柱状图永远空）随拆除消失，没有残留入口再显示它们。
6. **退役种类名清扫**（§5.1）：边界内 `tt()` 句子和注释里不再用「作品 / 服务 / 素材 / 成品文件」指一个种类（见 §4）。

## 2. 入口改指清单（文件:行 → 新目标）

| 位置 | 按钮文字（不变） | 旧目标 | 新目标 |
|---|---|---|---|
| `src/shell/bay/orders/OrderPane.tsx:308` | 去设置付款方式 | `openBaySettings("money")` | `openBaySettings()` |
| `src/shell/bay/apppaid/AppPurchaseBar.tsx:213` | 去检查付款方式 | `openBay({kind:"settings",pane:"money"})` | `openBaySettings()` |
| `src/shell/bay/apppaid/AppPurchaseBar.tsx:302` | 去设置付款方式 | 同上 | `openBaySettings()` |
| `src/shell/bay/apppaid/PricingManagePanel.tsx:170` | 去开通收款 | 同上 | `openBaySettings()` |
| `src/shell/bay/apppaid/MyBoughtAppsPane.tsx:149` | 去检查付款方式 | 同上 | `openBaySettings()` |
| `src/shell/bay/seller/MyServicesPane.tsx:84` | 收款账户 /（去设置里看）（原「收款与账单」） | `openBaySettings("money")` | `openBaySettings()` |
| `src/shell/bay/mine/MyDashboardTab.tsx:22` | 收款设置（原「收款」） | `openBaySettings("money")` | `openBaySettings()` |
| `src/shell/bay/mine/MyDashboardTab.tsx:30-31` | 资质核验（原「认证」） | `openBaySettings("vetting")` | `requestMinePageEdit("vetting")` + `openBay({kind:"mine",tab:"page"})` |
| `src/shell/bay/dashboard/DashboardPane.tsx:105` | 收款状态格（新） | — | `openBaySettings()` |

`src/shell/bay/deal/deal-actions.ts` 里的 `openBaySettings(target.pane)` 归 W06（会话系统消息），签名没变，传什么都落到这一页。

## 3. 文件清单

**改**：`src/lib/bay/money.ts`（加 `fetchBayPayoutStatus` / `BayPayoutStatus` / `bayPayoutAccountIsPayable`；账户状态 `ready` 认作「可以收款」；网关 USD 那句映射成带译文的短句）、`src/lib/bay/payments.ts`（仅注释）、
`src/shell/bay/settings/{BaySettingsSection,BaySettingsPane,money-ui,settings-open,settings-pane-store,use-bay-load}.ts(x)`（`settings/index.ts` 没动，W07 的导出行都在）、
`src/shell/bay/dashboard/{DashboardPane,StatTile,dashboard-model,ProductTable,OverviewChart}.ts(x)`、`src/shell/bay/mine/MyDashboardTab.tsx`、
`src/shell/bay/apppaid/{AppPurchaseBar,AppPurchaseStatus,MyBoughtAppsPane,MySoldAppsPane,PricingManagePanel,paid-model}.ts(x)`、`src/shell/bay/orders/OrderPane.tsx`、`src/shell/bay/seller/MyServicesPane.tsx`、`src/i18n/ui/messages/lbp-w05-copy.ts`（28 条 × 17 语）。
**增**：`src/shell/bay/dashboard/IncomeLedgerCard.tsx`、`tests/lbp-w05-settings-dashboard.test.mjs`。
**删**：`src/shell/bay/settings/BayMoneySection.tsx`、`src/shell/bay/settings/BaySettingsProfileDoor.tsx`。
**测试改**：`tests/bay-settings-section`（四块 → 一页）、`bay-settings-store`（页签/请求机制已删）、`bay-settings-copy`（设置目录里的新句子也认 `lbp-w*-copy` 分表；这一处同时让 W07 的「在条款页查看全文」不再红）、`bay-app-paid-copy`（登记 W05 分表）、`bay-seller-panes`（入口不带 pane、新文案）、`bay-seller-profile-reveal`（那扇门已拆）。

接口说明：
- I-6：`money-ui.tsx` 的 `StatementPanel`、`LedgerList`、`MoneyStat`、`MonthlyBars`、`useBayMoneyLocale` 导出名与 props 一字未动（测试里逐个断言）。`MoneyCard` 加了可选 `hint` 并改成白色圆角卡片样式（只有设置页用它）。W04 的 `lbp-w04-mine.test.mjs`（用 `StatementPanel`）22/22 绿。
- I-7：`openBaySettings(pane?)` 签名不变。`BaySettingsPaneName` 类型保留 `"profile" | "vetting" | "money"`（`bay-state.ts` / `bay-links.ts` / `deal-lines.ts` 还在用）。
- I-8：见 §1.4。

## 4. 退役种类名清扫（§5.1）明细

| 位置 | 旧 | 新 |
|---|---|---|
| `dashboard-model.ts` 商品行种类 | 作品 / 服务 | 网站与软件服务 / 人工服务（网关若带 `listing_kind` 则 digital → 现成文件、other → 其他） |
| `apppaid/AppPurchaseBar.tsx`、`MyBoughtAppsPane.tsx` 购买确认句 | …7 天内没打开过作品可直接全额退… | …7 天内没打开过可直接全额退… |
| `AppPurchaseStatus.tsx` | 已退款，作品已收回 | 已退款，使用权已收回 |
| `MyBoughtAppsPane.tsx` | 没读到你买到的作品… / 你还没有买过或试用过任何作品 | …买到的东西… / …任何东西 |
| `MySoldAppsPane.tsx` | 没读到作品订单… / 还没有人买过你的作品 | 没读到订单… / 还没有人买过你的商品 |
| `PricingManagePanel.tsx` | 这个作品不存在或已下架 | 找不到这件东西，可能已下架。 |
| `seller/MyServicesPane.tsx` | 登录后管理你发布的服务。/ 还没有发布过服务。… / 发布第一个服务 / 未命名服务 | 登录后管理你发布的东西。/ 还没有发布过东西。把一件你做得好的事发布出来，别人就能直接下单。/ 去发布 / 未命名 |
| 注释 | 作品页、成品文件、素材与服务… | 详情页、现成文件、网站与软件服务… |

保留不动的非种类词：`服务端`（server side）。`套餐`（课程打包）不是 §5.1 的种类名，商品行里保留。

## 5. 实测与证据

- 开发网关 `GET /v1/talent/payments/config`：`buyer_ready=false`、`seller_ready=false`；`payout-account` / `paid-work-eligibility` / `ledger` / `payment-method` / `bay/dashboard` 不带令牌都是 401（游客分支成立）。
- 只读 SQL（`supabase-sql oceanleo`）：`talent_ledger_entries` 共 4 条 `in`，全是 `completed`、`contract_id` 为空、USD（两个账号各 $25.00 + $9.90）；数据面板按已完成合同算，同两个账号是 $0。所以流水卡上必须写「收入数字以上面的为准」，并且这几行没有「查看对账单」（没有 contract_id）。**流水与面板数字对不上是数据本身的差，不是前端算错**；前端只保留面板一套。
- 后端 `backend/app/talent/payouts.py`：能收款的账户状态叫 `ready`（`PAYABLE_STATES`），前端旧标签表只认 `active`，真有可收款账户时会显示「状态未知」。已修（`ready` 与 `active` 都是「可以收款」）。
- 后端给的几句收款原因（办理中 / 被限制 / 已停用 / 还不能收款 / 美元账本）在词典里没有译文，英文用户会看到中文；已补进分表，USD 那句（中英混写）在 `money.ts` 里映射成短句。
- LeoDev 槽 HTTP：`/bay`、`/bay?bay=settings:money`、`/bay?bay=dashboard`、`/settings/bay` 均 200，HTML 里没有 Module not found / Build Error。
- 没开浏览器、没截图（本任务未批准）：版式只靠结构断言（卡片 class、顺序、有无页签）和代码阅读核对，建议 V01 或父 agent 在预览里看一眼设置页与数据面板的实际排版。

## 6. 测试命令与结果原文

命令（共享 UI，单文件；多文件会被 io-guard 判成 heavy，所以逐个跑）：

```bash
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs
```

新增 `tests/lbp-w05-settings-dashboard.test.mjs` 的 TAP 尾部原文：

```
# tests 33
# suites 0
# pass 33
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

（33 条覆盖：单页两块且无页签 / 旧 pane 与右栏落点 / `openBaySettings` 签名 / 没就绪无可点按钮且不发 POST / 就绪有卡有状态 / 无卡 / 收款原因英文不留中文 / 游客与失败重试 / 境内不渲染 / 钱页与门已删且无引用 / I-6 导出名 / 收款状态格紧挨「托管中」与三种说明 / 白色卡片与只有一个累计收入 / 收入流水逐笔、direction=in、不调 summary / 开放后说明 / 收款状态未取到先不写 / 对账单展开关闭与失败 / 加载更多去重 / CSV 全页与 BOM / 流水失败只影响这张卡 / 主数据失败整页重试 / 顶部两个按钮 / 入口改指 / 全 src 无 money 入口 / 模型与取数小件 / 分表 17 语 / tt 句子 16 语齐全 / §5.1 守卫。）

任务书点名的 `grep -l "BaySettingsSection\|BayMoneySection\|DashboardPane\|openBaySettings\|data-bay-settings" tests/*.mjs` 命中的 22 个文件 + 我碰过的和相关的，逐个跑的最终结果（节选自 `/tmp/w05-final-summary.txt`，runner 每行是该文件 TAP 尾部的 tests/pass/fail）：

```
OK tests/bay2-publish-form.test.mjs tests=9 pass=9 fail=0
OK tests/bay4-mine-me.test.mjs tests=3 pass=3 fail=0
OK tests/bay4-mine-trade.test.mjs tests=10 pass=10 fail=0
OK tests/bay4-publish.test.mjs tests=8 pass=8 fail=0
OK tests/bay-app-paid-copy.test.mjs tests=2 pass=2 fail=0
OK tests/bay-app-paid.test.mjs tests=9 pass=9 fail=0
OK tests/bay-buy-sell-terms.test.mjs tests=5 pass=5 fail=0
OK tests/bay-dashboard-copy.test.mjs tests=2 pass=2 fail=0
OK tests/bay-dashboard-overview.test.mjs tests=3 pass=3 fail=0
OK tests/bay-dashboard.test.mjs tests=5 pass=5 fail=0
OK tests/bay-deal-open-thread.test.mjs tests=3 pass=3 fail=0
OK tests/bay-deal-view.test.mjs tests=10 pass=10 fail=0
OK tests/bay-needs-post-need.test.mjs tests=7 pass=7 fail=0
OK tests/bay-needs-propose.test.mjs tests=6 pass=6 fail=0
OK tests/bay-orders-card.test.mjs tests=7 pass=7 fail=0
OK tests/bay-orders-panes.test.mjs tests=9 pass=9 fail=0
OK tests/bay-seller-editor.test.mjs tests=16 pass=16 fail=0
OK tests/bay-seller-panes.test.mjs tests=5 pass=5 fail=0
OK tests/bay-seller-profile-reveal.test.mjs tests=2 pass=2 fail=0
OK tests/bay-settings-copy.test.mjs tests=3 pass=3 fail=0
OK tests/bay-settings-hooks.test.mjs tests=4 pass=4 fail=0
OK tests/bay-settings-lib.test.mjs tests=6 pass=6 fail=0
OK tests/bay-settings-section.test.mjs tests=8 pass=8 fail=0
OK tests/bay-settings-store.test.mjs tests=2 pass=2 fail=0
OK tests/bay-settings-terms.test.mjs tests=13 pass=13 fail=0
OK tests/bay-supply-checkout.test.mjs tests=10 pass=10 fail=0
OK tests/lbp-w04-mine.test.mjs tests=22 pass=22 fail=0
OK tests/lbp-w05-settings-dashboard.test.mjs tests=33 pass=33 fail=0
OK tests/lbp-w06-verification-grants.test.mjs tests=30 pass=30 fail=0
FAIL tests/bay-needs-accept-not-open.test.mjs tests=1 pass=0 fail=1
FAIL tests/bay-needs-demand-pane.test.mjs tests=1 pass=0 fail=1
FAIL tests/bay-needs-help.test.mjs tests=1 pass=0 fail=1
FAIL tests/i18n-tt-key-coverage.test.mjs tests=10 pass=7 fail=3
```

四条 FAIL 都不是 W05 造成的：

- `bay-needs-accept-not-open` / `bay-needs-demand-pane` / `bay-needs-help`：整份文件在加载期就死（`OCEANLEO-TEST-FILE-DID-NOT-RUN`），原因是它们给 `contracts/domain-family` 打的桩缺 `runtimePageOrigin`，而 `src/lib/auth/client.ts` 早就 import 了它。我在波开工提交 `ea9a000a` 的临时 worktree 里实跑过：同样 `pass 0 fail 1`。归属 W03 的 `needs/*` 测试，补桩即可，我没碰。
- `i18n-tt-key-coverage`：#8/#9/#10 是全仓的历史缺口棘轮，波内别的 owner 在改（`messages/Inbox.tsx`、PDF 编辑器、`全部站点` 已补译还留在 PRE_EXISTING_GAPS 等）。我对比了开工基线与现在的失败输出：**没有任何一条落在 W05 边界的文件里**，也没有因为我删 `BayMoneySection.tsx` 而新增的「死登记」（死登记数从 184 降到 183）。这个测试文件我没改。

另外跑了仓内扫描类闸（`focus-ring-budget`、`motion-no-raw-duration`、`motion-token-adoption`、`bay-shell-static`、`gateway-fetch-credentials` 红；`motion-compositor-only`、`architecture-convergence`、`untrusted-content-bay-app-frame`、`bay-orders-static`、`bay-loading-effect-locale` 绿），红的几条列出的违规文件里没有 W05 路径（焦点环：AuthDialog、ProfilePageEditor、CreateComputerDialog、collection-chrome、PDF、messages/*；裸时长：inline-advanced-shell-parts、CallTestPanel、PluginChromeFrame；`gateway-fetch-credentials`：`lib/bay/public.ts:482`、`lib/mail-api.ts:61`；`bay-shell-static`：`BayMine.tsx` 的 `page` 类）。

类型检查（`pnpm typecheck`，heavy 槽）：

```
TYPECHECK_PLACEHOLDER
```

## 7. 没做完的、发现的、需要父 agent 接手的

1. **通知深链**：`backend/app/notifications.py:277-281` 仍发 `/bay?bay=settings:money`、`settings:vetting`、`settings:profile`（`payouts.py:334` 的 `BAY_MONEY_SCENE = "settings:money"`、`config.py:150` 注释同）。`money` 落付款卡 + 收款账户一页，正好；`vetting` / `profile` 现在由右栏 `BaySettingsPane` 转去我的主页（见 §1.2），后端暂时不用改。只有从设置窗里 `openBaySettings("vetting")` 才会落到付款页，但现在没有任何调用方这样传（W06 已把会话系统消息改指我的主页）。
2. **商品行种类列要分「现成文件」和「人工服务」**需要网关在 `/v1/bay/dashboard` 的 `service` 行里带 `listing_kind`（`backend/app/bay_apps/dashboard.py` 的 `_catalog` / `_blank_product` 一行，加 `lib/bay/dashboard.ts` 的可选字段）。前端已经按 `listing_kind` 分（digital → 现成文件、other → 其他），没带时一律「人工服务」。
3. `BayTermsOverview.tsx`（W07 的）现在零引用，按 W07 交代由父 agent 删。
4. 帮助文章 `content/help/bay/{terms-entry,fees}.md` 还写着「设置窗 → LeoBay → 规则与条款 / 钱」（W07 已报），不在任何 owner 边界。
5. `fetchBayLedgerSummary`（有测试引用）和 `MonthlyBars`（I-6 要求保留的导出）现在没有界面使用，留着不删；`MoneyStat` 仍被 `StatementPanel` 内部用。
6. 流水卡的 CSV 每页都会让网关重读整本账（`list_ledger` 每次取全量再切片）；账本很大时导出会慢，上限已封在 50 页。后端若加游标可去掉。
7. 与合同 I-8 原文的差别：「资质核验」按钮我传了 W06 提供的可选参数 `"vetting"`（原文是无参 `requestMinePageEdit()`）。无参时只有主页已公开才落在核验块，传 `"vetting"` 才保证一定滚到；旧调用方不受影响。
8. 没有浏览器验证排版（见 §5）。

## 8. 给别的 owner 的话

- W04：`StatementPanel` / `useBayMoneyLocale` / `fetchBayStatement` / `formatBayFen` 都没变。
- W06：`MyDashboardTab` 调用 `requestMinePageEdit("vetting")`，依赖你已入库的可选参数；`BaySettingsSection` 不再 import `BayVettingSection`。
- W07：`BaySettingsSection` 不再渲染 `BayTermsOverview`；`settings/index.ts` 原样；`tests/bay-settings-copy.test.mjs` 现在也认 `lbp-w*-copy.ts` 分表，你的 `fullTextLink` 因此不再让它红。
