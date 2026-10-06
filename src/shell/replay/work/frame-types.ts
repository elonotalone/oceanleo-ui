// 工作回放的「一帧怎么画」：每个编辑器族在 frames/<族>.tsx 默认导出一个 ReplayFrameRenderer（或 null）。
// 唯一口径：oceandino docs/work-logs/2026-10/work-chat/01-interfaces.md §8.4。
import type { ComponentType } from "react";
import type { UITranslate } from "../../../i18n/ui/useUI";
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
  /**
   * 一句话说清这一步改了什么。必须用传进来的 `tt("中文模板 {n}", { n })` 出句，
   * 不许自己拼中文；`tt` 缺省（老调用、测试）时回落成中文原文。
   */
  describeChange?: (prev: unknown, next: unknown, tt?: UITranslate) => string | null;
  toArtifactJson?: (snapshot: unknown) => unknown;
}
