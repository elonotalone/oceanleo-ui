"use client";

// 图片的回放画法（work-chat W13，契约 §8.4）。
// 现有渲染给不出位图（Fabric 画布需要浏览器画布与实例），所以画「对象布局缩略」：
// 每个对象一个外框；图片对象用 <img>（只认 http(s) 与位图 data URL），文字对象画文字，其余画外框；变化的对象用作者的颜色描边。
// 不执行任何用户 HTML/JS，不用 iframe，不用 dangerouslySetInnerHTML。
import type { CSSProperties } from "react";
import type { ReplayFrameProps, ReplayFrameRenderer } from "../frame-types";
import {
  imageBoxes,
  imageChangedObjects,
  imageDescribeChange,
  imageFromRevision,
  imageFromY,
  imageSafeSrc,
  imageToArtifactJson,
  type ImageSnapshot,
} from "../../../collab/adapters/image";

/** 颜色只认 #hex / rgb(a) / hsl(a) / 英文颜色名，防止把 url(...) 之类塞进样式。 */
function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return text;
  if (/^(rgb|hsl)a?\([0-9.,%\s/-]+\)$/i.test(text)) return text;
  if (/^[a-z]{3,20}$/i.test(text)) return text;
  return fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ImageFrame({ snapshot, prev, width, height, authorColor }: ReplayFrameProps) {
  const current = snapshot as ImageSnapshot | null;
  if (!current || !current.json || !current.doc) return <div style={{ width, height }} />;
  const before = prev && (prev as ImageSnapshot).json ? (prev as ImageSnapshot) : null;
  const scale = Math.min(width / Math.max(1, current.doc.width), height / Math.max(1, current.doc.height));
  const stageW = current.doc.width * scale;
  const stageH = current.doc.height * scale;
  const delta = before ? imageChangedObjects(before, current) : null;
  const color = authorColor || "#6d5dfc";
  return (
    <div style={{ width, height, display: "grid", placeItems: "center" }}>
      <div
        data-replay-image-frame=""
        style={{ position: "relative", width: stageW, height: stageH, overflow: "hidden", background: safeColor(current.canvasBackground, "#ffffff"), boxShadow: "0 0 0 1px rgba(0,0,0,.08)" }}
      >
        {imageBoxes(current).map((box) => {
          const raw = box.raw;
          const originX = raw.originX === "center" ? 50 : raw.originX === "right" ? 100 : 0;
          const originY = raw.originY === "center" ? 50 : raw.originY === "bottom" ? 100 : 0;
          const isChanged = Boolean(delta?.changed.has(box.id));
          const style: CSSProperties = {
            position: "absolute",
            left: box.x * scale,
            top: box.y * scale,
            width: Math.max(1, box.width * scale),
            height: Math.max(1, box.height * scale),
            transform: box.angle ? `rotate(${box.angle}deg)` : undefined,
            transformOrigin: `${originX}% ${originY}%`,
            opacity: Math.min(1, Math.max(0, num(raw.opacity, 1))),
            outline: isChanged ? `2px solid ${color}` : undefined,
            outlineOffset: 1,
            pointerEvents: "none",
            boxSizing: "border-box",
            overflow: "hidden",
          };
          if (box.kind === "image") {
            const src = imageSafeSrc(raw.src);
            return src ? (
              <img key={box.id} data-replay-object={box.id} src={src} alt="" style={{ ...style, objectFit: "fill" }} />
            ) : (
              <span key={box.id} data-replay-object={box.id} style={{ ...style, border: "1px dashed #a8a29e", background: "rgba(0,0,0,.04)" }} />
            );
          }
          if (box.kind === "text") {
            const fontSize = Math.max(4, num(raw.fontSize, 24) * num(raw.scaleY, 1) * scale);
            return (
              <span key={box.id} data-replay-object={box.id} style={{ ...style, color: safeColor(raw.fill, "#111111"), fontSize, lineHeight: 1.15, whiteSpace: "pre-wrap", fontWeight: num(raw.fontWeight, 400) >= 600 || raw.fontWeight === "bold" ? 700 : 400 }}>
                {typeof raw.text === "string" ? raw.text : ""}
              </span>
            );
          }
          const round = String(raw.type ?? "").toLowerCase() === "circle" || String(raw.type ?? "").toLowerCase() === "ellipse";
          return (
            <span
              key={box.id}
              data-replay-object={box.id}
              style={{
                ...style,
                background: box.kind === "shape" ? safeColor(raw.fill, "rgba(0,0,0,.08)") : "transparent",
                border: box.kind === "draw" ? `1px dashed ${safeColor(raw.stroke, "#78716c")}` : `1px solid ${safeColor(raw.stroke, "rgba(0,0,0,.2)")}`,
                borderRadius: round ? "50%" : 0,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

const renderer: ReplayFrameRenderer | null = {
  kind: "image",
  fromY: (doc) => imageFromY(doc),
  fromRevision: (json) => imageFromRevision(json),
  Frame: ImageFrame,
  describeChange: imageDescribeChange,
  toArtifactJson: imageToArtifactJson,
};

export default renderer;
