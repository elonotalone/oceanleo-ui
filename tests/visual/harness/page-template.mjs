// ============================================================================
// 夹具页外壳
// ----------------------------------------------------------------------------
// 只链**产物** `src/theme/ui.css`——那正是 31 个租户站在生产里加载的那一份
// （`_ui-input.css` = tailwindcss + globals.css，见该文件抬头）。
// 刻意不链 `globals.css` 源文件：闸要断言的是「用户浏览器里最终解析出来的值」，
// 不是「源文件里写了什么」。源文件层面的断言归 W01 的
// `tests/motion-tokens.test.mjs`，两道闸各守一层，不重叠。
//
// ⚠️ `ui.css` 是 `npm run build:css` 的产物。本套件**不跑** build:css，因为那会
// 改写 `src/theme/*.css` 两份产品源码，而 W10 的硬红线是不碰产品源码。
// 因此 token 缺失时的第一诊断是「W01 生成了没有、build:css 跑了没有」，
// 运行手册的「假阳性」一节写了这条。
// ============================================================================

/** 字体锁定：容器内只认这一族，避免宿主字体差异把基线染红。 */
const FONT_STACK =
  '"DejaVu Sans", "Noto Sans CJK SC", "Liberation Sans", sans-serif';

export function renderPage({ title, bodyHtml, caseId, owner }) {
  return `<!doctype html>
<html lang="zh-CN" data-leo-motion-test="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1280, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/__css/ui.css">
<style>
  /* 夹具自身的版面，刻意极简：任何视觉差异都应该来自被测组件，不是来自这层。 */
  html, body { margin: 0; padding: 0; background: #fff; font-family: ${FONT_STACK}; }
  /* 字体平滑在不同 GPU 上不一致，是截图闸最经典的假阳性源。钉死它。 */
  * { -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
  #leo-stage { padding: 32px; display: flow-root; }
  .leo-case-slot { margin: 0 0 24px; }
  .leo-case-slot:last-child { margin-bottom: 0; }
  /* 主体缺席时的占位。它长这样是为了在基线图里一眼可辨，不会被误当成正常渲染。 */
  .leo-missing {
    font: 600 13px/1.6 ${FONT_STACK};
    color: #b42318; background: #fef3f2; border: 1px dashed #f97066;
    padding: 12px 16px; border-radius: 8px; white-space: pre-wrap;
  }
  /* 「在位但静态夹具渲染不出」。**刻意与缺席不同色**：红=owner 还没交，
     琥珀=闸覆盖不到。两者在截图与人眼复核里都必须一眼分得开，
     否则已经交卷的人会被当成欠账的人。 */
  .leo-needs-client {
    font: 600 13px/1.6 ${FONT_STACK};
    color: #93370d; background: #fffaeb; border: 1px dashed #f79009;
    padding: 12px 16px; border-radius: 8px; white-space: pre-wrap;
  }
</style>
</head>
<body data-leo-case="${escapeHtml(caseId)}" data-leo-owner="${escapeHtml(owner)}">
<div id="leo-stage">${bodyHtml}</div>
<script src="/__client/harness.js"></script>
</body>
</html>`;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
