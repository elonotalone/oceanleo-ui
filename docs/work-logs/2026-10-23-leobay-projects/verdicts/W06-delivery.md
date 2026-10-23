# W06 交卷 · 资质核验进「我的主页」、系统消息改指、应用登录授权进设置 → 账户

W06（实现 owner，重派后完成）。上一轮被用量上限打断时只留下 state/journal，没有代码入库；本轮代码全部是新做的。

提交（均只含边界内路径，`git show --stat` 可逐个核）：
- `22b55c94` 主体：核验卡、入口请求、系统消息改指、账户子页、17 语文案
- `ecae1de1` 新测试 `tests/lbp-w06-verification-grants.test.mjs`
- `ec171878` 应用列表无障碍小修、`app-login.ts`/`ProfilePane` 注释清掉退役名
- `1a606c7c` 测试等待时间与去掉跨 owner 的词条表耦合
- 本交卷文件所在的最后一个提交（`git log -1 -- docs/work-logs/2026-10-23-leobay-projects/verdicts/W06-delivery.md`）

## 一、用户看到的变化与进入路径

### 1. 资质核验 → 我的主页（编辑状态里的一张白卡「资质核验 / Verification」）

进入路径：
- **手动**：LeoBay → 我的 → 我的主页 → 点「编辑主页」→ 主页那张卡的下面就是「资质核验」白卡。
- **自动落到核验卡（合同 I-8）**：`requestMinePageEdit("vetting"); openBay({ kind: "mine", tab: "page" })`。现在接了两处：
  数据面板顶上「资质核验」按钮（W05 已按此调用）、交易会话里 `vetting.rejected` / `vetting.credential_expired` 那行灰字的按钮「查看资质核验」。进编辑后页面滚到那张卡（`scrollIntoView`，尊重「减少动态效果」），焦点落在卡上。
- 旧的无参调用 `requestMinePageEdit()` 仍然是「进编辑」。它有两类历史调用方：①还没公开主页的人点「去建资料」（needs 的 `ProposePane`/`HelpRequestPane`）——从顶上开始建，不滚；②（I-8 字面写法）已公开主页的卖家去核验——滚到核验卡。编辑器按主页是否已公开区分这两类（`wantsMinePageVetting`，一行可改）；明确要去核验的一律传 `"vetting"`。

出现条件（测试覆盖）：本人的主页 + 编辑状态 + 已登录 + LeoBay 开着（境内不出现，连 `/v1/talent/vetting/mine` 都不请求）。别人的主页、本人的查看状态、未登录、境内：都没有。

卡里的内容与接口沿用原 `BayVettingSection`（`/v1/talent/vetting/mine|submit|:id/appeal`，全部 `data-bay-*` 钩子不变）：提交核验（领域 / 凭证种类 / 编号 / 查验来源）、进度（含到期天数）、判定（含申诉）。排版：一张 `rounded-xl border bg-white` 白卡，标题「资质核验」+ 一段说明（提交可公开查验的编号和查验来源；不收证件照片和身份证号；只有你自己看得到），表单与结果左右并排、窄屏自动上下叠；提交 / 申诉之后重读不再把整张卡塌成「正在加载」（卡在页面最底下，塌掉会让滚动位置跳）。

「我的主页」白卡分隔（§5.3）：
- 查看状态：本人的主页坐在一张 `rounded-xl border` 的卡里，外框不铺白；别人的主页仍是他自己的主题版面，不套卡。
- 编辑状态：主题栏（原来贯穿整页的横条）改成一张卡 + 主页画布一张卡 + 资质核验一张白卡；滚动容器与外框都没有白底。

### 2. 交易会话系统消息改指（`DealLineTarget` 里不再有 `settings`）

| 事件 | 按钮文字（zh / en） | 落点 |
|---|---|---|
| `level.changed` | 查看我的主页 / View my page（原「查看卖家资料」） | `openBay({ kind: "mine", tab: "page" })` |
| `vetting.rejected`、`vetting.credential_expired` | 查看资质核验 / View credential review（沿用已有词条） | `requestMinePageEdit("vetting")` 再 `openBay({ kind: "mine", tab: "page" })` |

`DealLineActionKind` 里 `settings-profile`/`settings-vetting` 换成 `my-page`/`my-vetting`；`deal-actions.ts` 不再引用设置窗。其余动作（订单 / 需求 / 求助 / 项目群）不变。

### 3. 设置 → 账户 → 用 OceanLeo 账号登录的应用 / Apps using your OceanLeo sign-in

进入路径：设置 → 账户（首页）→ 「已连接的设备」之后、「删除账户」之前的新一行 → 点「管理」→ 子页 `connected-apps`，地址 `/settings/account/connected-apps`，标题是行名，左栏仍高亮「账户」，返回键回账户首页。境内 / 海外同一份代码，不按域名分叉。

子页（`MyAppLoginGrants`，为设置重排）：一行一个应用——应用名、主机、首次 / 最近登录时间、「撤回授权」。撤回要二次确认：点后原按钮让位给确认面板（说明「撤回后这个应用要再让你同意一次才能登录」，焦点落在更安全的「取消」上），确认才 `DELETE /v1/bay/app-login/mine/grants/:app_id`，成功后这一行直接消失（不重读整张表）；失败留在面板里说明、可再点。空态一句话：「还没有应用用你的 OceanLeo 账号登录过。你在某个应用里同意登录后，它会出现在这里，随时可以撤回。」读取失败给「重试」（不把服务端原文丢给用户）；401 说「登录后查看你授权过的应用」。境内没有 LeoBay：应用名只是文字，不放点了没反应的按钮（海外点名字去 LeoBay 的应用详情）。

## 二、文件清单

边界内改动：
- `src/shell/bay/page/mine-page-edit.ts`（重写：`requestMinePageEdit(focus?)`、`takeMinePageEditRequest`、`takeMinePageEdit`（旧，保留）、`subscribeMinePageEdit`、`wantsMinePageVetting`；60 秒过期；同时记 sessionStorage，整页跳转后还在）
- `src/shell/bay/page/ProfilePageEditor.tsx`（核验卡 + 自动滚 + 卡片版式，新增可选 prop `vettingFocus`）
- `src/shell/bay/page/ProfilePage.tsx`（退役种类名四句 + 两处注释）
- `src/shell/bay/supply/ProfilePane.tsx`（取走请求、已挂载时订阅、本人主页坐一张卡）
- `src/shell/bay/seller/BayVettingSection.tsx`（白卡 + 页面宽度排版 + 重读不塌；导出名与钩子不变，`seller/index.ts` 无需改）
- `src/shell/bay/deal/deal-lines.ts`、`deal-actions.ts`
- `src/shell/bay/applogin/MyAppLoginGrants.tsx`（为设置重排）
- `src/pages/settings/account/AccountHome.tsx`、`account-home-model.ts`（`onOpenConnectedApps`）、新 `ConnectedAppsPage.tsx`
- `src/pages/settings/settings-tabs.ts`（`ACCOUNT_SETTINGS_VIEWS` 加 `connected-apps`；嵌套子页集合同步，使 `accountSettingsView()` 能认出来）
- `src/lib/bay/app-login.ts`（只改注释里的「作品」→「应用」）
- `src/i18n/ui/messages/lbp-w06-copy.ts`（15 条新词 × 17 语）
- 未改动（在边界内但不需要）：`page/EditableText.tsx`、`lib/bay/vetting.ts`

父 agent 裁定给我的两处宿主（只为挂 `connected-apps`，各几行）：
- `src/pages/settings/sections/AccountSection.tsx`：新 prop `onOpenConnectedApps`；`view === "connected-apps"` 分支挂 `ConnectedAppsPage`；首页把 prop 交给 `AccountHome`。
- `src/pages/settings/SettingsHub.tsx`：`headingForAccountView` 加一项；`onOpenConnectedApps={() => goAccountView("connected-apps")}`。

测试：新 `tests/lbp-w06-verification-grants.test.mjs`；精确替换 `tests/bay-deal-lines.test.mjs`（vetting 目标、新增 level.changed 断言、17 语检查也认本波分表）、`tests/bay3-profile.test.mjs`（桩加 `useBayEnabled`；「逛官方素材」→「逛官方现成文件」两处）、`tests/bay-supply-profile.test.mjs`（桩加 `useBayEnabled`）。

## 三、§5.1 清扫：旧 → 新

| 位置 | 旧 | 新（en） |
|---|---|---|
| ProfilePage 空态 | 还没有上架的商品或服务。 | 还没有发布任何东西。（Nothing published yet.） |
| ProfilePage 未公开提示 | …发布商品或服务时也会自动公开。 | …发布东西时也会自动公开。 |
| ProfilePage 官方块 | 官方素材 / 逛官方素材 | 官方现成文件 / 逛官方现成文件（Official ready-made files / Browse official ready-made files） |
| deal-lines | 这条服务没有通过资质核验… / …相关服务已转回草稿。 | 这条人工服务… / …相关人工服务…（This human service… / …Related human services…） |
| deal-lines 按钮 | 查看卖家资料 | 查看我的主页（View my page） |
| MyAppLoginGrants | 撤回后这个作品… / 登录后查看你授权过的作品 / 你还没有用 OceanLeo 账号登录过任何作品 | …这个应用… / …授权过的应用 / 空态一句话说明（见上） |

判定为非种类、保留（指用户自己「我的库」里的作品，不是 LeoBay 种类）：「作品集」、「还没有作品。从「我的库」挑进来。」、「从我的库挑一件作品」。「服务器」类非种类词未动。测试里有一条扫描：边界内所有 `tt()` 字面量不得再出现「服务/素材/作品/成品文件」（上述三句与「人工服务」「服务器」「服务条款」除外）。

## 四、测试与结果原文

命令（在 `/root/projects/oceanleo-ui`）：
```
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs
```

新增 `tests/lbp-w06-verification-grants.test.mjs`：`# tests 30 / # pass 30 / # fail 0`（连跑 3 次稳定）。覆盖：请求一次性 / 入口参数 / 60 秒过期 / 整页跳转后 sessionStorage 取回 / 订阅；核验卡出现条件（别人、未进编辑、未登录、LeoBay 关各一例，且不发核验请求）；自动滚（vetting、无参已公开、无参未公开、页面已挂着再点、取消后手动进编辑不再滚、别人的主页不取走请求）；白卡版式（无整页白板）；核验提交 / 重读不塌；系统消息新目标与动作顺序；账户子页 id / 地址 / 首页一行 / `AccountSection` / 设置窗整条链路（点管理 → 地址 → 标题 → 返回）；子页列表 / 撤回二次确认 / 失败 / 空态 / 出错重试 / 401 / 境内无死按钮；边界内退役种类名扫描；17 语。变异检查：把核验卡出现条件改成恒真，只有「出现条件」一条变红，改回后全绿。

同批相关旧测试（全部绿）：`bay-deal-lines 8/8`、`bay-deal-view 10/10`、`bay-deal-open-thread 3/3`、`bay-deal-threads 6/6`、`bay3-profile 15/15`、`bay3-page 16/16`、`bay3-page-doc 18/18`、`bay-supply-profile 6/6`、`bay-app-login 7/7`、`bay-app-login-copy 1/1`、`bay-seller-panes 5/5`、`bay-seller-profile-reveal 2/2`、`bay-seller-lib 14/14`、`bay4-mine-me 3/3`、`bay-settings-section 8/8`、`bay-settings-hooks 4/4`、`account-home-layout 15/15`、`account-page 20/20`、`account-settings-routing 10/10`、`account-layout-copy 4/4`、`settings-hub 11/11`、`sign-in-methods-page 10/10`、`login-devices-page 4/4`、`tpp-w5-account-parity 3/3`、`settings-modal-dismiss 2/2`、`ccp-w12-settings-modal 2/2`、`eas-w07-settings-panes 12/12`、`settings-cost-billing-api 7/7`、`settings-identity-card 6/6`、`lbp-w03-kind-names 8/8`、`lbp-w04-mine 22/22`、`lbp-w05-settings-dashboard 32/32`、`lbp-w09-content-cases 23/23` 等（共 45 份引用我动过的模块的测试，逐份跑过）。

类型检查：共享 UI `pnpm typecheck`：TYPECHECK_RESULT_PLACEHOLDER
门户 `pnpm typecheck`：PORTAL_TYPECHECK_PLACEHOLDER
`pnpm architecture:check`：`domain boundaries ok (8203 import/export edges)`。

文案闸：`tests/i18n-tt-key-coverage.test.mjs` 第 1–7 条绿；第 8–10 条红，全部来自别的工程（别人新增的、尚未配译文的句子，以及 `PRE_EXISTING_GAPS` 基线随之变化），我的边界内 280 条 `tt()` 字面量（脚本逐条查）16 语全有译文，一条缺口也不在我的文件里。

不是我造成的红（开工前就红，或来自别人的在途改动）：
- `g1-wave-tap-targets`：ComputerDock 桩缺 `CONFIGURED_DOMAIN_FAMILY`（开工前基线就红）。
- `org-membership`：测试里 `../ui` 的桩没有 `Modal`；在我第一个提交的前一个提交上同样红（临时 worktree 复核，已清掉）。
- `hit-target-budget`：全仓命中区欠账 145 > 预算 98，名单里没有我的文件。
- `pnpm api:check` 提示快照过期：快照里没有我动过的任何导出名（grep 为 0），应由别的工程的导出变化造成；`src/architecture/public-api.snapshot.json` 归父 agent。

## 五、没做完的和原因

- 无遗留项。需要说明的取舍：无参 `requestMinePageEdit()` 的「已公开则滚到核验卡」是为了让 I-8 的字面写法也成立；如果父 agent 更想让无参调用永远只是「进编辑」，把 `wantsMinePageVetting` 里 `request.focus === null && published` 那半句删掉即可（W05 与我自己的调用都已显式传 `"vetting"`，不受影响）。

## 六、对别的 owner 的接口说明

- **W05**：`MyDashboardTab` 已调用 `requestMinePageEdit("vetting")`，与本文一致。`BayVettingSection` 不再需要出现在设置里（已确认 `BaySettingsSection` 不再引用）。`openBay({ kind: "settings", pane })` 的目标类型我没动、也不再产生。
- **W04**：`mine:page` 的主页（`ProfilePane`）自己画卡，外框请继续不铺白；`ProfilePane` 对外 props 与导出不变。
- **W03**：`DealSystemLine`/`DealMessageList` 只用 `DealLineTarget` 类型与 `runDealLineAction`，签名不变；`data-deal-action` 的值现在会是 `my-page`/`my-vetting`（原 `settings-profile`/`settings-vetting`）。
- **W08**：站内通知里 `vetting.*` / `level.changed` 的深链若要落到「我的主页的核验块」，用 `requestMinePageEdit("vetting"); openBay({ kind: "mine", tab: "page" })`。

## 七、对父 agent 的请求 / 观察

1. **门户路由（不在我的边界，没动）**：`/root/projects/oceanleo/app/settings/[tab]/page.tsx` 只匹配一段，所以直接打开或刷新 `/settings/account/<子页>` 会 404。我对开发槽实测：`/settings/account/connected-apps`、`login-devices`、`sign-in-methods`、`security` 全是 404，`/settings/billing` 200。站内点击（pushState）不受影响；这是已有的缺口，新子页只是同样受它影响。修法：加 `app/settings/[tab]/[view]/page.tsx`，内容同 `[tab]/page.tsx`（返回 null）。
2. 开发槽 HTTP 冒烟（只看状态码）：`/`、`/bay`、`/bay?bay=mine:page`、`/settings/account` 均 200，没有渲染出错。
3. 没有碰 `bay-state.ts`、`shell/index.ts`、`shell-overhaul-copy.ts`、`messages/index.ts`、公开 API 快照。

## 八、复现

```
cd /root/projects/oceanleo-ui
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/lbp-w06-verification-grants.test.mjs
git show --stat 22b55c94 ecae1de1 ec171878 1a606c7c
```
