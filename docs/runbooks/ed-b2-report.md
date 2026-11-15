# ED-B2 编辑器契约与唯一工具条

结论：已完成。生产外壳唯一 SelectionToolbar；文字与图片 profile 已收敛，最终专项 40/40 和静态门禁通过；全量相对既有基线新增失败 0。交付提交以本报告所属 commit 为准。
工作树 `/root/wt/ED-B2-oceanleo-ui`，分支 `wt/ED-B2`，基线 `0930aba7`。未修改主检出，未 push；ED-B3 保护文件均未改。

## 主要改动（file:line）

- `src/shell/advanced-editor-adapter.ts:159`：以 `selection: {context, dispatch}` 和 `creationTools` 替代任意 ReactNode 工具条入口。
- `src/shell/selection-context-types.ts:153`、`src/shell/selection-adapter.ts:43`：规范输入只交 id、值/混合值、能力约束；外壳填 label/kind/图标/单位。非规范输入显式 specific。
- `src/shell/InlineAdvancedWorkbenchShell.tsx:336`：生产端唯一 `<SelectionToolbar>`；合并选区、创建工具、编辑动作和抽屉的数据与量宽/More，保留引擎自己的事务 revision 判断。
- `src/shell/creation-tools.ts:4`、`src/shell/CreationToolIcon.tsx:32`：独立创建域词表和图标，不借文字 canon 图标；PDF 保持十个 pdf-tool-* identity。
- `src/shell/plugin-chrome/EditBarDocumentSegment.tsx:12`、`src/shell/FloatingContextToolbar.tsx:69`：文档段只构造数据，不画按钮；删除整段收纳及其第二个 More。
- `src/shell/doc-editors/use-rich-doc-selection-adapter.ts:63`、`src/shell/doc-editors/use-deck-selection-adapter.ts:30`：迁移文档和演示选区状态/命令，删除两个旧 UI 包装。
- `src/shell/image-editor/use-fabric-image-selection-adapter.ts:27`：迁移图片/vector 选区，保留只读和手势事务；删除旧 UI 包装。
- `src/shell/media-editors/use-audio-selection-adapter.ts:13`、`src/shell/media-editors/use-model3d-selection-adapter.ts:16`、`src/shell/video-editor/use-video-timeline-selection-adapter.ts:16`：迁移三个媒体选区并删除旧 UI 包装。
- `src/shell/media-editors/pdf-selection-controls.ts:102`、`src/shell/media-editors/use-pdf-selection-adapter.ts:11`、`src/shell/media-editors/PdfToolPalette.tsx:9`：PDF 拆成纯构建/patch、数据 hook 和 palette，删除 PdfSelectionBar UI 包装。
- `src/shell/doc-editors/GridUniverStage.tsx:1322`、`src/shell/video-canvas/LibraryVideoCanvasSession.tsx:141`：直接交数据；视频画布使用同一面板 host，并将真实图片动作映射到 canon id。
- `src/shell/SelectionInspectorPanel.tsx:83`：即时属性命令补传 selectionEpoch，保留严校验，避免画布 Apply locally 等操作被拒绝。
- `tests/editor-toolbar-profile-parity.test.mjs:215`：六宿主文字及四类图片实际选区比较 id/形态/单位/菜单归属；真实 opacity 控件原生值往返；PDF 十工具主栏图标、窄栏 More、逐项执行与扩宽恢复。
- 迁移相关真实挂载、只读、工作副本与单行/量宽测试；跨仓历史契约测试按 git common dir 解析门户检出，支持本次 worktree 布局。

## 单位与 clear-format 差异

- 图片 opacity 统一 canon 数字控件、百分数、step=1、compact/primary；Deck/Fabric 0–100，PDF 沿用 10–100。Deck/PDF 在命令端换回原生 0–1，Canvas 不补尚无的能力。

- 已声明的字号、行距、字距对外均为 px 数值、step=1；Deck 4–300、Fabric 6–320、PDF 6–96。Deck 行距 ↔ 倍数，Fabric 行距 ↔ 倍数/字距 ↔ 1/1000em，PDF 字号 ↔ pt，RichDoc 固定行距 ↔ pt，均由 adapter 换算。
- RichDoc：清全部内联 marks；沿用引擎 clearNodes，也会重置段落样式。
- Deck 文本：清字体、字号、颜色、粗斜下删、高亮、链接和字距；保留段落布局（对齐/列表/行距）及对象属性。
- Fabric/vector 文本：清逐字样式和全部支持的内联格式；回到 sans-serif / 16px / #1c1917，行高 1.16、字距 0，并清描边/背景/偏移；保留内容和对象布局。
- Grid：沿用 Univer range.clearFormat，会同时清单元格的其它可清格式，范围比纯文字内联更广。
- PDF、Timeline 未声明 clear-format；Audio、3D 无文字内联格式。不伪造引擎尚未提供的能力。PDF 字体仍是 Helvetica / Times / Courier 三族；Timeline 仍仅原有文字样式子集。

## 验证

所有重任务经 agent-io-guard，专项用 run-light。未安装依赖。

- `npm run typecheck`：通过（退出 0）；末次日志 `/tmp/ed-b2-final-typecheck.log`。
- `npm run api:snapshot` 后 `npm run api:check`：通过（退出 0），快照已更新。
- `npm run consumers:check`：通过，35 consumers / 38 explicitly exported specifiers。
- hooks ESLint（实际 portal eslint + TS parser/react-hooks，临时配置在 /tmp）：0 错误、39 条 exhaustive-deps 警告；逐文件对照基线也是 39 条，新增 0（`/tmp/ed-b2-hooks-baseline.json`）。
- 父进程实际复跑：最终 parity/Deck/PDF 三文件 36/36，PDF opacity/epoch/实际外壳/窄栏四项 4/4。此前工具条/面板三文件 56/56、Grid/worktree 修复两文件 13/13、global-row/save-menu/W3 三文件 17/17 均通过。
- g2 + single-row 两文件 11/11；保留 576 组 DPR/停靠/消息扫描，并断言无 console.error。
- 引擎专项、只读/事务/保存工作副本测试均纳入最终完整日志 `/tmp/ed-b2-full-verified.log`。
- 最终 `npm test`：10153 项；10073 通过、63 失败、15 取消、2 跳过，退出 1，约 24.9 分钟；保留既有失败，没有写成全绿。
- TAP 顶层失败标题去重后 74 项（`/tmp/ed-b2-full-fails.sorted`）；基线去重 77 项。`LC_ALL=C comm -13 /tmp/ed-b2-baseline-fails.sorted /tmp/ed-b2-full-fails.sorted` 实跑输出 0 行（`/tmp/ed-b2-added-fails.txt`）；74 项全部匹配，基线另 3 项本轮未复现，不宣称已修复。
- 两份清单先执行 `LC_ALL=C sort -u`。完整失败原清单 `/tmp/ed-b2-full-fails.txt`，基线原件 `/tmp/ui-baseline-fails.txt` 未改；原始统计 `/tmp/ed-b2-test-summary.json`。
- `git diff --cached --check`：通过。`node_modules` 保持原有未跟踪链接，没有加入提交。

## 未证实 / 未做

未运行浏览器或真实设备视觉验收、原生构建/安装、合并、push 或部署；由父进程后续整合。没有宣称 PDF 完整富文字、Timeline 字体/段落能力、真实 WASM 保存导出重开已获得本次端到端证明。
