# W04 state (接班文件)

## 已确认的事实
- [读码] `advanced-session.ts::advancedSavedItem` 不前移 `revisionId`/`artifact`；`doc-io.ts::savedIdentity` 拿 `item.revisionId` 当 CAS 基线 → 第 2 次保存 409。
- [读码] doc-io 每次保存的工程 JSON / 交付件 / 预览走 `/v1/database/upload register_asset=false` → `typed_uploads` 每份 ensure 一个 `editorInternal` root。
- [读码] 已有私有 staging：`/v1/database/private-upload register_asset=false` 只收 JSON/PNG，回 `blob_id=project-assets:u/<id>/editor-staging/<day>/…`；commit 用 blobId 时后端复制进 CAS（`_typed-artifacts/sha256/…`）并记 claim，不建 root。
- [读码] 409 回执 details 带 `currentRevisionId`。
- [读码] fork 在库详情「编辑」时发生（`getArtifactEditDecision`），幂等键 `artifact-fork-v1:<id>:<rev>`，重放回 fork 的当前 head。
- [实测] 验收账号已上传 `[W04] sample.pdf` = artifact `952e4481-3d35-4633-a0c6-b78864a8859c`（rev1 `a3bb41bd…`）。
- [待办] W14-to-W04：网站 deployed 提交要带父版本依赖闭包 + 可选 sourceDependencies。

## 已完成（提交）
- ui e1013941 基线前移 + 自提交 head 409 兜底 + 私有 staging + metadata；8975a26a 状态诚实；1503b59b sourceDependencies。
- oceanleo 473f3d1 staging 路由 / metadata 白名单 / 网站闭包继承；a396ef7 网站新图。dev 网关已重启 2 次。
- [实测 API] staging 后 3 次保存 = 3 revision、0 hidden root。

- [实测] 清理脚本 dry-run 已完成（oceanleo 1fec5a7，计数见 journal 07:54Z）。
- [实测] R2 08:18Z 上传 [W04] sample.docx 0420568e / .md eb23423e / .png e9c7803e / .pptx f04b448c（upload-wait.mjs）。
- [实测] 文档 2 次编辑 = 2 个新 revision；但第 2 次「已保存」来自草稿层（advanced-draft.ts 经 /v1/database/upload 建 1 个隐藏 `…草稿` root），版本在空闲 20s / 关闭时才发布。

## R2 已完成（提交）
- ui c5e506a4 草稿层本地恢复=待存改动；3c0dfc45 IndexedDB 写删串行 + 陈旧副本不重发 + 草稿失败可见；0cef89b0 服务器草稿恢复后发布版本。
- oceanleo 62128b0 own-head 重试同一 staged 对象不再 blob-digest-conflict；dev 网关第 3 次重启 09:5xZ。
- [实测 浏览器] 文档 §5.1/4/5 通过（2 编辑 = 2 revision、断网 0.8s「保存失败」、重试后 revision）；interrupted-save 修后重开自动存上。

## 正在做
- 槽 17:47 本地被重启，等热身后跑：deck 自己的 f04b448c、deck fork 8005de37（§5.3）、image e9c7803e、pdf 952e4481（Check 图章）、draft-restore-publish。

## 下一步
- 写 verdicts/W04-delivery.md。

## 复现命令
```bash
bash harness/mint.sh | OUT_DIR=/tmp/w04-sp-doc THEME=light node harness/run.mjs evidence/W04/scenarios/save-protocol.mjs doc id:eb23423e-0d3a-436b-b77a-711e2f6c5d93 --offline
bash evidence/W04/scenarios/db-check.sh eb23423e-0d3a-436b-b77a-711e2f6c5d93 2026-10-23T08:26:00Z
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w04-explore THEME=light node harness/run.mjs evidence/W04/scenarios/explore-editor.mjs "id:952e4481-3d35-4633-a0c6-b78864a8859c"
```
