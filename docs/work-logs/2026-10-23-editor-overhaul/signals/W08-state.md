# W08 state（文档 RichDoc / Tiptap）

更新：2026-10-23 第 1 批提交后

## 已确认的事实

- [实测] bootstrap 通过；`oceanleo-ui` 在 `main`。
- [实测 node] 旧 txt 写回把整篇压成一行、实体留在文件里；旧 md 写回把表格压成散字、列表写坏。已由 `doc-editors/rich-doc-text-delivery.ts` 修，`tests/richdoc-text-delivery.test.mjs` 7/7。
- [读码] 后端 DOCUMENT 合同 cover 顺序 preview → full → source，text/plain、text/markdown 在原生封面白名单；不送 preview 时 preview/thumbnail = full。
- [读码] `docx-export.ts`：`w:highlight` 写的是十六进制（OOXML 只认命名色）；`textStyle` 的 fontSize / fontFamily 没进 docx。
- [读码] 深色：`RICHDOC_CSS` 写死 `color:#1c1917`，而页面底用 `--card`（深色下 #1b1b1f）→ 深色下黑字压黑底。
- [读码] A-1 仲裁：`list`=none|bullet|ordered，`align`=left|center|right|justify，`font-family` value=当前字体；面板型规范项用 `slot:"inspector"`+`inspectorGroup:<规范 id>`。
- [待核] W03 `edit-bar-canon.ts` 未落地；W04 `artifactRevision.metadata` 透传未落地。

## 正在做

保存路径：txt/md/html 不画 PNG；`text_excerpt` 写进 meta（W04 透传落地后写进 `artifactRevision.metadata`）；docx 的高亮/字号/字体。

## 下一步

1. 深色正文（CSS token + 显示层颜色映射）。
2. 统一文字栏（等 W03 canon）。
3. 浏览器：保存协议基线与修后各一遍（验收账号）。

## 复现命令

```bash
cd /root/projects/oceanleo-ui
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/richdoc-text-delivery.test.mjs
```
