# W06 state（PDF 编辑器，D4 + PDF 的 D6 D9 D11）

## 已确认的事实
- [实测] bootstrap 通过；仓 `oceanleo-ui` 在 `main`。
- [读码] 方案与依赖面见 `signals/W06-journal.md`（EmbedPDF 能力、旧核依赖、保存基线、协同）。
- [读码] W03 的 `bar` / `edit-bar-canon.ts` 在 05:21Z 还没落地 ⇒ 先只出规范 id。
- [待核] 浏览器里：官方 UI 隐藏后选中菜单是否干净、`page-settings` 菜单哪几项有用、Ink/Stamp 存盘后外部阅读器可见。

## 方案（新文件，全部 < 600 行）
- `media-editors/pdf-viewer-bridge.ts`：包 registry（模式显隐、工具、缩放、页码、历史、导出、换文档、图章）。
- `media-editors/pdf-mark-tools.ts`：✓ / ✗ 自定义工具（标准 Ink）。
- `media-editors/pdf-signature-store.ts`：签名按用户 id 存 localStorage。
- `media-editors/PdfStage.tsx`（原地换）：唯一的 EmbedPDF 实例；基础 = 隐藏官方 UI，专业 = 显示。
- `media-editors/PdfControls.tsx`（原地换）：左侧缩略图栏，悬停旋转/删除，拖动排序。
- `media-editors/use-pdf-workbench.ts`（原地换）：源装载、脏标记、撤销（查看器历史 + 页面整理栈）、页面整理、保存（基线前移）、恢复、下载。
- `media-editors/PdfSelectionBar.tsx`：选中批注 / 激活工具 / 选字时的统一编辑栏；`PdfSignatureDialog.tsx`、`PdfFindBar.tsx`。
- `media-editors/pdf-command-surface.ts`：agent 指令面（只暴露新能力）。
- `advanced-routes/PdfRoute.tsx` 重写；删 `mode-switch-gate.tsx` 与旧核。

## 正在做
- 第 2 步：写 bridge / mark tools / signature store（纯模块）+ 单测。

## 下一步
- PdfStage / PdfControls / use-pdf-workbench / PdfRoute 接线 → 类型检查 → 浏览器。

## 复现命令
- focused test：`cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`
