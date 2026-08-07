// 手写声明，配合 `./pptx-preview.es.js`（由 scripts/vendor-pptx-preview.mjs 生成）。
//
// 上游 `pptx-preview/dist/index.d.ts` 的 `init` 返回 `PPTXPreviewer` 类，那棵声明树散在
// 上游包的十几个 `.d.ts` 里，而 `pptx-preview` 在本包已降为 devDependency，消费站装不到
// 它 —— 所以这里只声明调用面。调用方 `src/shell/library-viewers.tsx` 自己有一份
// `PptxPreviewInstance` 结构接口，照旧 `as unknown as` 收窄。

export interface VendoredPptxPreviewOptions {
  renderer?: string;
  width?: number;
  height?: number;
  mode?: "list" | "slide";
}

export declare function init(
  dom: HTMLElement,
  options: VendoredPptxPreviewOptions,
): unknown;
