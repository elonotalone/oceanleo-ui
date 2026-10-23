# W06 state（PDF 编辑器，D4 + PDF 的 D6 D9 D11）

## 已确认的事实
- [实测] bootstrap 通过；仓 `oceanleo-ui` 在 `main`，W06 开工时 HEAD `377b212b`。
- [读码] 归我：`advanced-routes/PdfRoute.tsx`、`advanced-routes/mode-switch-gate.tsx`、`media-editors/{Pdf*,pdf-*,use-pdf-*}`、`media-editors/pdf-form/`、`collab/adapters/{pdf,use-pdf-collab}.ts`、新建 `media-editors/pdf-command-surface.ts`、`src/i18n/ui/messages/editor-overhaul-copy-w06.ts`。
- [待核] 无 `signals/*-to-W06.md`（开工时 signals/ 只有 roster 和别人的 state）。

## 正在做
- 第 1 步：读 EmbedPDF 2.15（`node_modules/@embedpdf/*`）能力 + 现有 PDF 路由代码，写可行方案到 journal。

## 下一步
- 选方案后在同一个查看器实例上重建基础编辑。

## 复现命令
- focused test：`cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`
