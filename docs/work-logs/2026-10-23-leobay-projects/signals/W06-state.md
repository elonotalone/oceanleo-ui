# W06 state

更新：2026-10-23 20:50（重派后重新开工；上一轮只留下 state/journal，没有任何代码改动入库）

## 已确认的事实
- 仓 /root/projects/oceanleo-ui，main。边界内路径 `git status` 干净；基线测试全绿（除 `g1-wave-tap-targets.test.mjs`：ComputerDock 桩缺 `CONFIGURED_DOMAIN_FAMILY`，与本任务无关，开工前就红）。
- 父裁定：`pages/settings/sections/AccountSection.tsx`、`pages/settings/SettingsHub.tsx` 为挂 `connected-apps` 子页的最小改动归我（只为这一件事）。
- 现有 `requestMinePageEdit()` 无参调用方：`needs/HelpRequestPane.tsx`、`needs/ProposePane.tsx`（"去建资料"，主页未公开）、`settings/BaySettingsProfileDoor.tsx`（W05 删）。W05 的 `MyDashboardTab` 按 I-8 无参调用去核验（主页已公开）。
  决定：`requestMinePageEdit(focus?: "vetting")`；显式 "vetting" 一定滚到核验块；无参时按「主页是否已公开」判断（已公开 = 去核验，未公开 = 去建资料，不滚）。
- 模块级开关会遗留：加订阅（页面已挂载时再次请求立即生效）+ 60 秒过期 + sessionStorage（整页跳转后还在）。
- `ProfileDetailView` 的 `own && takeMinePageEdit()` 是唯一消费点（useState 初始化）。
- 编辑器宿主：`ProfilePageEditor` 内 `[data-bay-page-canvas]` 滚动容器；核验块放在画布卡之后，独立白卡，不套主页主题色。
- `BayVettingSection` 被 `seller/index.ts`、`settings/BaySettingsSection.tsx`（W05 要删）、两份测试引用：保留导出名与全部 `data-bay-*` 钩子；不在里面引 bay-state（测试桩没有）。
- 编辑器/ProfilePane 要用 `useBayEnabled`，`bay3-profile` 与 `bay-supply-profile` 测试的 bay-state 桩没有它 -> 精确补桩。
- 退役种类名在我边界内的用户可见句子：ProfilePage（还没有上架的商品或服务。/ 发布商品或服务时… / 官方素材 / 逛官方素材）、deal-lines（这条服务… / 相关服务…）、MyAppLoginGrants（作品 x3）。「作品集」「还没有作品。从「我的库」挑进来。」「从我的库挑一件作品」指用户库里的作品，保留（交卷写明）。
- 文案闸：新键 16 语必须齐；新增写 `lbp-w06-copy.ts`；已有词条不重定义（查重脚本 /tmp/w06-tools/has-key.mjs）。

## 正在做
第 1 步：mine-page-edit.ts 扩展 + BayVettingSection 白卡 + ProfilePageEditor/ProfilePane 接线。

## 下一步
1. mine-page-edit.ts（focus / 订阅 / 过期 / sessionStorage）
2. BayVettingSection 白卡；ProfilePageEditor 挂核验块（自动滚）；ProfilePane 接线 + 白卡分隔；ProfilePage 退役名
3. deal-lines / deal-actions 改指（my-page / my-vetting；DealLineTarget 无 settings）
4. MyAppLoginGrants 重排 + ConnectedAppsPage + AccountHome 行 + settings-tabs id + AccountSection/SettingsHub 挂载
5. lbp-w06-copy.ts 17 语
6. 测试：改绿 + 新增 tests/lbp-w06-verification-grants.test.mjs；typecheck；文案闸
7. 交卷 verdicts/W06-delivery.md

## 复现命令
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs
批量：/tmp/w06-tools/run-tests.sh a.test.mjs b.test.mjs（脚本不进仓；丢了就按上面命令循环）
