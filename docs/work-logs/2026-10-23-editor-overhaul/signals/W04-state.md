# W04 state (接班文件)

## 已确认的事实
- [读码] `advanced-session.ts::advancedSavedItem` 不前移 `revisionId`/`artifact`；`doc-io.ts::savedIdentity` 拿 `item.revisionId` 当 CAS 基线 → 第 2 次保存 409。
- [读码] doc-io 每次保存的工程 JSON / 交付件 / 预览走 `/v1/database/upload register_asset=false` → `typed_uploads` 每份 ensure 一个 `editorInternal` root。
- [读码] 已有私有 staging：`/v1/database/private-upload register_asset=false` 只收 JSON/PNG，回 `blob_id=project-assets:u/<id>/editor-staging/<day>/…`；commit 用 blobId 时后端复制进 CAS（`_typed-artifacts/sha256/…`）并记 claim，不建 root。
- [读码] 409 回执 details 带 `currentRevisionId`。
- [读码] fork 在库详情「编辑」时发生（`getArtifactEditDecision`），幂等键 `artifact-fork-v1:<id>:<rev>`，重放回 fork 的当前 head。
- [实测] 验收账号已上传 `[W04] sample.pdf` = artifact `952e4481-3d35-4633-a0c6-b78864a8859c`（rev1 `a3bb41bd…`）。
- [待办] W14-to-W04：网站 deployed 提交要带父版本依赖闭包 + 可选 sourceDependencies。

## 正在做
- 步骤 1：浏览器复现 PDF 3 次保存（evidence/W04/scenarios/explore-editor.mjs → repro-pdf）。

## 下一步
- 修 advancedSavedItem + doc-io 自提交 head 兜底；私有 staging；metadata 透传；状态诚实；网站闭包；清理脚本。

## 复现命令
```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w04-explore THEME=light node harness/run.mjs evidence/W04/scenarios/explore-editor.mjs "id:952e4481-3d35-4633-a0c6-b78864a8859c"
```
