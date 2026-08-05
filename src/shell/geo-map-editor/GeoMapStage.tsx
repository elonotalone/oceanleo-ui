"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
import {
  renderGeoMapToCanvas,
  type GeoMapFeatureCollection,
  type GeoMapRenderResult,
} from "./geo-map-render";
import { loadBuiltInGeoFeatures } from "../plugin-initial-states/data/index";
import {
  GEO_MAP_CONSTANTS,
  GEO_MAP_LAYOUT,
  GEO_MAP_PALETTE,
  GEO_MAP_TYPE_SCALE,
} from "./geo-map-advanced-controls";
import type { GeoMapWorkbenchState } from "./use-geo-map-workbench";

/** §4 C22 / WCAG 2.2 SC 2.5.8: every clickable target is at least 24 x 24 px. */
const HIT_AREA = {
  minWidth: `${GEO_MAP_CONSTANTS.hitTargetMinPx}px`,
  minHeight: `${GEO_MAP_CONSTANTS.hitTargetMinPx}px`,
};

function StageShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full min-h-[420px] place-items-center bg-[var(--surface,#f5f5f4)] p-6">
      {children}
    </div>
  );
}

function FailurePanel({
  tone,
  title,
  summary,
  details,
  hint,
}: {
  tone: "invalid" | "degraded";
  title: string;
  summary: string;
  details: readonly string[];
  hint: string;
}) {
  const invalid = tone === "invalid";
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`max-w-xl rounded-xl border p-5 text-left ${
        invalid
          ? "border-rose-300 bg-rose-50"
          : "border-amber-300 bg-amber-50"
      }`}
    >
      <p
        className={`font-semibold ${invalid ? "text-rose-800" : "text-amber-900"}`}
      >
        {title}
      </p>
      <p
        className={`mt-2 text-xs leading-relaxed ${
          invalid ? "text-rose-700" : "text-amber-800"
        }`}
      >
        {summary}
      </p>
      {details.length > 0 && (
        <ul
          className={`mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-white/70 p-3 font-mono text-[11px] leading-relaxed ${
            invalid ? "text-rose-900" : "text-amber-900"
          }`}
        >
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      <p
        className={`mt-3 text-[11px] leading-relaxed ${
          invalid ? "text-rose-700" : "text-amber-800"
        }`}
      >
        {hint}
      </p>
    </div>
  );
}

export function GeoMapStage({ editor }: { editor: GeoMapWorkbenchState }) {
  const tt = useUI();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [render, setRender] = useState<GeoMapRenderResult | null>(null);
  const [renderError, setRenderError] = useState("");
  const { project, state } = editor;
  const renderable = state === "ready" || state === "dirty" || state === "degraded";
  const [features, setFeatures] = useState<Record<
    string,
    GeoMapFeatureCollection
  > | null>(null);

  // 每个 source 的字节从哪来，只由它的 `dependencyPath` 决定；编辑相机、图层配色
  // 不该重取一遍底图，所以 effect 只盯这串路径，不盯 project 本身。
  const dependencyKey = project
    ? Object.entries(project.sources)
        .map(([key, source]) => `${key}=${source.dependencyPath}`)
        .sort()
        .join("|")
    : "";

  useEffect(() => {
    if (!dependencyKey) {
      setFeatures(null);
      return undefined;
    }
    let alive = true;
    setFeatures(null);
    // 内置底图随包发布，取字节不走网络，与沙箱的 `connect-src 'none'` 不冲突。
    // 取不到的 source 不会被补一个空要素集：渲染器照实把它记进 missingSourceKeys。
    void loadBuiltInGeoFeatures(project?.sources).then((next) => {
      if (alive) setFeatures(next);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 见上：只跟依赖路径走
  }, [dependencyKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project || !renderable) return;
    try {
      setRender(
        renderGeoMapToCanvas({
          project,
          canvas,
          width: GEO_MAP_LAYOUT.canvasWidthPx,
          height: GEO_MAP_LAYOUT.canvasHeightPx,
          chrome: true,
          ...(features ? { features } : {}),
        }),
      );
      setRenderError("");
    } catch (caught) {
      // A throwing renderer must never leave a blank surface behind.
      setRender(null);
      setRenderError(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  }, [project, renderable, features]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!editor.sourceReady) return;
      // WCAG 2.2 SC 2.1.1: pan, zoom, layer visibility and feature focus each
      // have a keyboard path, matching the four interactions named in §2.4.
      const handled = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      switch (event.key) {
        case "ArrowLeft":
          editor.panBy("left");
          return handled();
        case "ArrowRight":
          editor.panBy("right");
          return handled();
        case "ArrowUp":
          editor.panBy("up");
          return handled();
        case "ArrowDown":
          editor.panBy("down");
          return handled();
        case "+":
        case "=":
          editor.zoomBy(1);
          return handled();
        case "-":
        case "_":
          editor.zoomBy(-1);
          return handled();
        case "0":
          editor.fitToBasemap();
          return handled();
        case "[":
          editor.focusFeature(-1);
          return handled();
        case "]":
          editor.focusFeature(1);
          return handled();
        case "v":
        case "V":
          if (editor.activeLayerId) {
            editor.toggleLayerVisibility(editor.activeLayerId);
            return handled();
          }
          return undefined;
        default:
          return undefined;
      }
    },
    [editor],
  );

  if (state === "empty" || state === "parsing") {
    return (
      <StageShell>
        <p
          role="status"
          className="text-sm text-[var(--muted,#78716c)]"
        >
          {tt("正在读取结构化地图源…")}
        </p>
      </StageShell>
    );
  }

  if (state === "resolving") {
    return (
      <StageShell>
        <p role="status" className="text-sm text-[var(--muted,#78716c)]">
          {tt("正在解析依赖闭包与图层引用…")}
        </p>
      </StageShell>
    );
  }

  if (state === "invalid" || !project) {
    return (
      <StageShell>
        <FailurePanel
          tone="invalid"
          title={tt("地图编辑不可用")}
          summary={
            editor.failure?.summary ||
            editor.error ||
            tt("地图源未通过载入校验，编辑器已停止。")
          }
          details={editor.failure?.details ?? []}
          hint={tt(
            "非法源不会进入可编辑态，本地字节未被改写；修复源或依赖后重新打开。",
          )}
        />
      </StageShell>
    );
  }

  const title = project.metadata.title || tt("地图预览");
  const attribution = project.attribution.entries;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[var(--surface,#f5f5f4)] p-4">
      {state === "degraded" && (
        <FailurePanel
          tone="degraded"
          title={tt("依赖缺失，已降级为只渲底图")}
          summary={
            editor.failure?.summary ||
            tt("部分依赖件未随 revision 落库，数据层无法绘制。")
          }
          details={editor.failure?.details ?? []}
          hint={tt("降级态不可保存，否则会把缺依赖的状态写成新 revision。")}
        />
      )}
      {!features && !renderError && (
        <p
          role="status"
          className="rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2 text-[11px] text-[var(--muted,#78716c)]"
        >
          {tt("正在载入底图要素…")}
        </p>
      )}
      {(renderError ||
        (features && render && (render.missingSourceKeys.length > 0 || !render.ok))) && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"
        >
          {renderError ||
            tt("以下 source 键无法从依赖闭包取到数据，未绘制：{keys}", {
              keys: render?.missingSourceKeys.join("、") || "-",
            })}
        </p>
      )}
      <div className="mx-auto flex w-full max-w-6xl flex-1 min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] shadow-sm">
        <div
          role="application"
          tabIndex={0}
          aria-label={tt("地图视口：方向键平移，加减号缩放，V 切换图层，方括号切换要素")}
          onKeyDown={onKeyDown}
          className="relative flex-1 min-h-[420px] outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1F6FEB]"
          style={{ backgroundColor: GEO_MAP_PALETTE["map.land"] }}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={title}
            data-geo-map-engine="canvas2d"
            data-geo-map-state={state}
            width={GEO_MAP_LAYOUT.canvasWidthPx}
            height={GEO_MAP_LAYOUT.canvasHeightPx}
            className="h-full w-full"
          />
          <p role="status" aria-live="polite" className="sr-only">
            {editor.focusedAnnotationId
              ? tt("当前聚焦要素：{id}", { id: editor.focusedAnnotationId })
              : tt("未聚焦要素")}
          </p>
        </div>
        <div
          className="flex items-center justify-between gap-3 border-t border-[var(--border,#e7e5e4)] px-3"
          style={{
            height: `${GEO_MAP_LAYOUT.attributionBarHeightPx}px`,
            backgroundColor: GEO_MAP_PALETTE["map.land"],
          }}
        >
          <p
            // SC 1.4.3: attribution keeps map.label.primary on map.land at
            // 12.55:1 rather than trading contrast for a quieter footer.
            style={{
              color: GEO_MAP_PALETTE["map.label.primary"],
              fontSize: `${GEO_MAP_TYPE_SCALE.attribution.size}px`,
              lineHeight: `${GEO_MAP_TYPE_SCALE.attribution.lineHeight}px`,
            }}
            className="truncate"
          >
            {attribution
              .map((entry) => `${entry.text}（${entry.licenseCode}）`)
              .join(" · ")}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              style={HIT_AREA}
              onClick={() => editor.zoomBy(-1)}
              disabled={!editor.sourceReady}
              aria-label={tt("缩小")}
              className="rounded-lg border border-[var(--border,#e7e5e4)] px-2 text-xs disabled:opacity-50"
            >
              −
            </button>
            <span
              className="min-w-[3.5rem] text-center text-[11px] tabular-nums"
              style={{ color: GEO_MAP_PALETTE["map.label.primary"] }}
            >
              z{project.camera.zoom.toFixed(2)}
            </span>
            <button
              type="button"
              style={HIT_AREA}
              onClick={() => editor.zoomBy(1)}
              disabled={!editor.sourceReady}
              aria-label={tt("放大")}
              className="rounded-lg border border-[var(--border,#e7e5e4)] px-2 text-xs disabled:opacity-50"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
