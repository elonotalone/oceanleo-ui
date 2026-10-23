# W07 state — 演示（deck）

更新时间：2026-10-23（开工）

## 已确认的事实

- [实测] bootstrap 通过；git 在 main，开工时工作区干净（HEAD 60b0d1dc）。
- [读码] 我的文件：`advanced-routes/DeckRoute.tsx`、`doc-editors/{Deck*,deck-*,use-deck-*}`、`doc-editors/pptx-deck-import.ts`；文案册 `src/i18n/ui/messages/editor-overhaul-copy-w07.ts`（空）。
- [读码] `use-deck-editor.ts` 2993 行、`DeckRoute.tsx` 618 行、`DeckContextToolbar.tsx` 543 行：都不许再明显变大，新逻辑抽新模块。

## 正在做

- 读码：DeckContextToolbar / deck-toolbar-command / DeckRoute / use-deck-editor 的选区与保存路径；W03 的接口（`bar`、`edit-bar-canon.ts`）是否已落地。

## 下一步

1. 浏览器跑一遍现状（light/dark 截图 + 保存协议首轮）。
2. 控件改规范 id + 补齐文字项。
3. 深色浅色岛清理。
4. 素材插入、抽屉确认。

## 复现命令

```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w07-x THEME=light node harness/run.mjs evidence/W07/scenarios/<场景>.mjs
```
