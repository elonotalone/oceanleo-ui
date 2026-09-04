"use client";

/**
 * 新核 L2：出图 / 自转。完整镜头表（Model3DDirectorPanel）仍挂在旧核
 * Model3DControls 上，不删。新核普通模式用 model-viewer 的 toBlob / auto-rotate，
 * 不另写场景图。
 */
import type { RefObject } from "react";
import { useState } from "react";
import {
  applyModel3DNextControl,
  captureModelViewerFourViews,
  captureModelViewerPng,
  type Model3DNextViewState,
  type ModelViewerCaptureHost,
} from "./model3d-next-plan";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function Model3DNextDirector({
  view,
  onView,
  viewerRef,
  disabled = false,
}: {
  view: Model3DNextViewState;
  onView: (next: Model3DNextViewState) => void;
  viewerRef: RefObject<ModelViewerCaptureHost | null>;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState("");
  const busy = disabled;
  return (
    <div className="space-y-3 p-3" data-testid="model3d-next-director">
      <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
        出图与自转
      </p>
      <p className="text-[10px] text-[var(--muted,#78716c)]">
        普通模式用查看器出图。专业模式里 three.js editor 自己的渲染才是完整镜头表。
      </p>
      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span>自动旋转</span>
        <input
          type="checkbox"
          checked={view.autoRotate}
          disabled={busy}
          onChange={() =>
            onView(
              applyModel3DNextControl(view, {
                requestId: "director-auto-rotate",
                selectionId: "active-model",
                controlId: "auto-rotate",
                value: !view.autoRotate,
              }),
            )
          }
        />
      </label>
      <button
        type="button"
        disabled={busy}
        data-testid="model3d-next-capture"
        className="w-full rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-2 text-[11px] disabled:opacity-40"
        onClick={() => {
          void captureModelViewerPng(viewerRef.current)
            .then((blob) => {
              triggerDownload(blob, "model-view.png");
              setStatus("已下载当前视角 PNG。");
            })
            .catch((error) => {
              setStatus(error instanceof Error ? error.message : "出图失败");
            });
        }}
      >
        下载当前视角
      </button>
      <button
        type="button"
        disabled={busy}
        data-testid="model3d-next-four-views"
        className="w-full rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-2 text-[11px] disabled:opacity-40"
        onClick={() => {
          void captureModelViewerFourViews(viewerRef.current)
            .then((blobs) => {
              blobs.forEach((blob, index) => {
                triggerDownload(blob, `model-view-${index + 1}.png`);
              });
              setStatus("已按前/右/后/左四视角各出一张。");
            })
            .catch((error) => {
              setStatus(error instanceof Error ? error.message : "四视角出图失败");
            });
        }}
      >
        出图（四视角）
      </button>
      {status ? (
        <p className="text-[10px] text-[var(--muted,#78716c)]">{status}</p>
      ) : null}
    </div>
  );
}
