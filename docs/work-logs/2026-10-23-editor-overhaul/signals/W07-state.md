# W07 state — 演示（deck）

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
