# W08 交付：文档（RichDoc / Tiptap）

第 1 轮 owner（被打断）加 R2 接班（08:2xZ–10:2xZ）。R2 只补了剩下的部分，第 1 轮已经实测过的项没有重做。所有实测都用验收账号，在 LeoDev 槽上跑。

## 1. 用户能看到的变化

- **统一文字栏**（D9）：顺序是 `font-family` · `font-size` · `bold` · `italic` · `underline` · `strike` · `text-color` · `highlight` · `align` · `list` · `line-height` · `link`（面板里带「移除链接」）。「更多」里放 `indent-increase` / `indent-decrease` / `clear-format`。文字组后面是特有控件：段落样式 `format`（正文 / 标题 1–3）、「段落设置」（排版检查器）、批注/修订、引用、代码块、表格组。特有控件都不借规范图标。
- **统一图片栏**：`replace` · `radius` · `border`（面板：颜色+粗细）· `opacity`（面板）· `duplicate` · `delete`。「更多」里是环绕方式 `image-wrap`。`crop` 和 `flip`/`rotate` 引擎做不到，所以不出。
- **空态抽屉**：「插入」「批注」。「插入」抽屉原来在英文界面里中英混排，现在 13 条文案都补了 16 语（下面第 7 节有一项要父 agent 摘基线）。
- **深色**：正文跟着变深。默认黑字只在显示层映射成主题前景色，用户设的颜色保留，低对比的颜色提亮到 4.5:1，高亮和单元格底色压暗。存储内容不变。
- **保存**：
  - txt/md 写回保持原格式：行结构、GFM 表格、紧凑列表都不坏。
  - txt/md 不再生成 PNG 预览。
  - 每个 revision 都带 `metadata.text_excerpt`（摘要用 W05 的同一规则）。
  - docx 写回的高亮改用合法的 `w:shd`，字号和字体也写进去了。
  - 保存失败会报真实原因。md/docx 的写出模块在打开文档时就预载，所以断网后能重试。
- **R2 新修 3 处**：
  1. **关掉重开丢行距 / 首行缩进 / 段前段后 / 编号预设 / 图片环绕**：原生草稿恢复时被当成 Umo 文档回转，这些段落属性被剥掉了。现在原生 doc 原样恢复，只有旧 Umo 草稿才回转。
  2. **图片「替换」上传成功（200）但图不变**：现在上传前先钉住选中图片的位置和地址，上传回来后按位置或地址写回。
  3. **素材库插入**：接上了 W02 的 `withEditorHistoryCommand` 契约（基线是当前 revision，插图走 Tiptap `setImage`，可以撤销）。
  4. **`···` 下载项**（`signals/W01-to-W08.md`）：原来是拼好的中文串（`直接下载 DOCX` / `下载 …`），英文界面会显示中文。现在改用 `tt("直接下载 {fmt}")` / `tt("下载 {fmt}")`，与表格一致，键已有 16 语。

## 2. 文件

- 增：
  - `src/shell/doc-editors/rich-doc-text-delivery.ts`、`rich-doc-theme-ink.ts`、`rich-doc-image-style.ts`、`rich-doc-draft-restore.ts`
  - `tests/richdoc-text-delivery.test.mjs`、`richdoc-dark-ink.test.mjs`、`richdoc-draft-restore.test.mjs`、`richdoc-image-replace.test.mjs`、`editor-overhaul-w08-material-insert.test.mjs`
  - `evidence/W08/scenarios/*.mjs`（save-protocol、offline-retry-probe、close-after-draft-probe、persist-probe、bar-check、image-bar、drawers、library-cards、upload）
  - 截图 `evidence/W08/*.png`
- 改：
  - `src/shell/doc-editors/RichDocContextToolbar.tsx`（925 → 651 行）
  - `use-rich-doc-editor.ts`、`rich-doc-model.ts`、`RichDocStage.tsx`、`docx-export.ts`
  - `src/shell/advanced-routes/RichDocRoute.tsx`
  - `src/i18n/ui/messages/editor-overhaul-copy-w08.ts`（598 行）
  - `tests/advanced-project-autosave.test.mjs`（见第 5 节）
- 删：无。

## 3. 提交

- 第 1 轮：51953f0a、811a87ea、0ec30af1（父 agent 抢救）、17787181、ec64925f、eafced1a、998b856b、5c4c4ed4（父 agent 抢救）
- R2：b51624c1、6f56c8c8、e3722f1b、ad7fe4f4、309da93c、f08d354e、3bb545d4、1fc90766（交付），以及下载文案那一笔（见 `git log -- src/shell/advanced-routes/RichDocRoute.tsx`）

## 4. 验证

### Focused tests（全绿）

| 测试 | 结果 |
|---|---|
| richdoc-text-delivery | 7/7 |
| richdoc-dark-ink | 6/6 |
| richdoc-draft-restore | 3/3 |
| richdoc-image-replace | 1/1 |
| editor-overhaul-w08-material-insert | 4/4 |
| rich-doc-single-mode | 4/4 |
| richdoc-typography | 17/17 |
| richdoc-table | 18/18 |
| richdoc-comments | 10/10 |
| share-docx | 8/8 |
| library-richdoc-runtime | 1/1 |
| advanced-project-autosave | 5/5 |
| advanced-editor-v7 / v8 / v9-edit-bar | 9/9、4/4、8/8 |
| advanced-adapter-contract | 6/6 |
| advanced-native-editors | 5/5 |
| collab-richdoc-review | 23/23 |
| doc-family-commands | 35/35 |
| editor-repair-acceptance-*（round-trip / source-load / richdoc-image） | 全绿 |
| library-richdoc-project-reopen | 2/2 |
| library-document-open | 3/3 |
| richdoc-docx-comments | 10/10 |
| richdoc-track-changes | 21/21 |
| W1-richdoc-source-import | 6/6 |
| W1-richdoc-image-empty-admission | 5/5 |
| p4-working-document | 4/4 |
| w2-editor-save-contract | 25/25 |
| rich-doc-umo-migration | 5/5 |
| rich-doc-wechat-export | 6/6 |
| richdoc-find-replace | 17/17 |

### 仍红、但不在 W08 文件里的测试

| 测试 | 失败位置 | 归属 |
|---|---|---|
| advanced-canva-interactions #3 | image-filters | W09 |
| route-context-editors #1 #2 | 图片栏 | W09 |
| w13-advanced-editor-resilience #5 | 视频 muted | W11 |
| e9-draft-safety #3 #4 | model3d / workflow | 非 W08 |
| office-real-file-roundtrip #2 | DeckRoute | 非 W08 |
| lightweight-office-frontend #6 | grid snapshotReady | 非 W08 |
| i18n-tt-key-coverage #8 #10 | 别人的缺口 | 非 W08 |
| i18n-tt-key-coverage #9 | W08 已补译的 11 条仍在历史基线里 | 见第 7 节 |

### 类型检查

`npx tsc --noEmit -p .`：W08 文件 0 错。全仓 3 错都在 W16 的 `workflow-carrier/video-project-doc.ts`。

### 浏览器场景

命令格式：

```bash
bash harness/mint.sh | OUT_DIR=… THEME=… node harness/run.mjs evidence/W08/scenarios/<x>.mjs …
```

- **文字栏 `bar-check.mjs`**（fresh docx `80a3e686…`）：15 项都看得到效果，bold 的撤销/重做有效。整页刷新后 14 项格式都还在（含修后的行距；clear-format 刷新后仍是无格式）。
  - 截图：`evidence/W08/light-text-bar.png`
- **图片栏 `image-bar.mjs`**：插图后撤销/重做有效。
  - radius / border / duplicate / delete / replace（修后）都 ok。
  - opacity 在滑块松手（失焦）时才提交。
  - 重开后圆角、边框、透明度都在。
  - 截图：`light-image-bar.png`、`w08-r2-dark-imagebar.png`
- **两档截图**：
  - 编辑器：`light-editor.png` / `dark-editor.png`
  - 插入抽屉：`light-drawer-insert.png` / `dark-drawer-insert.png`
  - 批注抽屉：`light-drawer-comments.png` / `dark-drawer-comments.png`
  - 库卡片：`light-library-cards.png` / `dark-library-cards.png`
  - 深色下没有浅色岛，字都看得清。
- **库卡片 `library-cards.mjs`**：4 张 [W08] 卡（txt / md / 2 份 docx）都是文字卡片（标题 + 开头几行），不转圈、没有 `<img>`，摘要包含保存后的新内容。摘要大约 15–20s 才出来，原因是列表投影里没有 `text_excerpt`，卡片要现读源文（W05 已记录）。

## 5. 保存协议（§5）逐条

| 条 | txt `54424e1a…` | md `c3e0c65b…` | docx `80a3e686…` / `2e894b64…` |
|---|---|---|---|
| 1 两次改动→已保存→关→重开→刷新，两处都在 | ✔（R2 08:18Z） | ✔（R2 08:28Z） | ✔（08:31Z） |
| 2 库卡片更新 | ✔ 文字卡含新内容 | ✔ | ✔ |
| 3 从公共素材打开（`74822a67…`「会后群通知」） | — | — | ✔ 只生成 1 份副本 `e426c567…`，地址栏切过去，之后的保存都进它 |
| 4 断网→保存失败（「网络不通，稍后自动重试」）→恢复→重试→已保存 | ✔ | ✔（修预载后；有一轮 15s 内没动，probe 显示恢复后约 3s 自动重试成功） | ✔ |
| 5 保存次数 = 新增 revision | txt ✔ 3 次 = rev 6/7/8；md ✔ 3 次 = rev 8/9/10 | 同左 | ⚠ 见下 |

第 3 条的补充：副本是在点「编辑」进入编辑器时生成的，不是在第一次改动时。另外还会多出一个隐藏的 `…草稿` root。

第 5 条的 ⚠：同一会话里第二次改动走服务器草稿层。顶栏的「已保存」是草稿已落服务器，revision 要等 20s 空闲，或者关闭后 hand-off 约 9s 才发。

- 关闭后等着，revision 会到（rev 7/8 实测）。
- 关闭后马上重开再刷新，那次改动就只留在草稿里，直到下一次编辑才随之发布。数据不丢，但库卡片在这段时间里停在旧版本。docx 两轮、公共副本一轮都是这样。
- 这是共享内核的行为，不在 W08 文件里，已写进 `signals/W08-to-W04.md`。

每条 revision 都带 `text_excerpt`，`source_format` 保持 txt / md / docx，没有静默变成 docx。

## 6. 删掉的测试

- 没有删测试。
- `tests/advanced-project-autosave.test.mjs` 第 4 条：真正的保存体改名成了 `saveOnce`（`save` 只是共享在途保存的薄包装），所以把断言的段落起点改成 `const saveOnce = useCallback`。断言内容（`createRichDocDeliveryFile` / `saveFileToLibrary` / `createFile`）一条都没放松。

## 7. 转给别人的事

- `signals/W08-to-W04.md`：
  - 草稿层「已保存」不等于 revision；关后速开再刷新会推迟发布。
  - 每个编辑会话都新建一个隐藏的 `…草稿` root（`advanced-draft.ts::uploadAdvancedDraft`），D13 清理清单需要把它们算进去。
- `signals/W08-to-W02.md`：
  - 文档编辑器的素材库货架里没有图片：筛选是「单文件图片」，却只列出一张 DOCUMENT 卡。
  - 面板打开时停在当前文档的详情页，理由文字中英混排。
  - 面板里还有没翻译的中文。
  - 所以「点素材插图」这条路径在浏览器里没能实测；W08 侧的契约已经接好，并有单测。
- `signals/W08-to-W05.md`：同一账号重复上传同样字节的 PNG，`/v1/database/upload` 返回 500（AttributeError，在 `typed_artifact_upload_replay` 之后），编辑器只显示「HTTP 500」。

## 8. 请父 agent 代改的公共文件

`tests/i18n-tt-key-coverage.test.mjs` 的 `PRE_EXISTING_GAPS` 需要摘掉下面 11 条（W08 册已补齐 16 语，第 9 条棘轮要求摘）：

`3×3 表格`、`上传本地图片`、`代码块`、`分割线`、`导入中…`、`导入文档`、`引用块`、`插入内容`、`文档来源`、`粘贴图片 URL`、`选中文字后，排版与颜色会直接出现在内容上方。`

## 9. 剩余问题

- 图片上传失败时编辑器显示的是原始的「HTTP 500」。给它一句人话需要新文案，W08 册已经 598 行，没有加。
- 透明度滑块在松手（失焦）时才提交，拖动过程中没有实时预览。
- 链接面板是检查器里的 textarea，提交方式是 Ctrl/Cmd+Enter 或失焦；单按 Enter 是换行（W03 的通用控件）。面板打开后，编辑栏右端会超出舞台（W03 布局）。
- 字体面板里中文字体的示例句仍是中文，这是有意的字样展示。分类标签「中文 / 经典」已补译。
- 开发槽在本轮里有几次热重载或断开（09:4x–09:58Z 那段父 agent 已确认是代理泄漏），中途失败的场景都重跑了；上面写的结果都来自完整跑通的那一轮。
