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
