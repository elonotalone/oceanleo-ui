# W01 journal（每得到一条实测结论追加一行）

- 18:45 实测：边界内 ArtifactLibrary.tsx / Playground.tsx / WorkspaceLibrary.tsx 带别人下午（16:0x）未提交的 collection-items 改版，另有未跟踪 src/shell/collection-items.tsx；提交这三个文件必须只取我自己的 hunk（临时索引法）。【20:50 更正：该改版已由父 agent 以 a08f3083 入库，工作树现已干净，此法作废】
- 18:50 实测：词典里 `全部类型` 已有（en All types）；`全部类别` / `全部站点` 没有；`应用`=Apps、`网站`=Website、`提示词`=Prompt；拉丁原文 `agent` 无词条。
- 18:55 实测：既有测试钉住 data-collection-filter / data-bay-filter(-menu) / data-value / role=option，改外观时这些属性原样保留。
- 20:50 实测（重派）：上一轮没有落任何代码；边界工作树干净；相关既有测试 12 份基线全绿，typed-artifact-contract #13 #16 与 W3-r3-library-receiver-collab-triggers 基线已红（非我造成）。
- 20:52 实测：文案闸基线 3 条红；我边界内有 5 条缺译文的 tt（排序方式 / 切换排序方向 / 正在加载完整列表以排序… / 默认顺序 / 板块），这一轮补进分表。
- 20:55 实测：产物闸基线红（少 22 多 6）；只用产物里已有的类，判据 = 不新增差额。过焦点环用 focus-visible:ring-inset（产物里有），避开 overflow-x-auto 行把外环剪掉。
- 21:25 实测：collection-chrome / BayFilterSelect / menu-select / 8 个调用方 / 分表已落；tests/lbp-w01-filter-select.test.mjs 23 条全绿；相关既有 16 份测试全绿。app-page-header（index.ts 802 行超限）与 explore-page-header（module-bench 循环依赖）基线已红，与我无关。
- 21:26 结论：「全部站点」由 W02 的分表定义（我只用不定义）；文案闸里它在 PRE_EXISTING_GAPS，补译后闸 #9 要求从基线摘掉——写进交卷给父 agent 的请求。
- 21:27 结论：工作台分区英文只能沿用已有词条（Website / Apps / Prompt）加新词条 agent→Agents：中文原文即 key，「网站」「提示词」在别处是单数，改不了；要全复数得另起中文 key。
- 21:40 实测：W11 已在门户里用我的 MenuSelect（ShareProjectModal 的 className="w-32 shrink-0"、自动化弹窗 className="mt-1.5"）和 CollectionFilterSelect（defaultValue="all"）；门户的 Modal 就是共享 src/ui/index.tsx：遮罩 z-[1000]、document 上听 Esc、Tab 圈在面板里。
- 21:42 结论：菜单 zIndex 写行内 2147483500 才盖得住弹窗；Esc 必须在 window 捕获阶段拦（Modal 在 document 冒泡阶段听），否则筛选菜单/选择条一按 Esc 连弹窗一起关——已改三处（MenuSelect、CollectionFilterSelect、BayFilterSelect）。MenuSelect 清单的 click/mousedown 到清单为止（portal 的 React 事件会冒泡给外层行/遮罩）。
- 21:48 实测：把真 Modal 编进 module-bench 做了集成测试（弹窗里选择条与筛选下拉：盖得住、键盘选、Esc 只关菜单、Tab 还焦点；无菜单时 Esc 关弹窗），lbp-w01 测试 26 条全绿；6 个变异（撤 Esc 拦截 / 撤勾 / 撤 defaultValue / rounded-full / Tab 不还焦点 / 清单不拦点击）都被测试抓住。
- 21:50 实测：artifact-surface-rendered 3 条红（My Library 类型标签 image_editing 等）在改动前的 /tmp 基线检出里同样 3 条红，非我造成。
