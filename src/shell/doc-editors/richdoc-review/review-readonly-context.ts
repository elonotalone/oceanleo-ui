import { createContext } from "react";

/**
 * 协同只读状态。走独立模块而不是挂在侧栏文件上：
 * `RichDocCommentRail.tsx` 被若干路由桩整文件替换，桩只导出组件本身；
 * 路由再从侧栏文件 import 这个 context 会在加载时直接 SyntaxError。
 * 「只读」不是引擎 API 的成员，也不进侧栏那 12 个 prop（接线表钉死）。
 */
export const RichDocReviewReadOnlyContext = createContext(false);
