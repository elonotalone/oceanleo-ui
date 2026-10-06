"use client";

// 矢量图的回放画法（work-chat W13，契约 §8.4）：只画版本前后。
// SVG 只经 <img src="data:image/svg+xml;base64,…">（或已托管地址）显示：图片方式加载的 SVG 不执行脚本；
// 绝不把 SVG 插进 DOM，不用 iframe，不用 dangerouslySetInnerHTML。
import type { ReplayFrameProps, ReplayFrameRenderer } from "../frame-types";
import {
  vectorDescribeChange,
  vectorFromRevision,
  vectorImageSrc,
  vectorToArtifactJson,
  type VectorSnapshot,
} from "../../../collab/adapters/vector";

function VectorPane({ snapshot, width, height, outline }: { snapshot: VectorSnapshot | null; width: number; height: number; outline?: string }) {
  const src = vectorImageSrc(snapshot);
  return (
    <div style={{ width, height, display: "grid", placeItems: "center", background: "#fff", outline, outlineOffset: -2, boxSizing: "border-box" }}>
      {src ? <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : null}
    </div>
  );
}

function VectorFrame({ snapshot, prev, width, height, authorColor }: ReplayFrameProps) {
  const next = snapshot as VectorSnapshot | null;
  const before = (prev as VectorSnapshot | null | undefined) ?? null;
  if (!before) return <VectorPane snapshot={next} width={width} height={height} />;
  const half = Math.max(1, Math.floor((width - 8) / 2));
  return (
    <div data-replay-vector-frame="" style={{ width, height, display: "flex", gap: 8 }}>
      <VectorPane snapshot={before} width={half} height={height} />
      <VectorPane snapshot={next} width={half} height={height} outline={`2px solid ${authorColor || "#6d5dfc"}`} />
    </div>
  );
}

const renderer: ReplayFrameRenderer | null = {
  kind: "vector",
  fromRevision: (json) => vectorFromRevision(json),
  Frame: VectorFrame,
  describeChange: vectorDescribeChange,
  toArtifactJson: vectorToArtifactJson,
};

export default renderer;
