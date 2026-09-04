"use client";

import { createElement, useEffect, useRef, useState } from "react";
import type {
  Model3DNextViewState,
  ModelViewerCaptureHost,
} from "./model3d-next-plan";
import { cameraOrbitAttribute, hexToRgb01 } from "./model3d-next-plan";

/**
 * 普通模式舞台：@google/model-viewer。不自研渲染核。
 */
export function Model3DViewerStage({
  src,
  poster,
  view,
  accent = "#4f46e5",
  viewerHandleRef,
}: {
  src: string;
  poster?: string;
  view: Model3DNextViewState;
  accent?: string;
  viewerHandleRef?: { current: ModelViewerCaptureHost | null };
}) {
  const viewerRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.customElements?.get("model-viewer")),
  );

  useEffect(() => {
    if (ready || typeof window === "undefined") return;
    let alive = true;
    void import("@google/model-viewer")
      .then(() => {
        if (alive) setReady(Boolean(window.customElements?.get("model-viewer")));
      })
      .catch(() => {
        /* 加载失败由空舞台提示 */
      });
    return () => {
      alive = false;
    };
  }, [ready]);

  useEffect(() => {
    const viewer = viewerRef.current as
      | (HTMLElement & {
          model?: {
            materials?: Array<{
              pbrMetallicRoughness?: {
                setBaseColorFactor: (value: number[]) => void;
              };
            }>;
          };
        })
      | null;
    if (!viewer) return;
    const apply = () => {
      const material = viewer.model?.materials?.[0];
      material?.pbrMetallicRoughness?.setBaseColorFactor(
        hexToRgb01(view.materialColor),
      );
    };
    viewer.addEventListener("load", apply);
    apply();
    return () => viewer.removeEventListener("load", apply);
  }, [src, view.materialColor]);

  useEffect(() => {
    const viewer = viewerRef.current as
      | (HTMLElement & { style: CSSStyleDeclaration })
      | null;
    if (!viewer) return;
    viewer.style.opacity = view.nodeVisible ? "1" : "0.35";
  }, [view.nodeVisible]);

  if (!src) {
    return (
      <div
        className="grid h-full min-h-[280px] place-items-center text-sm text-[var(--muted,#78716c)]"
        data-testid="model3d-next-empty"
      >
        空白 3D 场景 · 导入 GLB / glTF
      </div>
    );
  }
  if (!ready) {
    return (
      <div
        className="grid h-full min-h-[280px] place-items-center text-sm text-[var(--muted,#78716c)]"
        data-testid="model3d-next-loading"
      >
        正在加载 3D 查看器…
      </div>
    );
  }

  return createElement("model-viewer", {
    ref: (node: HTMLElement | null) => {
      viewerRef.current = node;
      if (viewerHandleRef) {
        viewerHandleRef.current = node as ModelViewerCaptureHost | null;
      }
    },
    src,
    poster: poster || undefined,
    "camera-controls": true,
    "camera-orbit": cameraOrbitAttribute(view),
    exposure: String(view.exposure),
    "auto-rotate": view.autoRotate ? true : undefined,
    "shadow-intensity": view.nodeVisible ? "1" : "0",
    style: {
      width: "100%",
      height: "100%",
      minHeight: 280,
      background: view.background,
      accentColor: accent,
    },
    "data-testid": "model3d-next-viewer",
  });
}
