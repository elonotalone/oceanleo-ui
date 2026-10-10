"use client";

import { createElement, useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";

// Google <model-viewer> web component，按原站方式从官方 CDN 懒加载。不新增 npm 依赖。
const MV_SRC =
  "https://unpkg.com/@google/model-viewer@4.0.0/dist/model-viewer.min.js";

let mvPromise: Promise<void> | null = null;

function loadModelViewer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.customElements?.get("model-viewer")) return Promise.resolve();
  if (mvPromise) return mvPromise;
  mvPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = MV_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("model-viewer load failed"));
    document.head.appendChild(script);
  });
  return mvPromise;
}

export function BayModelViewer({
  src,
  poster,
  alt,
}: {
  src: string;
  poster?: string;
  alt?: string;
}) {
  const tt = useUI();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadModelViewer()
      .then(() => alive && setReady(true))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center text-sm text-stone-400">
        {tt("3D 预览加载失败，可点下方「下载」获取模型文件。")}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="relative flex h-[50vh] w-full items-center justify-center bg-stone-100">
        {poster ? (
          <img src={poster} alt="" className="max-h-full max-w-full object-contain opacity-60" />
        ) : null}
        <span className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white">
          {tt("3D 加载中…")}
        </span>
      </div>
    );
  }

  return createElement("model-viewer", {
    src,
    poster,
    alt,
    "camera-controls": true,
    "auto-rotate": true,
    "shadow-intensity": "1",
    exposure: "1",
    style: { width: "100%", height: "50vh", backgroundColor: "#f4f4f5" },
  });
}
