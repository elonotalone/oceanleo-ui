# A — 首页输入框：草稿不丢（1）、「从资料库添加文件」（2）、上传中可删（5）

先读 `00-dispatch.md`（红线）。

## 负责文件（你独占）
`src/shell/LeoComposer.tsx`、`src/shell/composer-upload.ts`、`src/shell/AttachmentStrip.tsx`、`src/shell/InputCard.tsx`、`src/shell/HomeIntro.tsx`（仅 composer 草稿/附件相关部分）、新建的 helper 文件、相关测试。
不碰：`AgentChat.tsx`（B/D）、`ComputerDock.tsx`（C）、`HistoryMasterDetail.tsx`（C）。

## 1. 刷新不丢文字和文件
- 首页输入框（以及任务页续问输入框，若走同一个 LeoComposer 状态则一并生效）输入的文字、已加的附件，刷新后原样回来。
- 文字：按 composer 作用域（首页 vs 某 task id）存 localStorage/sessionStorage，发送成功后清掉。注意：任务页已有「未发送保留」逻辑（`unsentRestored` 文案）别冲突。
- 文件：已上传完成的附件，持久化它们的元数据（服务端 id / 私有 key / 名称 / mime / 尺寸 / 预览所需字段，**不存字节，不存签名 URL 的长期副本**；预览 URL 过期就用现有 display-url helper 重新取）。刷新后附件条重新出现、可删、可发送。
- 上传中途刷新的文件：无法恢复字节 → 不要假装还在；最简单是不恢复它（或恢复成失败态可删），选你认为最不误导的，写进结果。
- 先读 composer-upload.ts / AttachmentStrip.tsx 的现有数据结构（9d7b2f4d「private composer attachments, display-url helper, failed tiles retry」），在其上做，别另起一套。
- 注意 D 在修「首页附件 → 发送 → 附件没存好」的会话身份 bug：首页附件对 native（Claude Code/Codex 电脑对话）的上传可能走 `/v1/computers/{id}/inbox?task_session_id=`。你恢复的附件必须仍能被发送路径正确使用；如果某类附件绑定了具体 task_session（服务端行按 session 存），恢复时要保留这个绑定信息，并在结果里写明，供 D 和 parent 对齐。

## 2. 「＋」菜单加「从资料库添加文件」
- 「＋」菜单里在「从本地添加文件」下面加一项 `tt("从资料库添加文件")`（英文 "Add file from library"）。
- 点开后在宿主 UI 体系内选 Library（我的库 / artifacts）里的文件，选中后作为附件出现在附件条，和本地上传的附件一样可删、可发送。
- 先找现有的 Library 选择器（grep `ArtifactLibrary`、`ArtifactPicker`、`pickArtifact`、「最近文件」——LeoComposer 注释里已有「最近文件」菜单项，看它怎么取数据），复用它；没有合适的选择器就用现有 popover/对话框组件做一个最小列表（搜索 + 列表 + 点选）。
- 附件的数据形态要与发送路径兼容：看「最近文件」选中后附件长什么样、发送时怎么传，照做。
- 手机原生宿主分支（LeoComposer 396 行附近）也要有这一项。

## 5. 上传中的文件也有 ×
- 上传中的附件 tile 右上角显示同样的 × 删除键；点了取消上传（AbortController / 丢弃结果，上传完成回调不能把它再加回来）并从附件条移除。

## 验证
`pnpm typecheck`；跑 composer/attachment 相关测试（`ls tests | grep -i -E "compos|attach|upload|leo-composer"`）；为三项各加至少一条测试。

## 结果
（完成后在此追加）

### 改动文件
- `src/shell/composer-draft.ts`（新）：草稿存取 + `useComposerDraft` hook。
- `src/shell/ComposerLibraryPicker.tsx`（新）：「从资料库添加文件」列表（返回 + 搜索 + 列表）。
- `src/shell/LeoComposer.tsx`：新 props `draftKey`、`onAddAttachments`；「＋」菜单加「从资料库添加文件」（浏览器分支和手机原生分支都有，点开后同一张浮层原地换成资料库列表）；点发送时 `draft.markSubmitted()`。
- `src/shell/composer-upload.ts`：`composerAttachmentFromLibraryItem`（Library 项 → 附件，形态与首页「最近文件」一致）、`agentAttachmentFromComposer`；`ComposerAttachment` 增加 `mediaType?`。
- `src/shell/AttachmentStrip.tsx`：上传中的方块也挂 ×；恢复出来、没有本地 blob 的私有图片按引用向网关要短期缩略图（`useAttachmentDisplayUrl`）。
- `src/shell/useAttachments.ts`（AgentChat / FunctionAgentChat / HomeIntro 共用的附件 hook，只做了增量）：每个上传一个 AbortController，删除方块即 abort，迟到的结果不会把方块加回来，也不报错；`clear()` 会 abort 还在传的；新增 `addComposerAttachments(items)`（只收带私有引用的，按 id 去重）；`composerAttachments` 带上 `mediaType`。
- `src/shell/HomeIntro.tsx`：接上 `draftKey={\`home:${siteId}\`}` + `onAddAttachments={atts.addComposerAttachments}`（30 个子站首页不用改代码就生效）。
- `src/i18n/ui/messages/composer-upload-copy.ts`：6 条新文案，16 个语种全部补齐（从资料库添加文件 / 搜索资料库 / 资料库里还没有文件 / 没有找到文件 / 资料库加载失败，请稍后重试 / 已添加）。
- 测试：新增 `tests/composer-draft-library-cancel.test.mjs`（11 条）；`tests/private-composer-attachments.test.mjs` 的 attachment-url 桩补上 `attachmentRef` / `isRawStorageUrl`；`tests/i18n-tt-key-coverage.test.mjs` 把已经补齐 16 语的「已添加」从 PRE_EXISTING_GAPS 里删掉（该测试要求删）。

### 行为说明
1. 刷新不丢：存 **sessionStorage**（同一标签页刷新后还在；不跨标签页互相覆盖），key 是 `oceanleo_composer_draft:v1:<draftKey>`。
   - 文字原样存。附件只存**已上传完成、带私有引用**的：`{id, artifactId, revisionId, name, mime, mediaType}`。**不存字节、不存任何 URL**（blob 和签名地址都不存）。读出时会再校验一遍，旧条目或手改的条目也带不进 URL。
   - 恢复：每个引用用 `getArtifactItem` 重新取一次 typed LibraryItem，拿到新的短期缩略图和 `libraryItem`，右侧栏能打开。网关回 404/403/410 → 不恢复；网络失败 → 只带引用恢复，发送时网关会再校验一次。
   - **上传中途刷新的文件：不恢复**（字节已经没了，不假装还在传）。上传失败的方块同样不恢复。我认为「不出现」比「出现一个只能删的失败方块」更不误导人。
   - 发送：点发送就记下当时的状态。之后宿主清空输入框 → 草稿跟着清；输入框原样卸载（首页切到任务对话）→ 卸载时清；发送失败、宿主把文字还回来（`unsentRestored` / `restoredDraft`）→ 照常继续存，两者不冲突。
   - 恢复只在宿主输入框为空时写回文字；附件按 id 去重后合并。首页已有的 `nativeNavigationDrafts`（内存）和 `oceanleo_composer_prompt` 是后到的，会覆盖，不冲突。
2. 从资料库添加：数据来自私有「我的库」`listMyArtifacts({limit:100})`，和首页「最近文件」同一个来源，按动态 import 加载，不增加 LeoComposer 首屏体积。只列有私有引用的文件；已在输入框里的显示「已添加」并禁用。选中后交给宿主的附件形态 = 首页 `pickRecent` 的形态（`id=artifactId, artifactId, revisionId, libraryItem, mime, mediaType, previewUrl=网关 poster`），发送路径不用改。
3. 上传中可删：AttachmentStrip 对上传中的方块也给 onRemove。用 useAttachments 的宿主会真的取消上传。

### 交接（parent 集成；这些文件不在我的范围内）
1. **oceanbizs / oceanleo 主站首页**在另一个仓：`/root/projects/oceanleo/app/_components/home-content.tsx`，它不走 HomeIntro。要在那里给 `<LeoComposer>` 加：
   ```tsx
   draftKey="home"
   onAddAttachments={nativeChat ? undefined : (items) => setAttachments((xs) => [...xs, ...items.filter((i) => !xs.some((a) => a.id === i.id))])}
   ```
   items 的形态和它的 `Attachment`（`ComposerAttachment & {mediaType}`）一致，`handleSubmit` 里的 `attachmentRef(a)` / `a.mediaType` 可以直接用。
   第 5 项在那里：现在点 × 不会把方块加回来（`runUpload` 用 map 回填），但上传会在后台继续跑完，失败时还会 toast。建议 `runUpload` 给 `uploadComposerFile` 传 `signal`，`removeAttachment` 时 abort，aborted 就不 toast。
2. **任务页续问输入框（AgentChat.tsx，属于 B/D）**：在云端分支的 `<LeoComposer>`（约 2862 行，`onRemoveAttachment={toolsOn ? atts.removeAttachment : undefined}` 那一处）加：
   ```tsx
   draftKey={taskId ? `task:${taskId}` : undefined}
   onAddAttachments={toolsOn ? atts.addComposerAttachments : undefined}
   ```
   native 分支（约 3038 行，`thread.*`）：可以只加 `draftKey`（只存文字）；**不要加 onAddAttachments**，资料库文件进不了电脑 inbox。FunctionAgentChat.tsx（约 1904 行）同样可以加这两行（可选）。
3. **给 D（会话身份）**：电脑对话（Claude Code / Codex）的附件走 `/v1/computers/{id}/inbox?task_session_id=`，没有 Library 引用，所以**不在草稿里存，也不恢复**，恢复路径不会把附件带进别的 session。恢复出来的附件只有私有 Library 引用（artifactId/revisionId），不绑定任何 task_session，发送时走 `/v1/agent/tasks` 的引用通道。

### 测试
- `pnpm typecheck`（agent-io-guard run-heavy）：绿。
- `tests/composer-draft-library-cancel.test.mjs`：11/11 通过（A1×5、A2×4、A5×2）。
- 通过：private-composer-attachments 10/10、agent-upload-affordance、agent-composer-contract、mobile-native-attach 25/25、native-composer-controls、leo-assistant-and-composer-controls、composer-plugins-popover、w2-composer-input-focus、sko-w15-composer-slash、upload-progress 26/26、w1-native-attachments、cloud-computer-image-attachments、untrusted-content-sandbox-origin、W4-conversation-anchor、entry-wiring-a1-a2、i18n-tt-key-coverage 10/10、i18n-bundle-boundary、agent-chat-single-header、payer-wiring、home-app-cards、client-ui-host-auth、conversation-dock、e8-session-noop-write、right-tab-no-task、payer-selector、workspace-restore-ui-contract 等。
- 失败，但都不是我的文件引起的：
  - `hit-target-budget`：149/98，列出来的文件里没有我的文件，是基线问题；
  - `workbench-toolbar-rendered` / `mcp-apps-host` / `library-task-render-loop`：测试桩缺导出（`resolveEditBarDrawers` / `desktopBrowserLoginAvailable` / `authed`）；
  - `i18n-messages-server-safe`：`local-agent-copy.ts` 的 import；
  - `computer-conversations-i18n`：「读取更早的对话」已经没人用了，是 B 的范围；
  - `eas-w03-agent-thread-live` #11：AgentChat 轮询重渲 32≠20，是 AgentChat 流式部分，B/D 正在改。
