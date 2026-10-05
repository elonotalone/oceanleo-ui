// 工作回放的「一帧怎么画」：每个编辑器族在 frames/<族>.tsx 默认导出一个 ReplayFrameRenderer（或 null）。
// 唯一口径：oceandino docs/work-logs/2026-10/work-chat/01-interfaces.md §8.4。
import type { ComponentType } from "react";
import type { ImEditorKind } from "../../../lib/im/types";

export interface ReplayFrameProps {
  snapshot: unknown;
  prev?: unknown;
  width: number;
  height: number;
  authorColor?: string;
}

export interface ReplayFrameRenderer {
  kind: ImEditorKind;
  /** doc 是 Y.Doc。 */
  fromY?: (doc: unknown) => unknown;
  fromRevision?: (json: unknown) => unknown;
  Frame: ComponentType<ReplayFrameProps>;
  describeChange?: (prev: unknown, next: unknown) => string | null;
  toArtifactJson?: (snapshot: unknown) => unknown;
}
