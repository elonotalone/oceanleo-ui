/**
 * 封面子系统的公开类型契约。
 *
 * 单独成文件是因为实现文件 `workspace-library-cover.tsx` 背着一条硬约束：它被渲染
 * 测试整体编译后以 data: URL 加载（tests/material-cover-rendering.test.mjs 的
 * `compileModule`、tests/untrusted-content-pdf-frame-host.test.mjs 的
 * `loadCoverModule`，两处都只改写 `react` / `react/jsx-runtime` 这两个 specifier），
 * 而 data: URL 解析不了相对 specifier，因此实现文件**不得有任何相对运行时依赖**
 * ——连 PDF 主机白名单那段都只能复制一份而不能 import。
 *
 * 类型声明是唯一能从那个文件里抽出来的东西：`import type` / `export type` 在
 * transpile 时被完整抹除，不落任何运行时 import，data: URL 加载路径不受影响。
 */

import type { ArtifactRendition } from "./artifact-contract";
import type { LibraryItem, LibraryKind } from "./library-data";

export type WorkspaceCoverRenderer =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "website"
  | "unavailable";

export type WorkspaceCoverFit = "cover" | "contain";

/**
 * 封面证据三态（派活合同 §3.2）。**不是布尔**：把「没证据」和「证实是占位图」
 * 混成同一个 false，正是 5 万份 SVG 与 7,013 份健康 webp 被判「封面不可用」的原因。
 *   real / unknown-metadata（元数据没写全，图本身没问题，照常显示只做弱化）/
 *   proven-placeholder（已证实是占位图，必须挡下）
 */
export type CoverEvidence = "real" | "unknown-metadata" | "proven-placeholder";

export interface CoverEvidenceReport {
  evidence: CoverEvidence;
  /** `code` 是稳定机器码（供 W2 投影与验收对齐），`reason` 是用户可见中文原文
   * （交 W10 落 17 语）。两者在 `real` 时都是空串。 */
  code: string;
  reason: string;
}

export interface WorkspaceCoverPlan {
  renderer: WorkspaceCoverRenderer;
  url: string;
  mediaType: string;
  format: string;
  fit: WorkspaceCoverFit;
  sourceAspectRatio: number | null;
  failureReason: string;
  coverEvidence: CoverEvidence;
  /** 三态里非 `real` 那两态的中文说明；`real` 时为空串。 */
  evidenceReason: string;
}

export interface WorkspaceCoverPlanInput {
  item?: LibraryItem;
  kind: LibraryKind;
  url?: string;
  rendition?: ArtifactRendition | null;
  /** A generated/legacy `thumbUrl` is an image declaration, not a source URL. */
  assumeImage?: boolean;
}
