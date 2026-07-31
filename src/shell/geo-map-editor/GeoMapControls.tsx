"use client";

import { useUI } from "../../i18n/ui/useUI";
import {
  GEO_MAP_CONSTANTS,
  GEO_MAP_PALETTE,
  geoMapLegendPatternObligation,
} from "./geo-map-advanced-controls";
import type { GeoMapWorkbenchState } from "./use-geo-map-workbench";

const HIT_AREA = {
  minWidth: `${GEO_MAP_CONSTANTS.hitTargetMinPx}px`,
  minHeight: `${GEO_MAP_CONSTANTS.hitTargetMinPx}px`,
};

export function GeoMapControls({ editor }: { editor: GeoMapWorkbenchState }) {
  const tt = useUI();
  const project = editor.project;
  const patterns = project ? geoMapLegendPatternObligation(project) : null;
  return (
    <fieldset
      disabled={editor.loading || editor.saving || !editor.sourceReady}
      className="min-h-full space-y-4 overflow-y-auto bg-[var(--card,#fff)] p-4 text-[11px] text-[var(--fg-2,#57534e)] disabled:opacity-60"
    >
      <section className="space-y-2">
        <p className="font-semibold text-[var(--fg,#292524)]">{tt("图层")}</p>
        {!project?.layers.length && (
          <p className="text-[var(--muted,#78716c)]">{tt("尚未载入图层。")}</p>
        )}
        <ul className="space-y-1">
          {project?.layers.map((layer) => {
            const visible = (layer.layout?.visibility ?? "visible") === "visible";
            const active = layer.id === editor.activeLayerId;
            return (
              <li key={layer.id} className="flex items-center gap-2">
                <button
                  type="button"
                  style={HIT_AREA}
                  aria-pressed={active}
                  onClick={() => editor.selectLayer(layer.id)}
                  className={`flex-1 truncate rounded-xl border px-2.5 py-2 text-left focus-visible:ring-2 focus-visible:ring-[#1F6FEB] ${
                    active
                      ? "border-[#1F6FEB] bg-[#1F6FEB0F]"
                      : "border-[var(--border,#e7e5e4)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
                  }`}
                >
                  <span className="font-mono">{layer.id}</span>
                  <span className="ml-2 text-[10px] text-[var(--muted,#78716c)]">
                    {layer.type}
                  </span>
                </button>
                <button
                  type="button"
                  style={HIT_AREA}
                  aria-pressed={visible}
                  aria-label={tt("切换图层可见性：{id}", { id: layer.id })}
                  onClick={() => editor.toggleLayerVisibility(layer.id)}
                  className="rounded-xl border border-[var(--border,#e7e5e4)] px-2 focus-visible:ring-2 focus-visible:ring-[#1F6FEB]"
                >
                  {visible ? tt("显示") : tt("隐藏")}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
          {tt(
            "视口内：方向键平移、加减号缩放、0 回到底图比例尺、V 切换当前图层、方括号切换要素焦点。",
          )}
        </p>
      </section>

      <section className="space-y-2">
        <p className="font-semibold text-[var(--fg,#292524)]">{tt("图例")}</p>
        <ul className="space-y-1">
          {project?.legend?.entries.map((entry) => (
            <li key={entry.label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-sm border border-[var(--border,#e7e5e4)]"
                style={{ backgroundColor: entry.swatch }}
              />
              <span className="flex-1 truncate">{entry.label}</span>
              <span className="text-[10px] text-[var(--muted,#78716c)]">
                {entry.pattern || "solid"}
              </span>
            </li>
          ))}
        </ul>
        {patterns?.required && !patterns.satisfied && (
          <p role="alert" className="text-rose-600">
            {tt(
              "序列数 {count} ≥ 3，图例必须至少给出 2 种 pattern，颜色不得是唯一区分手段。",
              { count: String(patterns.seriesCount) },
            )}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <p className="font-semibold text-[var(--fg,#292524)]">
          {tt("依赖闭包")}
        </p>
        <p>
          {tt("已解析 {resolved}/{declared} 件", {
            resolved: String(editor.closure.resolvedDependencies),
            declared: String(editor.closure.declaredDependencies),
          })}
        </p>
        {editor.closure.missingDependencies.length > 0 && (
          <ul
            role="alert"
            className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-amber-50 p-2 font-mono text-[10px] text-amber-900"
          >
            {editor.closure.missingDependencies.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-1">
        <p className="font-semibold text-[var(--fg,#292524)]">
          {tt("署名与许可")}
        </p>
        {project?.attribution.entries.map((entry) => (
          <p key={entry.text} className="truncate">
            <span style={{ color: GEO_MAP_PALETTE["map.label.primary"] }}>
              {entry.text}
            </span>
            <span className="ml-1 text-[10px] text-[var(--muted,#78716c)]">
              {entry.licenseCode}
            </span>
          </p>
        ))}
      </section>

      {(editor.error || editor.notice) && (
        <p
          role={editor.error ? "alert" : "status"}
          className={editor.error ? "text-rose-600" : "text-emerald-600"}
        >
          {editor.error || editor.notice}
        </p>
      )}
    </fieldset>
  );
}
