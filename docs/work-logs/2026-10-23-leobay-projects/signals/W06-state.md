# W06 state

更新：2026-10-23（开工，读完任务书 / 共同须知 / 合同；bootstrap 已跑，cheap core OK）

## 已确认的事实
- 仓 /root/projects/oceanleo-ui，main。边界内路径开工时 `git status` 为空（干净）。
- 现有 `requestMinePageEdit()` 无参调用方：`needs/HelpRequestPane.tsx`、`needs/ProposePane.tsx`（"去建资料"，页面尚未公开）、`settings/BaySettingsProfileDoor.tsx`（W05 要删）。W05 的 `MyDashboardTab` 会按 I-8 无参调用去核验。无参调用有两种含义 -> 我用"可选 focus 参数 + 无参时按主页是否已公开自动判断"区分（见下）。
- `ProfileDetailView`（ProfilePane.tsx）里 `useState(() => own && takeMinePageEdit())` 是唯一消费点；模块级开关，页面已挂载时再次请求会遗留（陈旧）。
- 账户子页的宿主在 `pages/settings/sections/AccountSection.tsx` 与 `pages/settings/SettingsHub.tsx`，都在我的边界之外（没有任何其他任务书认领它们）。`SettingsHub.headingForAccountView` 与 `goAccountView`、`AccountSection` 的 `view` 分发都要加 `connected-apps`。边界内能做的：settings-tabs.ts 的 id、`account/ConnectedAppsPage.tsx`、`AccountHome` 的一行。宿主那两处小改动按"边界外一行不许改"写进交卷的"对父 agent 的请求"，附逐行补丁。
- `DealLineTarget` 的 `settings` 目标只被 deal-actions.ts（我的）消费；`DealSystemLine.tsx` / `DealMessageList.tsx` 只引用类型。
- 文案闸：`tests/i18n-tt-key-coverage.test.mjs` 扫全 `src/` 的 `tt("中文")`，新键 16 语必须齐；新增文案写 `lbp-w06-copy.ts`，已有词条不重定义。

## 正在做
第 0 步：基线测试（哪些相关测试开工前就红）。

## 下一步
1. 词条查重脚本（/tmp/w06-tools，不进仓）-> 列出要新增的中文原文
2. mine-page-edit.ts 扩展（focus 参数 + 订阅 + 过期）
3. BayVettingSection 改成页面宽度白卡 + ProfilePageEditor 挂核验块 + ProfilePane 接线 + 白卡分隔
4. deal-lines/deal-actions 改指（my-page / my-vetting 目标）
5. MyAppLoginGrants 退役名清扫 + ConnectedAppsPage + AccountHome 行 + settings-tabs id
6. lbp-w06-copy.ts 17 语
7. 测试：改绿 + 新增 tests/lbp-w06-verification-grants.test.mjs
8. 交卷 verdicts/W06-delivery.md

## 复现命令
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs
