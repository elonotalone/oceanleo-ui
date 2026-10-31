# W6 — 任务页里打开图片 / 文件：和首页一样的右侧预览，所有类型

先读 `00-dispatch.md` 红线。看图：`/root/oceanleo-inbox/20261031T084035Z-粘贴图片-20261031164034.png`（任务页右侧"图片查看"是旧样式：标题 + Open + ×，图片小块）。

## 现状
Operator：主页上传图片后打开的侧边栏是对的；在具体 task 页面中，上传图片后点击文件试图打开，完完全全没有做好；其他类型文件一个道理。

## 负责
`src/shell/task-file-workspace.tsx`、`SplitWorkspace.tsx`、`LibraryMediaPreview.tsx`、`mobile-file-handoff.ts`、`active-agent-file.ts`、`AgentChat.tsx` 中附件 tile / 消息内文件点击那一段，以及首页那套右侧预览所在文件（先找：主站 `/root/projects/oceanleo/app/_components/home-content.tsx` 里点附件打开什么）。

## 要做
1. 找出首页点附件打开的右侧预览组件和链路（"对的那套"），以及任务页现在走的链路（"旧的那套"），写进结果：为什么两套不同。
2. 任务页所有入口统一走首页那套：输入框里待发送的附件 tile、已发送用户消息里的附件、agent 消息里产出的文件、电脑任务（Claude Code / Codex）inbox 文件。
3. 所有文件类型都要好：图片（大图、适配、缩放）、PDF、文档（docx/xlsx/pptx → 现有转换/预览能力）、视频/音频、代码/文本、未知类型（文件信息 + 下载/在资料库打开）。用现有编辑器/预览能力（见 oceandino `.cursor/rules/oceanleo.mdc` 「Native editors」段：pdf = EmbedPDF 等），不新造查看器。
4. 私有文件签名 URL 过期 → 用现有 display-url helper 重新取；电脑任务 inbox 文件通过现有网关路由取。
5. 右侧预览与对话分栏宽度按 W4 的宽度常量协调（W4 负责正文宽度；你只负责预览面板）。

## 验证
- 相关测试（`task-file-workspace*`、`split-workspace*`、`library-media-preview*`、附件相关）+ 新测试：任务页各入口点击都打开同一预览组件、各类型渲染分支、过期 URL 重取。

## 结果

### 两套链路（为什么首页对、任务页错）
- **对的那套（首页）**：`oceanleo/app/_components/home-content.tsx` 的 `openAttachment` → `attachmentWorkspaceItem` + `attachmentOpenMode` → `useTaskWorkspaceState().openWorkspaceItem` → `TaskWorkspaceShell`（SplitWorkspace 右栏）→ `ResultCanvas` direct-open → `LibraryItemViewer`（图片大图/缩放、EmbedPDF、mammoth docx、表格/幻灯片、`LibraryMediaPreview` 音视频、文本）或编辑器。
- **旧的那套（截图里的「标题 + 打开 + ×」）**：`AttachmentStrip.tsx` 内置的 `PreviewPanel`（fixed 520px 侧抽屉，小图、PDF 只给一行字）。规则是「宿主不传 `onOpenAttachment` 就用它」。
- **根因 1（截图那一页）**：任务页 `AgentChat` 有两个对话面板共用一个 `renderStream`：云端面板的 `LeoComposer` / `AgentTranscriptBubble` 都接了 `openTaskAttachment`（W7 做的），但**电脑任务（Claude Code / Codex…）面板 `renderNativePane` 两处都没接**——输入框方块于是落回 `AttachmentStrip` 的旧 `PreviewPanel`，已发消息里的方块点了没反应，inbox 文件只是新标签页下载。
- **根因 2（已发送的文件）**：旧 `openTaskAttachment` 只把气泡给的 `url` 塞进本地预览项；气泡给的是**缩略图 rendition 授权**（只对图片取，非图片是空串），私有引用 `artifact_id/revision_id` 被丢掉 → PDF/文档打不开、图片是缩略图、授权过期不会重签、也进不了编辑器。
- **根因 3（Library 编辑器线程 `TaskFileWorkspace`）**：右栏渲染 `workspaceContent ?? right`，有编辑器时 ResultCanvas 根本不显示，点附件只改了看不见的 canvas。

### 改动
- 新 `src/shell/task-attachment-open.ts`：任务页唯一的「点开文件」。顺序：typed `libraryItem` → 本地 `blob:`（同步，同首页）→ 私有引用按 `getArtifactItem` 读回资料库条目（查看器自己签/过期重签 rendition；有编辑器即编辑）→ 读不回时 `resolveAttachmentDisplayUrl`（文件 `source`、图片 `preview`）并保留引用供重签 → 电脑任务 inbox `native_archive.download_path` 走 owner 校验网关路由换一次性地址、字节读进本地 `blob:`（≤64MB，页面不出现存储域名，按路径缓存，失败可重试）→ 旧公开地址走网关代理。`useTaskAttachmentOpener` 同步能开就立刻开，异步只开最后一次点击，打不开返回 `false`。
- `AgentChat.tsx`（只动附件段 + 右栏一行）：`openTaskAttachment = useTaskAttachmentOpener(...)`；打开时关掉电脑设置面板、受控右栏 `onWorkspaceOpenChange(true)`；电脑任务面板的气泡与输入框补 `onOpenAttachment={openTaskAttachment}`；有 `workspaceContent` 时文件盖在编辑器上（编辑器保持挂载不丢未存内容），右栏关掉后恢复编辑器。
- `native-thread/useNativeThread.ts`：电脑任务输入框方块带上 `nativeArchive`（上传到会话 inbox 后），非图片也能在发送前打开。
- `AgentTranscriptBubble.tsx`（只动附件段）：inbox 文件 chip 有宿主时先交给宿主在右栏打开，宿主返回 `false`（过大/读失败）才退回原来的下载。
- 测试：新 `tests/w6-task-attachment-open.test.mjs`（8 条：同步/引用读回/引用读不回重取 rendition/inbox 各类型 kind+mime/读字节安全/旧公开地址走代理/opener/AgentChat 四个入口接线）；`tests/w7-task-workspace-shell.test.mjs` 锁定新写法（`useTaskAttachmentOpener(`）。

### 验证
- 通过：w6-task-attachment-open 8/8、w7-task-workspace-shell 7/7、w1-native-attachments 9/9、private-composer-attachments 10/10、split-workspace-workbench-open 3/3、cloud-computer-image-attachments 3/3、agent-chat-home-launch-keeps-transcript 19/19、agent-chat-conversations 34/34、agent-chat-w3-history-native 4/4、agent-composer-contract 7/7、agent-chat-single-header 6/6。
- `pnpm typecheck`：我改的文件无错；最后一次跑时唯一报错在 `src/shell/native-thread/NativeModelPicker.tsx:175`（W7 正在改的文件，不是本任务）。

### 未证实 / 交接
- 未开浏览器：各类型真实渲染（EmbedPDF 读本地 blob、docx/xlsx/pptx 本地 blob 预览）沿用 `LibraryItemViewer` 现有分支，只做了单测与类型；需要 operator 在真实实例点一遍（电脑任务里的图片 / PDF / docx、云端任务已发送的 PDF）。
- Supabase 签名地址 fetch 依赖存储桶 CORS（`NativeArchivedImage` 已在用同一做法）；失败时 chip 退回下载。
- 电脑任务输入框里**还没上传到会话**（deferred）的非图片文件没有任何可读字节，点开是查看器的「没有可显示的正文」。
- `TaskFileWorkspace` 盖层：右栏标题 claim 以最后一次为准，从文件回到编辑器需关一次右栏；未在浏览器确认标题切换。
- 交接：动了非独占文件 `AgentTranscriptBubble.tsx`（W4，只改附件 chip 段 + `onOpenAttachment` 类型放宽为 `void | Promise<boolean>`）、`native-thread/useNativeThread.ts`（composerAttachments 映射加一行）。主站 `home-content.tsx` 未改（首页链路本来就对）。没有新增文案。宽度：预览面板沿用首页同一 `defaultRatio=0.46` / SplitWorkspace，未改 W4 正文宽度常量。
