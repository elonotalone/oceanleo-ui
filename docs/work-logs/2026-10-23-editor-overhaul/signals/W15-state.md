# W15 接班状态（游戏）

更新：2026-10-23 开工

## 已确认的事实
- [读码] 路由 `src/shell/advanced-routes/GameRoute.tsx`（755 行），Code 页 `src/shell/game-editor/GameCodeStage.tsx`（1031 行，旧大文件，不许再明显变大），页面申报 `game-editor/game-pages.ts`。
- [读码] 编辑页 adapter：`toolbox {label:"玩法", icon:"add"}`；Code 页 adapter：`toolbox {label:"运行", icon:"code"}`；两页 `actions` 里只有「另存为二创副本」（group save）。
- [读码] 硬编码浅色回退：`bg-[var(--card,#fff)]`、`--awb-stage-bg,#fafaf9` 等；Code 页 textarea / border 没有主题 token。
- [读码] Code 页保存 `uploadFile(... idempotencyKey: game-draft:<seed>:<item.id>)`，待核：同一 item 第二次保存是否被幂等键吞掉。

## 正在做
- 读代码：外壳 toolbox/drawers 渲染、主题 token、现有测试。

## 下一步
- 浏览器现状基线（从公共游戏打开 → fork → 保存两次），记录到 journal。
- 改深浅两档、编辑栏、保存路径。

## 复现命令
```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w15-x THEME=light node harness/run.mjs evidence/W15/scenarios/<场景>.mjs
```
