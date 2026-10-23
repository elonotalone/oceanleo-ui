# W06 交付 — PDF 编辑器（D4，及 PDF 的 D2 D6 D9 D11）

第 1 轮（`8126ea72` 起）建好单实例架构；第 2 轮（R2，本次）接班：测试清理、浏览器逐项点测、修掉实测出的 6 个缺陷、保存协议逐条跑通。所有结论都来自开发槽 `p-511af…dev.oceanleo.com` + 验收账号 `oceanleo-acl-accept@oceanleo.internal`。

## 1. 用户看得到的变化

- **一个查看器实例，两张页**。「编辑」（基础）= 隐藏 EmbedPDF 官方 UI，「专业编辑」= 同一实例显示官方完整界面。切换不重载、没有「正在切换」（实测 `[data-mode-switch-pending]`=0，`data-pdf-viewer-instance` 前后同为 `pdf-viewer-1`）。页码、缩放、未保存的批注都留在原处。
- **基础编辑栏空态十个工具**（带文字）：高亮、下划线、删除线、打勾、打叉、加文字、签名、画笔、便签、查找。开着高亮 / 下划线 / 删除线 / 画笔 / ✓ / ✗ / 加文字时，舞台左上方出一条小色板。
- **选中批注 → 编辑栏变成它的属性**（统一栏规范 id，见 §3）。
- **左侧页面缩略图**：悬停出「旋转」「删除」（命中区 44px），拖动排序；三件事都写进文件、都能用顶栏撤销。协同只读时整栏只能跳页。
- **签名**：手写或打字，存本机（localStorage，按用户 id 分开，最多 6 个），下次一点就放；签名板两档都是白纸。
- **查找栏**（基础档 Ctrl/⌘+F 也打开它）：「1 / 3」计数，上一个/下一个。
- **素材库**：面板只列图片（`materialTypes: ["image"]`），点一下/拖进去 = 图章放到当前页中央 / 落点，走查看器自己的撤销历史（W02 command 契约）；「从本地上传」同样成为图章。字节按 PNG/JPEG 签名认，不信 MIME。
- **只有一个缩放**：基础档用外壳右下角缩放（与查看器同步），专业档用官方工具栏里的缩放，外壳那个藏起来。
- **深浅两档**：工具栏、缩略图栏、页间底色、弹层随站点；PDF 页面、签名板保持白色（D6）。
- **加文字**：点下去是空的黑字框（上游默认红字 + 预填 "Insert text"，打的字会接在它后面——已修）。
- **内核慢**：PDFium 15 秒内没就绪时，舞台中间说明原因 +「重新载入」，查看器不卸载，就绪后提示自动收起（旧码整块换成报错并卸掉查看器）。
- **删掉**：提取页、插空白页、合并 PDF、旧「页面」工具面板、旧基础舞台与浮条、`ModeSwitchGate`、旧核全部模块（批注引擎 / 表单与涂黑面板 / 逐批注协同合并）。专业档仍有官方的表单与涂黑。
- 专业档「文档 + 齿轮」= `page-settings`（视图设置：单双页、滚动方向）有作用，保留；其中「视图旋转」（不写进文件）和「全屏」（与外壳重复）两档都关。

## 2. 文件

R2 改动（第 1 轮清单见 `8126ea72`、`e58924fa`、`a1e4395e`、`47d7f607`）：

- 改：`src/shell/advanced-routes/PdfRoute.tsx`、`src/shell/media-editors/{PdfStage,PdfControls,PdfFindBar,PdfSelectionBar,PdfSignatureDialog}.tsx`、`src/shell/media-editors/{pdf-viewer-bridge,pdf-viewer-config,use-pdf-workbench}.ts`、`src/i18n/ui/messages/editor-overhaul-copy-w06.ts`
- 增测试：`tests/editor-overhaul-w06-pdf.test.mjs`（16）、`tests/editor-overhaul-w06-pdf-commands.test.mjs`（2）、`tests/editor-overhaul-w06-pdf-instance.test.mjs`（jsdom 同实例判据，1）
- 改测试（只动 PDF 段）：`pdf-carrier-contract`、`pdf-next-core-swap`、`collab-pdf-readonly`、`W6-20261021-pdf`、`advanced-native-editors`、`advanced-project-autosave`、`eas-w19-five-editors-handoff`、`editor-repair-20261021-acceptance-remaining-autosave`、`media-editors`（含 600 行闸登记 8 个新文件）、`media-source-integrity`、`route-context-editors`、`w13-advanced-editor-resilience`、`w25-translate-wrapper-vars`、`W6-r4-remaining-families`、`W6-r4-source-lifecycle`
- 删测试：见 §6
- 证据：`evidence/W06/scenarios/r2-*.mjs`、`evidence/W06/shots/*.png`、`evidence/W06/i18n-baseline-removals.md`

## 3. 统一编辑栏

| 选中 | 栏（规范 id，顺序同词表） |
|---|---|
| 加文字（FreeText），`bar:"text"` | `font-family`（Helvetica/Times/Courier，标准 14 字体只有这三族）· `font-size` · `bold` · `italic` · `text-color` · `align`（left/center/right）· `fill`（底色）· `opacity`（inspector）· `delete` |
| 高亮 `bar:"shape"` | `fill` · `opacity` · `delete` |
| 下划线 / 删除线 | `stroke`（颜色）· `opacity` · `delete` |
| 画笔 / ✓ / ✗（Ink） | `stroke`（颜色 + 粗细）· `opacity` · `delete` |
| 便签（Text） | `fill` · `opacity` · 特有「便签内容」（inspector，无规范图标）· `delete` |
| 图章 / 签名，`bar:"image"` | `opacity` · `delete` |

做不到而不出：批注文字的 `underline` `strike` `highlight` `list` `line-height` `link`；图章的 `crop` `flip` `rotate` `radius` `border`；对象组的 `arrange` `lock` `duplicate` `position`（引擎无对应写入口）。

浏览器点测（`r2-protocol.mjs`，文件 `971dd460`，截图 `evidence/W06/shots/protocol-*.png`）：

| 按钮 | 结果 |
|---|---|
| 高亮 / ✓ / ✗ / 下划线 / 删除线 / 加文字 / 画笔 / 便签 / 签名 | 每个 revision +1，画面可见；下载后 pypdf 读到对应 `/Highlight /Ink /Underline /StrikeOut /FreeText /Text /Stamp` |
| 色板 | 显示；红色 swatch 的 aria-label 与脚本里写的 `#E44234` 大小写不一，脚本没点到（非产品问题） |
| 查找 | 「paragraph」→ 1 / 3，命中高亮（`light-find.png` / `dark-find.png`） |
| 选中 ✓ | 栏 = 描边 / 透明度 / 删除（`protocol-selected-check.png`） |
| 选中便签 → 删除 | revision +1，便签消失 |
| 顶栏撤销 / 重做 | 各 +1 |
| 页面栏旋转 / 拖动排序 / 删页 / 撤销删页 | 各 +1；页数 3→2→3（`r2-rail.mjs`、`protocol-rail-undo.png`） |
| 专业档 Shapes → 矩形 | 同实例、无 pending，+1，下载里有 `/Square` |
| 下载（··· → Download → Download PDF） | 拿到 15–19 KB，pypdf 读出全部批注 |
| 素材库「从本地上传」图片 | 当前页中央出图章（+1），撤销即撤回（`local-upload-stamp.png` / `local-upload-undo.png`） |
| 选中高亮（点在高亮文字上） | 未进入选中态（点到文字层），见 §8 |

## 4. 验证命令与结果

- focused（48 份涉 PDF 的测试，`bash /tmp/w06-run/run-tests.sh`，单份命令见 `_COMMON.md` §3）：PDF 段全部绿。仍红的 7 份都不在 PDF：`b12-single-scroll-owner`（Fabric）、`g3-portal-typed-editor`（W02 循环依赖）、`hit-target-budget`（bay / 设置页等别人的新文件；PDF 新文件已 0 处）、`i18n-key-collision`（WORK_CHAT / BAY）、`i18n-tt-key-coverage` 8/10（`LibraryPdfReader`、Audio 等别人的缺口；我的条目见 §7）、`route-context-editors` 1/2（image crop / deck layer）、`w13` 5（video muted）。
- 新测试：`editor-overhaul-w06-pdf` 16/16、`-commands` 2/2、`-instance` 1/1。
- 类型检查 `agent-io-guard.sh run-heavy -- npx tsc --noEmit -p .`：PDF 文件 0 错（全仓剩 1 错在 `workflow-carrier/video-project-preview.ts`，非我）。
- 浏览器场景（`cd docs/work-logs/2026-10-23-editor-overhaul && bash harness/mint.sh | OUT_DIR=… THEME=light|dark node harness/run.mjs evidence/W06/scenarios/<s>.mjs <args>`）：`r2-protocol`、`r2-rail`、`r2-offline`、`r2-fork`、`r2-theme`（light + dark）、`r2-local-upload`、`r2-download`、`r2-text-save`、`r2-save-stress`、`r2-sig-save`。
- 两档截图：`evidence/W06/shots/{light,dark}-{basic,tool-palette,find,signature,selected,pro}.png`。深色实测底色：页面栏 `rgb(27,27,31)`、舞台 `rgb(14,14,17)`；浅色 `#fff` / `rgb(243,244,246)`；PDF 页面两档白。

## 5. 保存协议（§5）逐条

| 条 | 结果 | 依据 |
|---|---|---|
| 1 改一处→已保存→再改一处→已保存→关闭重开 / 刷新都在 | 过 | `971dd460`：高亮→saved（rev2）、✓→saved（rev3）；关闭重开、整页刷新后都在（`protocol-refreshed.png`），重开顶栏「已保存」 |
| 2 库卡片随之更新 | 部分核 | 库详情阅读器显示的是批注后的最新版本（`/tmp/w06-rail/failure.png`、`/tmp/w06-proto3/failure.png`）；库网格卡片缩略图没有单独截图核对 |
| 3 从公共素材打开只 fork 一份，之后都进这份 | 过 | 公共 `6c907508` → 进编辑时 `POST …:fork` 一次，URL 换成 `369687e3`；两次改动 = rev2、rev3；运行期间验收账号新增 root = 1 |
| 4 断网 → 保存失败可重试 → 恢复后已保存；从不假「已保存」 | 过 | `r2-offline`：离线状态序列只有 `error`（标题「网络不通，稍后自动重试」），恢复后点重试 `error → saving → saved`，revision +1（`offline-error.png` / `offline-recovered.png`） |
| 5 保存次数 = 新 revision 数，不多出条目 | 过（附注） | 每次 `POST /revisions` 都成一个 revision；协议运行期间验收账号没有新增 W06 root（只有 W08 的）。附注：加文字一次改动出 2 个 revision（创建 + 写字），是两次真实编辑 |

附注：协议跑到一半偶发 `PUT /v1/agent/sessions/<id>/snapshot` 409 → 顶栏卡在「保存失败」，直到关闭才后台冲刷（PDF 自己的 revisions 请求无 4xx）。写进 `signals/W06-to-W04.md`。

## 6. 删掉的测试与原因

| 测试 | 原因 |
|---|---|
| `collab-pdf-sync`、`collab-pdf-undo` | 逐批注三方合并 / 撤销栈合并依赖旧核字节替换，随旧核删除；新核协同是整份上锁（打开拿锁、别人只读），只读闸由 `collab-pdf-readonly` 守 |
| `pdf-annotations`、`pdf-annotations-runtime`、`pdf-next-annotations` | 旧 pdf-lib 批注引擎与 sidecar 转换已删；批注由 EmbedPDF 写成标准 /Annots，浏览器 + pypdf 实测 |
| `pdf-editor-v8`、`pdf-forms` | 旧基础浮条、表单 / 涂黑 / 骑缝章面板已删（裁定删除旧工具面板；专业档仍有官方表单与涂黑） |
| `pdf-workbench-hook-runtime` | 旧读写子 hook 全部删除；新 hook 的人改记录由 `W6-20261021-pdf`、`remaining-autosave` 守 |
| `mode-switch-gate`、`d1-mode-switch-attempt` | `ModeSwitchGate` 删除（PDF 是唯一用户，单实例不再交接）；反面判据「无 pending、不重挂」由 `-instance` jsdom 测试守 |
| `pdf-next-wiring` | 被 `editor-overhaul-w06-pdf(-instance)` 取代：CDN 闸、文件命令关闭、懒加载叶子、chips 都搬过去了 |
| 改写里去掉的断言 | 提取 / 合并 / 插空白页的字节测试、旧核坐标换算测试、旧浮条控件映射、W19 字节交接——对应行为已删除 |

仍成立的保护只换了对象：只读闸（新指令面）、源格式（图章按字节认）、草稿恢复失败照实报、空白新建需显式、下载是原字节、CDN 不回落、文件命令关闭、600 行闸、44px 命中区。

## 7. 转给别人的事

- `signals/W06-to-W03.md`：补 `check-mark` / `cross-mark` / `search` 三个特有字形，现在「打勾」「打叉」「查找」只有文字。
- `signals/W06-to-W04.md`：会话快照 409 让编辑器保存状态卡在失败。
- `signals/W06-to-W02.md`：PDF 素材面板图片筛选下列不出账号里的图片（「从本地上传」可用）。
- W04-to-W06（加文字重开显示「Insert」）：根因是上游点击预填 "Insert text"，已在 `f4f297f4` 修（复测「王五 Wang」存出来原样）。

## 8. 请父 agent 代改的公共文件

1. `tests/i18n-tt-key-coverage.test.mjs` 的 `PRE_EXISTING_GAPS`：按 `evidence/W06/i18n-baseline-removals.md` 删条目（闸 9：我已补译文的 7 条；闸 10：随旧核删除、无调用点的条目）。
2. `src/shell/doc-editors/doc-family-commands.ts` 里旧的 `buildPdfCommandSurface`（约 1261 行起）：PdfRoute 已切到 `media-editors/pdf-command-surface.ts`，旧函数只剩 `doc-family-commands.test.mjs` 在用，按派活合同留给父 agent 清理。
3. 部署配置 `NEXT_PUBLIC_OCEANLEO_PDFIUM_FONT_BASE`：指向本站自托管的 PDFium 回退字体目录（`sc.ttf` 等，`pdf-next-runtime.ts::PDFIUM_FONT_GROUPS`）。不配时 PDFium 画 FreeText 外观只有标准 14 字体，**中文「加文字」存进了 /Contents，但重开后外观流里不显示汉字**（实测「王五 Wang」重开只显示「Wang」）。
4. W03 补字形后 `PdfRoute.tsx::PDF_TOOLS` 三处 `icon`（若我已不在岗）。

## 9. 如实的剩余问题

- 中文加文字重开后外观不显示汉字（见 §8.3；字节里内容完好，pypdf 读得到）。
- 打勾 / 打叉 / 查找按钮无图标（等 W03）。
- 点在已有高亮文字上进入的是选字而不是选中高亮批注（点 ✓、便签、图章、矩形都能选中）；高亮批注可在专业档选中编辑。
- 素材面板图片列表为空（W02 侧）；拖放落点逻辑（`pagePointAt`）只在 jsdom / 读码层面核过，浏览器里没拖成功过一次真实素材卡。
- 开发槽繁忙时 PDFium 偶尔超过 15 秒才就绪，现在给「重新载入」不再卸载；但慢本身来自槽负载。
- 第 1 轮的 agent chips 里「翻译选区」挂在 `pdf-page` 选区上，新编辑器不再发出 `pdf-page`，所以这一条 chip 不会出现（其余 7 条照常）。
- 协同仍是整份上锁，没有逐批注合并（旧核那套随删除）。
