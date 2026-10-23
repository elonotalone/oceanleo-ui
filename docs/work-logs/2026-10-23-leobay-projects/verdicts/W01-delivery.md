# W01 交卷 · 下拉共用件改成参考图样式 + 表单下拉 MenuSelect + 库/工作台调用方

交付人：W01（重派，Sonnet 5.5）。2026-10-23。本卷里所有"实测"都是在共享 UI 仓 `/root/projects/oceanleo-ui` 的 `main` 上跑出来的原文，不是自述。

提交（只含边界内路径）：

| 提交 | 内容 |
|---|---|
| `4880411a` | 共用件改外观 + MenuSelect 正式实现 + 调用方传参 + 分表 + 测试 23 条 |
| `d369fc9b` | 菜单开在弹窗里：Esc 只关菜单、MenuSelect 清单拦鼠标事件、真 Modal 集成测试（共 26 条） |
| `be19ce2c` | 清单容器去掉没补环的 `outline-none`（焦点环预算锁），加守卫断言（共 27 条） |
| 本卷的提交 | 交卷文件 + 日志 |

## 1. 用户现在看到的（旧 → 新）

**筛选下拉的按键**（库「类型」、工作台「分区」、应用市场「场景/站点」、应用目录、LeoBay 各处共用）

| | 旧 | 新 |
|---|---|---|
| 形状 | `h-8`（32px）、`rounded-full` 全圆胶囊 | `h-9`（36px，与页头搜索框 `SEARCH_INPUT_CLASS` 同高）、`rounded-xl` 圆角矩形 |
| 边框 | **所有状态都是黑边** `border-neutral-900` | 没筛：浅灰 `border-neutral-200`（悬停/打开 `neutral-400`）；选了具体值：深色 `border-neutral-900` |
| 字 | 13px 常规，选中才 `font-medium` | 13px **粗体** `font-semibold`，白底 |
| 内容 | 两截：灰字「名称」+「当前值」，再加箭头（如「类型 全部」） | **只写当前值**（「全部类型 ⌄」「图片 ⌄」）；`label` 改作按键的 `aria-label`，并用 `aria-describedby` 把读屏接到那截可见的当前值上 |
| 选项单 | `rounded-md` 行、`stone` 色、选中项只加粗 | 同一条 `neutral-200` 浅灰边的白底圆角单；行 `rounded-lg`；高亮浅灰底；**选中项前有一个勾**（没选的行留同宽空位，文字对得齐）；件数/禁用说明/搜索框/键盘行为都在 |
| 层级 | `z-50`（躲在项目页弹窗后面） | 行内 `zIndex: 2147483500`，盖得住共享 Modal 的 `z-[1000]` |
| 键盘焦点 | 无 | `focus-visible:ring-2 ring-inset`（画在里面，不会被横滑筛选行 `overflow-x-auto` 剪掉） |

两份（`CollectionFilterSelect` 与 `BayFilterSelect`）**外观一模一样**：class 与取值逻辑都来自 `collection-chrome.tsx` 的同一批导出，Bay 那份不再自带一套（测试 6、25 钉住）。`BayFilterSelect` 保留了选项的 `disabled / hint`、`data-view`。

**表单下拉 `MenuSelect`**：整条选择条（宽度随容器、`h-10`/`sm` 为 `h-8`、`rounded-xl`、浅灰边、白底、左侧当前值、右侧下箭头），点开是与筛选菜单同一种白底圆角清单（portal 到 body，贴着选择条放、下面不够放上面）。

**调用方**：所有「全部」自带名词，没有一个按键上只剩「全部」；工作台「分区」的值不再是小写 `app / agent / prompt`。

## 2. 接口

### 2.1 `defaultValue`（`CollectionFilterSelect`、`BayFilterSelect` 都加了，可选）

值等于它时视作「未筛选」：按键写那一项的 label、边框不加深。不传时以 `""` 为未筛选（旧调用方行为不变）。

```tsx
// 用 "all" 当全部：选项里自带「全部任务」，传 defaultValue="all"
<CollectionFilterSelect
  label={tt("类型")} name="kind"
  value={kind}                     // "all" | "task" | "chat"
  defaultValue="all"               // "all" 不加深边框；选 "task" 才加深
  options={[{ value: "all", label: tt("全部任务") }, { value: "task", label: tt("任务") }, { value: "chat", label: tt("会话") }]}
  onChange={setKind}
/>

// 用 allLabel 注入「全部」那一行：那一行的值就是 defaultValue（不传则 ""）
<CollectionFilterSelect label={tt("类型")} name="type" value={type === "all" ? "" : type}
  allLabel={tt("全部类型")} options={...} onChange={(v) => setType(v || "all")} />

// 视图切换（不是筛选）也可以传 defaultValue={当前值}：永远不加深（W04 的「我的」列表下拉就是这么用的）
```

规则：`allLabel` **必须自带名词**（全部类型 / 全部站点 / 全部场景 …）。没给 `allLabel`、值也不在选项里时，按键退回写 `label`，不会留空键。

### 2.2 `MenuSelect`（props 一字未改，I-1）

```tsx
import { MenuSelect } from "@oceanleo/ui/shell";

<MenuSelect
  name="todo-status"                 // 写到 data-menu-select（隐藏原生 select）/ -trigger / -menu，测试用
  ariaLabel={tt("状态")}              // 必填，读屏名
  value={status}
  options={[
    { value: "todo", label: tt("待办") },
    { value: "doing", label: tt("进行中"), description: tt("正在做") },   // description 画在名字下面
    { value: "done", label: tt("已完成"), disabled: false },
  ]}
  onChange={setStatus}
  placeholder={tt("未分配")}          // 值不在选项里时显示（灰字）
  size="sm"                          // 可选，h-8
  className="w-40 shrink-0"          // 加在最外层容器；自带 w-/flex-/shrink 等宽度类就不再默认 w-full
  disabled={false}
/>
```

行为：↑↓ 打开；清单里 ↑↓ Home End 移动（跳过禁用项）、Enter / 空格选中、直接打字跳到以该字开头的项、**Esc 只关清单**（不连带关外层弹窗）、Tab 关清单并把焦点还给选择条、点到外面关、外部滚动/缩放关。底下是一个视觉隐藏的原生 `<select>`（`aria-hidden`、`tabIndex=-1`、`data-menu-select={name}`），和可见的这条永远同步：在它上面 `change` 会走同一个 `onChange`，值来自同一个 `props.value`。清单的 click/mousedown 到清单为止（portal 的 React 事件会冒泡给外层行/遮罩，选一项不该同时点中外层）。

## 3. 改过的文件

| 文件 | 改了什么 |
|---|---|
| `src/shell/collection-chrome.tsx` | 新增并导出共用件：`COLLECTION_FILTER_TRIGGER_CLASS`、`collectionFilterTriggerClass`、`COLLECTION_FILTER_MENU_CLASS`、`collectionFilterOptionClass`、`CollectionFilterCheck`、`CollectionFilterTriggerFace`、`collectionFilterState`（按键写什么 / 要不要加深，纯函数）、`collectionMenuPlace`（原 `menuPlace`，加 `minWidth` 参数与 zIndex）；`CollectionFilterSelect` 改外观、加 `defaultValue`、菜单加勾、Esc 在捕获阶段拦。不 import 任何 bay 模块 |
| `src/shell/bay/shell/BayFilterSelect.tsx` | 引用上面的共用件，删掉自带的触发键 / 菜单 / `menuPlace`；加 `defaultValue`；Esc 同上 |
| `src/shell/menu-select.tsx` | 占位换成正式实现，props 不变 |
| `src/shell/ArtifactLibrary.tsx`、`MyLibrary.tsx`、`WorkspaceLibrary.tsx` | `allLabel` → `tt("全部类型")` |
| `src/shell/Playground.tsx` | 分区值改 `tt("网站") / tt("应用") / tt("agent") / tt("提示词")`，`defaultValue={renderSites ? "site" : "app"}`；prompt 区「类型」`allLabel` → `全部类型` |
| `src/shell/WorkspaceMasterDetail.tsx` | 分区值同上（网站 / 应用 / agent），`defaultValue="app"` |
| `src/shell/AppDirectory.tsx` | 默认「全部」改成名词：场景 `全部场景`、板块 `全部板块`、类型 `全部类型`；类型下拉在场景模式下读屏名是「场景」；分类方式下拉 `defaultValue` = 默认方式（停在默认方式不加深） |
| `src/shell/AppMarket.tsx` | 场景 → `全部场景`、站点 → `全部站点` |
| `src/i18n/ui/messages/lbp-w01-copy.ts` | 8 条新词 × 16 语：全部场景 / 板块 / 全部板块 / agent / 排序方式 / 切换排序方向 / 默认顺序 / 正在加载完整列表以排序… |
| `tests/lbp-w01-filter-select.test.mjs` | 新增 27 条 |

`SiteSkillDirectory.tsx`、`OperatorConsole.tsx` **没改**：它们只经 `AppDirectory`，不传 `sceneAllLabel / groupAllLabel`，直接吃上面的新默认值（测试 21 钉住）。

顺手补的：`collection-chrome.tsx` 的「排序方式 / 切换排序方向 / 默认顺序 / 正在加载完整列表以排序…」和 `AppDirectory.tsx` 的「板块」原来在 17 语里都没有译文（文案闸 #8 的红里有这 5 条），属于我的文件，这轮一起补了。

## 4. 调用方逐个核对（V01 清单第 1 条用）

`grep -rn "<CollectionFilterSelect\|<BayFilterSelect" src`，当前 HEAD + 工作树：

| 文件:行 | 组件 | name | label | allLabel | defaultValue | 归属 |
|---|---|---|---|---|---|---|
| AppDirectory.tsx:370 | Collection | taxonomy | 分类 | —（值是方式名） | 默认方式 | **W01 改** |
| AppDirectory.tsx:382 | Collection | group | 板块 | 全部板块 | — | **W01 改** |
| AppDirectory.tsx:399 | Collection | category | 场景 / 类型 | 全部场景 / 全部类型 | — | **W01 改** |
| AppMarket.tsx:262 | Collection | scene | 场景 | 全部场景 | — | **W01 改** |
| AppMarket.tsx:276 | Collection | site | 站点 | 全部站点 | — | **W01 改** |
| ArtifactLibrary.tsx:676 | Collection | type | 类型 | 全部类型 | — | **W01 改** |
| MyLibrary.tsx:1970 | Collection | type | 类型 | 全部类型 | — | **W01 改** |
| WorkspaceLibrary.tsx:1030 | Collection | type | 类型 | 全部类型 | — | **W01 改** |
| Playground.tsx:459 | Collection | section | 分区 | —（值是分区名词） | site / app | **W01 改** |
| Playground.tsx:824 | Collection | category | 类型 | 全部类型 | — | **W01 改** |
| WorkspaceMasterDetail.tsx:466 | Collection | section | 分区 | —（值是分区名词） | app | **W01 改** |
| bay/asset/BayAssetLibrary.tsx:734/742 | Bay | type / view | 文件类型 / 来源 | —（选项自带） | — | W02（只读核对） |
| bay/asset/BayAssetLibrary.tsx:751/762 | Bay | cat / industry | 目录 / 行业 | 全部目录 / 全部行业 | — | W02 |
| bay/asset/BayAssetLibrary.tsx:772 | Bay | series | 成套 | **全部（含单件）** | — | W02（见 §7 提醒） |
| bay/asset/BayAssetSellers.tsx:31 | Bay | seller-site | 站点 | 全部站点 | — | W02 |
| bay/panel/PanelBrowse.tsx:89 | Bay | category | 站点 | 全部站点 | — | W02 |
| bay/shell/BayList.tsx:207/220 | Bay | intent / kind | 出售还是求购 / 种类 | —（选项自带） | — | W02 |
| bay/shell/BayList.tsx:271 | Bay | category | 站点 | 全部站点 | — | W02 |
| bay/shell/BayMine.tsx:143 | Bay | mine-list | 列表 | — | `list`（视图切换，永不加深） | W04 |
| bay/shell/BayMine.tsx:153 | Bay | mine-category | 类别 | 全部类别 | — | W04 |
| 门户 app/projects/page.tsx、ProjectTasksTab、ProjectPlanTab、ProjectAssetsTab | Collection | kind / ownership / task-kind / task-source / task-status … | — | 选项自带「全部项目 / 全部类型 / 全部任务 / 全部来源 / 全部状态 / 全部负责人」 | `"all"` | W11（只读核对） |

测试 20（全仓扫描，**不只是我的边界**）断言：`src` 里没有 `allLabel={tt("全部")}` / `allLabel="全部"` / `allLabel={tt("All")}` 这几种写法。

工作台分区的值（zh → en）：网站→Website、应用→Apps、agent→Agents（新词条）、提示词→Prompt。**英文没做到"全部复数"**：这套词典的 key 就是中文原文，「网站」「提示词」是已有词条（英文单数，别处在用，且 `i18n-key-collision` 不许改基础词典里同一中文键的英文），要复数就得另起一个中文 key，不值得；真要，是后续一条小活。

## 5. 测试与检查原文

### 5.1 新测试

```
$ node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/lbp-w01-filter-select.test.mjs
ok 1 - CollectionFilterSelect：按键上只有当前值，label 改作 aria-label，不再画两截
ok 2 - CollectionFilterSelect：白底浅灰细边圆角矩形粗体，高度字号对齐页头搜索框，不是黑描边胶囊
ok 3 - CollectionFilterSelect：选了具体值边框加深，没选 / 选「全部」保持浅灰
ok 4 - defaultValue：值等于它时视作未筛选；不传以 "" 为未筛选
ok 5 - 没有 allLabel、值也不在选项里时，按键退回写 label，不留空键
ok 6 - BayFilterSelect 与 CollectionFilterSelect：同一状态下按键 class 与内容一字不差
ok 7 - CollectionFilterSelect 菜单：读屏名是 label、选中项前有勾、zIndex 高过弹窗、选「全部」发出 defaultValue
ok 8 - CollectionFilterSelect 键盘：↓ 打开、↓ 移动、Enter 选中、Esc 关并还焦点
ok 9 - BayFilterSelect 菜单：选中项前有勾、点不动的项不能选且键盘跳过、hint 作 title
ok 10 - 筛选菜单开在弹窗里：Esc 只关菜单，不会连带关掉外层弹窗（Modal 在 document 上听 Esc）
ok 11 - MenuSelect 外观：整条选择条 h-10 圆角 xl 浅灰边白底，左边当前值右边箭头
ok 12 - MenuSelect 的隐藏原生 select：aria-hidden、不进 Tab 顺序、选项与值同步
ok 13 - MenuSelect：值不在选项里显示 placeholder，原生 select 仍能装下这个值
ok 14 - MenuSelect 清单：与筛选菜单同一种白底圆角单、选中项前有勾、描述、读屏名、盖过弹窗
ok 15 - MenuSelect 键盘：↓ 打开并对准当前项，↑ ↓ Home End 移动，Enter / 空格选中，Tab 关并还焦点
ok 16 - MenuSelect：Esc 只关清单、不会连带关掉外层弹窗；点到外面也关
ok 17 - MenuSelect：清单的鼠标事件到清单为止，选一个选项不会同时点中外层的行 / 遮罩
ok 18 - MenuSelect：禁用项键盘跳过、点不动；打字跳到以该字开头的项；整条 disabled 时点不开
ok 19 - 放进真 Modal（项目页的弹窗）：菜单盖得住、能键盘选、Esc 只关菜单、Tab 把焦点还给选择条
ok 20 - 全仓没有光秃秃的「全部」当 allLabel（按键上只剩「全部」）
ok 21 - W01 边界内的调用方：allLabel 都自带名词，AppDirectory 的默认值也是名词
ok 22 - 工作台分区的值是翻译过的名词，不再是未翻译的小写 app / agent / prompt
ok 23 - AppDirectory 渲染：场景 / 板块 / 类型下拉的按键都不是光秃秃的「全部」
ok 24 - AppMarket 渲染：场景、站点下拉的按键写「全部场景」「全部站点」
ok 25 - 共用件：collection-chrome 不 import bay 模块；Bay 那份引用同一份 class 与取值逻辑，不再自带一套
ok 26 - 焦点环预算：按键抑制了轮廓就带 focus-visible 环；清单容器不抑制轮廓（tests/focus-ring-budget 不许新增没补环的 outline-none）
ok 27 - W01 分表的新词条 17 语齐全、不把汉字抄进非中日韩语种、占位符不丢
# tests 27
# pass 27
# fail 0
```

防空断言：把下面这些改动逐个临时做进源码再跑这份测试，都有对应用例变红（改完已恢复）——撤掉 Esc 拦截 / 撤掉选中项的勾 / `filtered` 不看 `defaultValue` / 按键改 `rounded-full` / Bay 按键与共用件不一致 / `AppMarket` 退回 `tt("全部")` / 撤掉 `aria-label` / 清单不拦点击 / Tab 不还焦点。

### 5.2 与这些源文件相关的既有测试

```
collection-chrome 9/9  library-collection-chrome 1/1  bay-toolbar 6/6  bay-menu-select 2/2  workspace-desk-piles 5/5
workspace-page-header 7/7  app-market 9/9  app-directory-workspace-card 10/10  bay-asset-browse 15/15  bay-apps-editor 10/10
bay-lessons-editor 10/10  bay3-page 16/16  bay4-browse 9/9  bay5-panel 9/9  library-document-open 3/3
library-shared-split-runtime 6/6  library-stability 22/22  library-page-header 4/4  collection-items 7/7
```

所有源码里提到我这批文件的测试共 87 份（`grep -l "ArtifactLibrary|MyLibrary|…|MenuSelect|BayFilterSelect|CollectionFilterSelect" tests/*.test.mjs`）逐份跑过：**没有一份是被我的改动打红的**。有红的 25 份，逐份跑了"改动前"的对照（`git archive 4880411a~1` 解到 `/tmp/w01-base`，同一条命令）：失败的子测试名完全一致——

`app-page-header`（`index.ts has 802 lines`）、`artifact-surface-rendered` 3 条（My Library 的 `data-entry-category` 是 `image_editing` 不是 `收藏素材`）、`deck-delivery-family`、`client-ui-library-local-build`、`explore-page-header`、`explore-sections`、`explore-plain-shelf`、`explore-scene-axis`、`material-library-scope`、`deck-html-action` 3 条、`cross-site-library`、`e2-result-canvas-stability`、`sidebar-v5-contract`、`g3-portal-typed-editor`、`workbench-toolbar-rendered`、`sidebar-scroll-scope`、`plugin-module-hosting`、`typed-artifact-contract` #13 #16、`W3-r3-library-receiver-collab-triggers`（module-bench 循环依赖，整份不执行）、`workspace-fill-deeplink`、`workspace-template-deeplink`、`one-task-library-agent-acceptance`（#4 #8，等待超时型，改动前同样 2 红，负载高时会抖到更多）、`effect-tt-dependency` / `hit-target-budget`（改动前也红，另见下）。

其中 **`focus-ring-budget` #2 一度有一处是我造成的**：清单容器 `COLLECTION_FILTER_MENU_CLASS` 带 `outline-none` 却没补环，名单里出现 `collection-chrome.tsx：新文件冒出 2 处`。已在 `be19ce2c` 去掉（回到改动前的写法），现在该测试的违规名单里没有我的文件（它自己仍红，剩下的全是别人的文件，改动前同样红）。

`hit-target-budget`：总数改动前后都是「实测 145 处，预算 98 处」（别人早已超了）；每文件登记上：`menu-select.tsx` 新增 2 处（规定的 `h-10` / `sm` 的 `h-8` 小于 44px）、`collection-chrome.tsx` 3→2、`BayFilterSelect.tsx` 1→0。需要的话父 agent 在重排这条预算时把 `menu-select.tsx` 记进去。

### 5.3 typecheck

```
$ bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck
$ tsc --noEmit
exit: 0
```
（零错误。开工时记录的 `video-project-doc.ts` 那 3 条基线错误已被 editor-overhaul 修掉，不是我改的。）

### 5.4 文案闸 `tests/i18n-tt-key-coverage.test.mjs`

闸在改动前就是 3 红（#8 新文案缺口、#9 已译未摘、#10 死登记 184>3，都是别的工程）。我的差分：

- #8 里**我的文件**的缺口：改动前 5 条（`排序方式`、`切换排序方向`、`正在加载完整列表以排序…`、`默认顺序` 在 `collection-chrome.tsx`；`板块` 在 `AppDirectory.tsx`）→ 现在 **0 条**（全补进 `lbp-w01-copy.ts`）。我新用的 `全部类型`（已有）、`全部场景`/`全部板块`（我的分表）、`全部站点`（W02 的分表）、`应用`/`网站`/`提示词`（已有）都 17 语齐。
- #9 现在的名单：`全部站点`、`撤销失败`、`状态`、`解锁`——都是"已有 16 语译文却还挂在 `PRE_EXISTING_GAPS` 里"。其中 `全部站点` 是 W02 补的译文 + 我和 W02 都在用它；请父 agent 统一从基线表里摘（见 §6）。

### 5.5 产物闸 `tests/theme-artifact-in-sync.test.mjs`

改动前就红（少 22 多 6，editor-overhaul 的 awb 类）。我这批改动**不新增缺失规则、不新增死规则**：我用到的每个类名都在 HEAD 的 `ui.css` 里（`/tmp/w01-tools/classcheck.mjs` 对 50 多个类逐个核过，MISSING: (none)），我撤掉的旧类（`max-w-[10rem]`、`stone` 系等）别处还在用，没变成死规则。需要新类的地方我都绕开了（用 `focus-visible:ring-inset` 而不是新边框类；`text-start` 不在产物里就保留 `text-left`）。

## 6. 给父 agent 的请求

1. **`tests/i18n-tt-key-coverage.test.mjs` 的 `PRE_EXISTING_GAPS` 摘条目**：`全部站点`（W02 的分表补了译文，AppMarket、BayList、PanelBrowse 等都在用）、`解锁`、`状态`、`撤销失败`。我不能改这份测试，摘完 #9 才会绿。
2. **`src/architecture/public-api.snapshot.json`** 里还没有 `MenuSelect` / `MenuSelectOption` / `MenuSelectProps`（`src/shell/index.ts` 已经导出它们）；`CollectionFilterSelect` 的 props 多了可选的 `defaultValue`（快照若记 props 形状也要更新）。两处都在"不许改"名单里。
3. **`tests/hit-target-budget.test.mjs` 每文件登记**：`menu-select.tsx` 新增 2 处（规格要求 `h-10` / `h-8`）。
4. 若 W10 的弹窗改用别的容器（原生 `<dialog>` 的顶层、或带 `focusin` 回抢的 focus trap），portal 到 body 的下拉菜单会被盖住/抢焦点——当前共享 `Modal` 的 trap 只在按 Tab 时才管（`trapTabWithin`），已用真 Modal 做了集成测试（测试 19），不是问题；换容器时再测一遍。

## 7. 没做完 / 取舍 / 别人的文件里我看到的

- **英文复数**：见 §4，沿用已有词条，"Website / Apps / Agents / Prompt"。
- **`bay/asset/BayAssetLibrary.tsx:772` 的 `全部（含单件）`**（W02）：它是"成套"下拉的「全部」项，带了括号说明但没有独立名词，V01 第 1 条可能按"光秃秃的全部"判；我没碰（不在边界）。
- 「查看选项」菜单里的排序仍是原生 `<select>`（`data-collection-sort`）：本任务书没要求、也不是表单，没换。
- `WorkspaceMasterDetail.tsx` 空态按钮 `tt("全部")`（切回"全部"堆）是按钮不是下拉，没动。
- 没有开浏览器、没有截图（未批准）。外观只用 class 与 DOM 断言验证，**没有肉眼看过**；真机上建议看一眼：筛选行里 `h-9` 的按键与旁边 `h-9` 的搜索框是否对齐、`max-w-xs` 截断、选了具体值的深色边。

## 8. 给其他 owner 的接口说明

- **W02 / W04（LeoBay 调用方）**：`BayFilterSelect` props 只多一个可选 `defaultValue`；`label` 不再画在按键上（只作读屏名），所以 `allLabel`/选项 label 要自己带名词。`allLabel` 那一行的值是 `defaultValue ?? ""`。视图切换类下拉可传 `defaultValue={当前值}` 让边框永不加深（W04 已这么用）。
- **W10 / W11（项目页）**：`MenuSelect` / `CollectionFilterSelect` 菜单 `zIndex` 2147483500，放在共享 `Modal`（遮罩 `z-[1000]`）里盖得住；Esc 只关菜单。`MenuSelect` 的 `className` 加在最外层容器（`w-32 shrink-0`、`mt-1.5` 这种），选择条自己总是铺满它。用 `"all"` 当全部的筛选传 `defaultValue="all"`，选项里自带「全部××」。读 W11 当前代码的用法（`ShareProjectModal`、`ProjectAutomationDialog`、`ProjectTasksTab`、`app/projects/page.tsx`）与实现兼容。
