# W07 state — 演示（deck）

## Codex continuation 2026-10-23

- Read latest W07 commits through `ac7516a0`; no W07 delivery file exists yet.
- Baseline acceptance-owned `0dac8934` current ordinal 15. Running strict open/close/reopen/reload with zero revision POST assertion before product changes.
- First probe clicked a temporarily disabled Edit button; helper now waits for enablement instead of treating initial preview as an editor.
- Next: fix proven phantom versions, then strict two-edit/offline/fork/card/bar/theme checks. Shared draft/typecheck/full suite belong to parent.
- [实测] Phantom fixed: formatted collab hydration key ordering and first clean flush both covered. Strict `/tmp/codex-w07-open-fixed` exit0, 0 revisions POST through open/close/reopen/reload, rev18 unchanged.
- Current: strict two-real-edits + reopen/reload + offline retry; first two revisions POST200. Next fork/card/bar/theme acceptance and CODEX-W07.
- [实测] `/tmp/codex-w07-stable` 全协议exit0，真实2次编辑+offline retry共3版，rev22→25，重开和刷新样式均在。现正在fork/card/bar/theme验收收尾。
- [实测] fork/card收尾通过；现有light/dark文字/图片栏截图已复核、栏源码未改。交付 `verdicts/CODEX-W07.md`；84条focused判据通过。父负责共享栏独立验收/全量检查。

更新时间：2026-10-23 08:25Z（R2 接班）

## 已确认的事实

- [实测] bootstrap 通过；main。并发工程 bay-library-dashboard 的未提交文件不碰。
- [读码] 我的文件：`advanced-routes/DeckRoute.tsx`、`doc-editors/{Deck*,deck-*,use-deck-*}`、`doc-editors/pptx-deck-import.ts`；文案册 `editor-overhaul-copy-w07.ts`。
- [实测+提交] 统一栏规范 id、strike/highlight/list/link/justify、抽屉 模板/元素/画笔/线条/便签（da519f61、127c0df9）。
- [实测+提交] 缩略图栏 `data-edit-bar-avoid`；素材 adapter 只接图片（3a36b66a）。
- [实测+提交] 载入中占位稿拒绝改动（b4c3fead）；断网→保存失败→恢复点重试→已保存（5d42233a）。
- [实测+SQL] 自己库里的 deck：两次改动 = +2 revision，重开都在（journal 07:44Z）。
- [实测] /tmp/w07-f：公共模板打开 → 一次 `:fork`，地址栏切到副本 a67bdb59，第一次保存 saved；第二次改动后编辑器被换成库详情预览 + 「暂时无法加载我的库」→ 待复跑判定。
- [实测] /tmp/w07-d：深色下 rail 27,27,31 / 舞台 14,14,17 / 幻灯片原色；场景的「更多」选择器点到了隐藏的动画按钮 → 场景要修。

## 正在做

- R2：focused tests + i18n 闸；修 theme 场景，跑 light/dark 截图入 evidence。

## 下一步

1. 复跑 fork 场景（§5.3），SQL 核条目数。
2. 库卡片更新（§5.2）。
3. 按钮点测、抽屉点测。
4. tsc、交付。

## 复现命令

```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w07-x THEME=light node harness/run.mjs evidence/W07/scenarios/<场景>.mjs <artifactId> [tag]
```
