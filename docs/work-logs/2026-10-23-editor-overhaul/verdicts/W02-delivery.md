# W02 交付：左侧面板（素材库 / 我的库）在各承载可见可用 + 编辑栏空态抽屉按钮 + 插入 / 切换

写于 2026-10-23 09:55Z（R2 接班，第 2 轮）。第 1 轮的成果没重做，这一轮只补剩下的部分。

## 1. 用户看得到的变化

**素材库 / 我的库（D2）**
- 原因（操作员截图里点了没反应）：`/library?item=` 和素材目录都走 `MaterialStandaloneEditor → TaskFileWorkspace(agentInitiallyVisible=false) → SplitWorkspace leftHidden=true`。面板确实请求了，但被放进了一个 `inert`、`aria-hidden`、`opacity 0`、`flexBasis 0%` 的左栏，所以看不见。
- 现在每种承载点按钮都会滑出左侧面板。再点一次，或者点 ×，就收起。素材库和我的库互斥，顶栏按钮的 `aria-pressed` 跟着变。编辑器不卸载。
  - 左栏被宿主隐藏时，用壳自己的 aside（320 px）。
  - 左栏可见时（工作台 SplitWorkspace），面板放进左栏。
- 壳自己的左侧面板标了 `data-edit-bar-avoid`（R2）。宽编辑栏会整体移到面板右边，不再盖住面板标题和关闭键。
- 素材库面板第一项是「从本地上传」。
  - PDF、演示、文档只接图片，所以面板默认列图片（R2）。原来列的是同类文件（PDF 等），一件都插不进去。
  - 编辑器申报了 `materialTypes` 时，按申报的列。
- 点击插入后，面板顶部用人话报结果：「已插入「…」」，失败时说原因。灰掉的「插入 / 替换」旁边写的也是真原因的人话版（R2），不再是宿主那句「目标编辑器没有可验证的 command/history 契约」。
- 我的库：列出我的文件，当前这份高亮。点另一份时先保存。保存失败就留在原处，并说明原因。保存成功后，在同一承载里换成那份文件，`?item=` 跟着变。

**编辑栏空态抽屉按钮（D3）**
- 没选中任何东西时，编辑栏显示 adapter 申报的抽屉，做成带文字的按钮。按声明顺序排，排除 AI 和素材库/我的库。打开着的按钮有选中态，再点收起。
  - 演示：模板、元素、画笔、线条、便签。
  - 图片：画笔、形状、线条、便签、文字、签名、表格、图层、画布。按 W09 的请求加了后五个（R2）：EditorToolsTrigger 删掉之后，它们没有别的入口了。导出不进这里。
  - 文档：插入、批注。文档的文字栏常驻，所以这两个按钮常驻在同一排。按钮文字已补 16 语（R2）。
  - 其它编辑器：各自的 `drawers` 或 `toolbox`。
- 演示的页面级上下文（`kind: "slide"`）按「没选中」算，五个抽屉按钮和页面级控件排在同一行（R2，按 W07 的请求）。
- 选中对象后，按钮让位给统一栏。收起后的小圆显示选中对象的类型图标（R2，按 W03 的请求：探针读 `data-selection-kind`，壳传 `collapsedIcon`）。

## 2. 文件清单

| 动作 | 文件 |
|---|---|
| 改 | `src/shell/InlineAdvancedWorkbenchShell.tsx`（R2：527 → 540 行，< 600） |
| 改 | `src/shell/SplitWorkspace.tsx`（左栏隐藏时有面板请求就打开） |
| 改 | `src/shell/use-inline-advanced-panels.tsx` |
| 改 | `src/shell/inline-advanced-shell-parts.tsx`（`FallbackDetailAside`、`SelectionPresenceProbe` 种类上报、avoid 标记） |
| 改 | `src/shell/inline-advanced-shell-helpers.ts`（空态抽屉白名单） |
| 改 | `src/shell/inline-editor-mine-panel.tsx`、`inline-editor-mine-activate.ts`、`use-inline-workbench-leave.ts`（先存后切） |
| 改 | `src/shell/material-library-standalone.tsx`（就地换文件的接收方） |
| 改 | `src/shell/InlineEditorMaterialPanel.tsx`（插入反馈、`resolveMaterialPanelType`、`humanMaterialReason`、`materialActionEvidence`） |
| 改 | `src/shell/inline-advanced-workbench-drop.ts`、`workbench-material-provider.tsx`、`workbench-material-registry.ts`（`materialTypes`） |
| 改 | `src/shell/plugin-chrome/EditBarDocumentSegment.tsx`（抽屉按钮） |
| 增 | `src/shell/use-inline-library-panels.tsx`（库面板开合与互斥、`editBarShowsDrawers`） |
| 增 | `src/shell/workbench-material-command.ts`（R2：`withEditorHistoryCommand`，见 §6） |
| 改 | `src/i18n/ui/messages/editor-overhaul-copy-w02.ts` |
| 增 | `tests/editor-overhaul-w02-left-panels.test.mjs`（13 例） |
| 增 | `tests/editor-overhaul-w02-material-command.test.mjs`（3 例） |
| 改（第 1 轮） | `tests/edit-bar-dock-console`、`e2-right-pane-fixture`、`editor-repair-acceptance-chrome`、`inline-mounted-leave-runtime`、`one-task-library-image-runtime`、`plugin-chrome-edit-bar-page-gate`、`library-shared-split-runtime`、`workspace-render-stability` |
| 增 | `evidence/W02/scenarios/{probe-left-panels,mine-switch,upload-fixtures,insert-material,probe-hosts}.mjs` 与 11 张截图 |

## 3. 提交

- 第 1 轮：`65e78a49` `f1454b7c` `e7b78434` `d0fc9653` `624ed139` `6a5b6bae` `f53bd8a0`（父 agent 抢救）。
- R2：`38d583eb` `1a86faf0` `a86ad234` `6c7e17da` `09037822` `6e9c17b3` `5624ea1e` `042b20dd` `54036d06`，外加本交付提交。

## 4. 验证

**focused tests**：在 `/root/projects/oceanleo-ui` 下用 `agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<f>.test.mjs` 跑。

| 测试 | 结果 |
|---|---|
| editor-overhaul-w02-left-panels | 13/13 |
| editor-overhaul-w02-material-command | 3/3 |
| artifact-command-contract | 3/3（共享闸没放松） |
| edit-bar-dock-console | 12/12 |
| editor-repair-acceptance-chrome | 2/2 |
| inline-mounted-leave-runtime | 6/6 |
| one-task-library-image-runtime | 1/1 |
| plugin-chrome-edit-bar-page-gate | 2/2 |
| library-shared-split-runtime | 6/6 |
| workspace-render-stability | 5/5 |
| g2-selection-toolbar-render | 7/7 |

- **i18n 闸** `tests/i18n-tt-key-coverage.test.mjs`：1–7 例全绿。8–10 例红，但没有一条出自 W02 的文件。第 9 例要求从基线里删掉 W02 已补译的「插入」「批注」，见 §8。
- **类型检查** `npx tsc --noEmit -p .`（run-heavy）：W02 的文件 0 错。现存 3 个错都在 `workflow-carrier/video-project-doc.ts`，归 W16。

**浏览器**：LeoDev 槽，验收账号。命令是 `bash harness/mint.sh | OUT_DIR=… THEME=… node harness/run.mjs evidence/W02/scenarios/<s>.mjs <args>`。

| 场景 | 主题 | 结果 | 截图 |
|---|---|---|---|
| `/library?item=` PDF（5f203d39…），probe-left-panels | light | 素材库/我的库面板宽 319 px，无 inert / aria-hidden，互斥，再点收起。编辑栏空态是 W06 的 10 个工具（PDF 不申报抽屉） | `evidence/W02/light-pdf-materials.png`、`light-pdf-mine.png` |
| 图片（f9c000cb…） | dark | 同上。空态 9 个抽屉按钮，点「Brush」打开左侧面板，`aria-pressed=true`。面板与列表深色，没有浅色岛 | `dark-image-drawer-brush.png`、`dark-image-mine.png`、`dark-image-materials.png` |
| 文档（60af3ec7…） | dark | 文字栏常驻，旁边是「插入 / 批注」。点「插入」打开面板，按钮按下态。栏避开面板 | `dark-doc-drawer-insert.png` |
| 演示（709af8fe…，R2 上传） | dark | 面板开合正常。这份 pptx 开档后标题框是选中态，退不出选区（已告 W07），所以浏览器上没看到页面级抽屉，只由 jsdom 覆盖 | `dark-deck-title-stays-selected.png` |
| mine-switch 图片 → PDF | light | 当前这份高亮。点 PDF 后 `?item=` 变成 PDF，编辑器换成 pdf，标题出现，无报错 | `light-mine-switch-0-panel.png`、`light-mine-switch-1-pdf.png` |
| insert-material 图片 | light | 面板直接跳进当前文件的详情（见 §8 第 1 条），「插入 / 替换」灰着（见 §6） | `light-image-materials-detail-restore.png` |
| probe-hosts：`/advanced/pdf`、`/workspace` | light | 门户槽上 `/advanced/<featureId>` 跳到 `/workspace` 应用目录，那里没有编辑器承载 | `light-advanced-pdf-redirect.png` |

**承载覆盖**
- `/library?item=`：浏览器实测，PDF、图片、文档、演示都试过。
- 素材目录：和 `/library?item=` 是同一个 `MaterialStandaloneEditor` 承载，读码确认、同一修复。没单独跑浏览器。
- 工作台右栏（SplitWorkspace 左栏可见）：jsdom 覆盖（left-panels 第 3 例）。浏览器上要先跑一个新任务、等结果卡才能进去，会动用 AI 生成，没跑。
- `/advanced/<featureId>`：门户槽上不存在，见上表。

**保存协议**：W02 不是编辑器 owner，§5 不适用。我的库切换只复用了 `use-inline-workbench-leave` 的先存后切：保存失败就留在原处（jsdom 第 8–9 例）。

## 5. 删掉 / 改写的测试

- 没删测试。
- 改写的断言，每条都改成断言新行为：
  - `library-shared-split-runtime`：`paneMaximized` 的条件改为 `leftHidden && !activeLeftPanel`。根因修复就在这里，被隐藏的左栏在有面板请求时会打开。
  - `one-task-library-image-runtime`：库承载里素材库的落点从 `data-left-panel="library"` 改为壳自己的 `tool-detail` 面板。
  - `edit-bar-dock-console`：aside 的标记搬到 `inline-advanced-shell-parts.tsx`（壳要守 600 行）。
  - `inline-mounted-leave-runtime`、`e2-right-pane-fixture` 等：桩补上 `editBarDrawers`、`isPanelOpen`、`FallbackDetailAside`、`SelectionPresenceProbe`。
  - left-panels 第 4 例：图片白名单从 4 项改为 9 项（W09 的请求）。
- `artifact-command-contract` 第 3 例「声明了 Insert 却没有 command/history 契约时如实灰掉」原样保留，没放松。

## 6. 转给别人的事

- **全体编辑器 owner**：信号 `signals/W02-to-editors.md`，另有 W06–W13 各一份指针。
  - 情况：素材库点卡片插入/替换在所有编辑器里都是灰的。共享闸要求 adapter 登记 `command`（编辑器自己的 history 链，架构文档 `oceanleo-typed-artifact-and-app-material-bindings.md` §5.1），但全仓没有一件编辑器登记过，7 月起一直如此。
  - W02 不放松这道闸。我提供了一行接法 `withEditorHistoryCommand(adapter, { documentId, targetRevisionId, replaceTarget })`，执行时转给编辑器已有的 `mutate`，并带上来源 revision。
  - **在编辑器 owner 接上之前，D2 的「点一下就插入」在浏览器里不成立。** 拖放走的是同一道闸，同样不成立。
- **W06**（`signals/W02-to-W06.md`）：建议给 `pdf-stamps@3` 申报 `materialTypes: ["image"]`。外壳已经兜底，不申报也不会坏。
- **W03**（`signals/W02-to-W03.md`）：左侧面板打开时，文档的宽栏被推出右缘，没有折进「更多」。
- **W07**（已回到 `signals/W07-to-W02.md`）：页面级 = 无选区已经落地。另报：`[W02] sample.pptx` 的标题选区退不出。

## 7. 请父 agent 代改的公共文件

详见 `signals/W02-to-parent.md` 09:30Z 一节。

1. `MaterialLibrary` 加 `restoreHostIdentity?: boolean`，涉及 `material-library-view.tsx`、`material-library-effects.ts`，并传给 `WorkspaceLibrary.tsx` 跳过 `restoreCurrentIdentity()`。之后 W02 在 `InlineEditorMaterialPanel` 传 `false`，一行即可。
2. 从 `tests/i18n-tt-key-coverage.test.mjs` 的基线里删掉「插入」「批注」两条。
3. 不需要动公共出口、`package.json` 或快照。新增的 `workbench-material-command.ts` 由各编辑器按相对路径引入，不进 `src/shell/index.ts`。

## 8. 如实的剩余问题

1. **素材库面板一打开就跳进当前文件自己的详情。** 嵌套的库把页面上的 `?item=` 当成「当前条目」恢复了。用户要点「返回列表」才能看到列表。修复落在非 W02 的文件里，见 §7 第 1 条。
2. **点击/拖放插入还不能用**，原因见 §6。外壳的分发、反馈和人话原因都已就绪，并有回归测试。
3. 素材详情在 320 px 面板里头部挤在一起（「Image」压在「Replace」上）。深色下，预览图上下的留白是浅色块。这两处都在 `WorkspaceLibrary` 详情里（W05 / 并发工程），只报告，没改。
4. 文档「插入」抽屉的内容是中英混排（如「文档来源」「导入文档」）。这是 W08 的抽屉内容。
5. 浏览器上没跑过工作台右栏和素材目录这两种承载，原因见 §4。
6. 演示的页面级抽屉没在浏览器上看到，原因是 §6 里 W07 的那份文件退不出选区。
