// pdf 的回放画法，由 W14 实现（work-chat 契约 §8.4；做法见 tasks/_EDITORS.md 第 8 条）。
// 默认导出 null 时，播放器用通用的「改之前 / 改之后」画法。
import type { ReplayFrameRenderer } from "../frame-types";

const renderer: ReplayFrameRenderer | null = null;

export default renderer;
