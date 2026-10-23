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
