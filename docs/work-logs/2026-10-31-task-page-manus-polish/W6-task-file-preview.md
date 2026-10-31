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
（完成后追加；写两套链路的根因）
