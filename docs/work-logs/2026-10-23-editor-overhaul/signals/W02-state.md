# W02 state (接班文件)

更新于 2026-10-23 08:30Z（R2 接班，第 2 轮）。

## 已确认的事实

- [读码] 根因（库页面）：`/library?item=` → `MyLibrary` → `MaterialStandaloneEditor`（无现成窗格）→ `TaskFileWorkspace(agentInitiallyVisible=false)` → `AgentChat` → `SplitWorkspace leftHidden=true`。`showDetail` 只清 `rightMaximized` 不管 `leftHidden` → 面板被放进 `inert + aria-hidden + opacity0 + flexBasis 0%` 的左栏。已修（f1454b7c）：左栏隐藏时走壳自己的 aside。
- [读码] 素材目录同一条路，同一根因；`/advanced/<featureId>` 在门户槽 redirect 到 /workspace。
- [实测] 07:3xZ `/library?item=<[W02] sample.png>` light：素材库/我的库开合互斥、aria-pressed 跟随；图片编辑栏空态出「Brush Shape Lines Note」。
- [实测] 文档：文字栏常驻 → 加 richdoc 常驻例外（624ed139）。
- [实测] 上传 root：pdf 5f203d39-993f-4e3a-8d54-88d6935c6175 / png f9c000cb-a8a7-4f62-a5a4-afe044e158be / docx 60af3ec7-eaa2-44d5-97ce-05e2997c57c1。
- 已提交：f1454b7c e7b78434 d0fc9653 624ed139 6a5b6bae f53bd8a0（mine-switch 场景）。

## 已完成（R2，09:55Z）

- 9 个 R2 提交 + 交付提交，见 `verdicts/W02-delivery.md` §3。交付已写。
- 剩余只在别人文件里：编辑器 owner 接 `withEditorHistoryCommand`（W02-to-editors）、父 agent 加 `restoreHostIdentity`（W02-to-parent 09:30Z）、W03 栏溢出、W07 选区退不出。

## 下一步

- 父 agent 加好 `restoreHostIdentity` 后，在 `InlineEditorMaterialPanel.tsx` 传 `restoreHostIdentity={false}`（一行）。

## 复现命令

```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w02-probe THEME=light node harness/run.mjs evidence/W02/scenarios/probe-left-panels.mjs "/library?item=5f203d39-993f-4e3a-8d54-88d6935c6175" pdf
```
