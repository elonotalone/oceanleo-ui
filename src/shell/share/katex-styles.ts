// KaTeX 的样式表只在真的要渲染公式时才加载：这里是**唯一**的引入点，
// 由 `katex-runtime.ts` 动态 import 进来，因此 30 多个站的首屏包不会因此变大。
// 先例见 `shell/OrgCanvas.tsx` 对 `@xyflow/react/dist/style.css` 的同款处理。
import "katex/dist/katex.min.css";

/** 导出一个常量，免得打包器把「只有副作用」的模块摇掉。 */
export const KATEX_STYLES_LOADED = true;
