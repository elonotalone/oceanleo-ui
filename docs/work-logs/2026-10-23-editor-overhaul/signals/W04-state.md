# W04 state (接班文件)

## 已确认的事实
- [读码] 任务书 `tasks/W04.md` 的根因候选：`advanced-session.ts::advancedSavedItem` 不前移 `revisionId`；`doc-io.ts::savedIdentity` 拿它当 CAS 基线。
- [待核] 每次保存的工程 JSON / 交付件 / 预览各自新建隐藏 `editorInternal` root。

## 正在做
- 步骤 0：读码（doc-io.ts / advanced-session.ts / artifact-client.ts / backend save_revision / fork_artifact / editor_private_staging.py）。

## 下一步
- 步骤 1：验收账号复现（PDF 连续 3 次保存 + 一个 doc-io 编辑器），查库计数。

## 复现命令
```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w04-x THEME=light node harness/run.mjs evidence/W04/scenarios/<scenario>.mjs
```
