"use client";

// ============================================================================
// @oceanleo/ui — KaTeX 的**唯一**入口
// ----------------------------------------------------------------------------
// 合同 R6：长图与对话正文用同一个公式渲染器。所以 `Markdown.tsx`（正文）与
// `share-math.ts`（长图）都只经这里拿 KaTeX，不各自 import——否则两边的选项一漂移，
// 同一条公式在图上和在页面上就会长得不一样。
//
// 全程动态 import：没有公式的会话一个字节都不下载。
// ============================================================================

/**
 * 只暴露 `render`（往元素里建 DOM），**不暴露** `renderToString`（吐 HTML 字符串）。
 * 仲裁 A-2：公式串来自用户对话，拿到 HTML 字符串就迟早有人把它塞进 `innerHTML`；
 * 类型上没有这个方法，这条路在源码级就不存在。
 */
export type KatexModule = {
  render: (
    tex: string,
    element: HTMLElement,
    options?: Record<string, unknown>,
  ) => void;
};

/** 正文与长图共用的一组渲染选项。`trust:false` 禁掉 `\href`/`\url` 之类的注入面。 */
export const KATEX_OPTIONS = {
  throwOnError: false,
  errorColor: "#dc2626",
  output: "html",
  trust: false,
  strict: "ignore",
} as const;

let cached: Promise<KatexModule | null> | null = null;

export function loadKatex(): Promise<KatexModule | null> {
  if (!cached) {
    cached = (async () => {
      try {
        const [katex] = await Promise.all([
          import("katex"),
          import("./katex-styles"),
        ]);
        const module = (katex as { default?: KatexModule }).default ??
          (katex as unknown as KatexModule);
        return typeof module?.render === "function" ? module : null;
      } catch {
        return null;
      }
    })();
  }
  return cached;
}

/** 内容里有没有公式——决定要不要为这条消息付出加载 KaTeX 的代价。 */
export function hasMathDelimiters(content: string): boolean {
  const text = String(content || "");
  if (!text.includes("$")) return false;
  return /\$\$[\s\S]+?\$\$/.test(text) || /(?<!\\)\$[^$\n]+?(?<!\\)\$/.test(text);
}
