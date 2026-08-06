// R4: 压 `humanErrorMessage` 的判据。
//
// 判据是「这句话里有没有汉字」。它是**单向**的：没有汉字的一律拦下换成兜底中文，
// 有汉字的一律放行。所以它对「英文技术原文」是密不透风的，对「中文技术原文」是
// 完全敞开的。这个脚本把两侧的真实语料各喂一遍，把敞开的那一侧点名列出来，
// 免得交付里只剩一句「大体够用」。
//
// 语料来源全是实测，不是编的：
//   - 浏览器原话：`w4-browser-fetch-message.mjs` 在真 Chromium 里读到的
//   - 网关错误体：2026-08-06 对 api.oceanleo.com 匿名 curl 读到的
//   - 仓内中文技术串：`rg 'throw new Error\("[^"]*[\u4e00-\u9fff]'` 捞出来的原文
import { humanErrorMessage } from "../../src/shell/human-error-message.ts";

const FALLBACK = "【兜底中文】";

// 被拦下的每一条都会 `console.warn` 一份原文（那正是它该做的）。这里只看结论表，
// 所以把这条噪音收掉，免得几十行堆栈把读数淹了。
console.warn = () => {};

const corpus = [
  // ── 英文技术原文：判据应当全部拦下 ────────────────────────────────────
  { source: "浏览器 · fetch 传输层失败", text: "Failed to fetch" },
  { source: "浏览器 · 全屏被拒", text: "Permissions check failed" },
  {
    source: "运行时 · 宿主编辑器",
    text: "Cannot read properties of undefined (reading 'id')",
  },
  { source: "网关 404 · items/<不存在>", text: "invalid artifact identity" },
  { source: "网关 401 · 匿名取下载授权", text: "missing bearer token" },
  { source: "网关 404 · detail 字段", text: "Not Found" },

  // ── 我们自己的中文文案：判据应当全部放行 ──────────────────────────────
  { source: "我们自己写的", text: "连不上素材服务，请检查网络后重试。" },
  { source: "我们自己写的", text: "这份素材已经不在了，可能已被删除或改版。" },

  // ── 中文技术原文：判据放行，但读者看不懂 —— 这就是那个洞 ────────────────
  {
    source: "WorkspaceLibrary.tsx:289（本轮四份文件之内，被判据表达式钉住）",
    text: "当前工作区没有注册 typed Edit route。",
    technical: true,
  },
  {
    source: "WorkspaceLibrary.tsx:227（同上）",
    text: "当前编辑器没有注册素材命令执行器。",
    technical: true,
  },
  {
    source: "advanced-session.ts:396（本轮边界之外）",
    text: "durable revision commit 缺少 pinned source revision。",
    technical: true,
  },
  {
    source: "material-library-view.tsx:608（本轮边界之外）",
    text: "当前 revision 缺少可验证的编辑器 source。",
    technical: true,
  },
  {
    source: "MyLibrary.tsx:847（本轮边界之外）",
    text: "缺少 durable artifact identity，不能按 URL 猜测删除对象。",
    technical: true,
  },
];

const rows = corpus.map((entry) => {
  const shown = humanErrorMessage(new Error(entry.text), FALLBACK);
  const passedThrough = shown !== FALLBACK;
  return {
    source: entry.source,
    抛出的原文: entry.text,
    用户看到: shown,
    判据放行: passedThrough,
    // 放行了、却是技术原文 —— 判据没拦住的就是这些
    漏网: passedThrough && entry.technical === true,
  };
});

console.log(JSON.stringify(rows, null, 2));
console.log(
  JSON.stringify(
    {
      英文技术原文_全部拦下: corpus
        .filter((e) => !/[\u3400-\u9fff]/.test(e.text))
        .every((e) => humanErrorMessage(new Error(e.text), FALLBACK) === FALLBACK),
      中文技术原文_漏网条数: rows.filter((r) => r.漏网).length,
    },
    null,
    2,
  ),
);
