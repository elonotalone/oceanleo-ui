"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
} from "../selection-context";
import type { GeoMapProject } from "./geo-map-schema";
import {
  GEO_MAP_PALETTE,
  applyGeoMapAdvancedCommand,
  geoMapAdvancedControls,
} from "./geo-map-advanced-controls";
import type { GeoMapWorkbenchState } from "./use-geo-map-workbench";

const PROJECTION_OPTIONS = [
  { value: "mercator", label: "墨卡托" },
  { value: "equirectangular", label: "等距圆柱" },
  { value: "albers", label: "阿尔伯斯" },
  { value: "globe", label: "球面" },
] as const;

const BASEMAP_PROVIDER_OPTIONS = [
  { value: "natural-earth", label: "Natural Earth" },
  { value: "nasa-gibs", label: "NASA GIBS" },
  { value: "none", label: "无底图" },
] as const;

const SCALE_BAND_OPTIONS = ["1:10m", "1:50m", "1:110m"] as const;

const LEGEND_POSITION_OPTIONS = [
  { value: "top-left", label: "左上" },
  { value: "top-right", label: "右上" },
  { value: "bottom-left", label: "左下" },
  { value: "bottom-right", label: "右下" },
] as const;

export function GeoMapContextToolbar({
  editor,
  accent = GEO_MAP_PALETTE["map.accent.1"],
}: {
  editor: GeoMapWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const project = editor.project;
  const activeLayer =
    project?.layers.find((layer) => layer.id === editor.activeLayerId) ||
    project?.layers[0];

  const context = useMemo<SelectionContext | null>(() => {
    if (!project) return null;
    const controls: SelectionControl[] = [
      {
        id: "title",
        kind: "text",
        label: tt("标题"),
        value: project.metadata.title,
        slot: "inspector",
        inspectorGroup: "geo-map-metadata",
        inspectorLabel: tt("标题"),
        inspectorIcon: "text",
      },
      {
        id: "subtitle",
        kind: "text",
        label: tt("副标题"),
        value: project.metadata.subtitle || "",
        placement: "more",
        slot: "inspector",
        inspectorGroup: "geo-map-metadata",
        inspectorLabel: tt("标题"),
        inspectorIcon: "text",
      },
      {
        id: "projection-name",
        kind: "select",
        label: tt("投影"),
        icon: "position",
        iconOnly: true,
        group: "geo-map-projection",
        value: project.projection.name,
        options: PROJECTION_OPTIONS.map((entry) => ({
          value: entry.value,
          label: tt(entry.label),
        })),
      },
      {
        id: "basemap-provider",
        kind: "select",
        label: tt("底图来源"),
        value: project.basemap.provider,
        options: BASEMAP_PROVIDER_OPTIONS.map((entry) => ({
          value: entry.value,
          label: entry.label,
        })),
        slot: "inspector",
        inspectorGroup: "geo-map-basemap",
        inspectorLabel: tt("底图"),
        inspectorIcon: "image",
      },
      {
        id: "basemap-scale-band",
        kind: "select",
        label: tt("比例尺档"),
        value: project.basemap.scaleBand,
        options: SCALE_BAND_OPTIONS.map((value) => ({ value, label: value })),
        slot: "inspector",
        inspectorGroup: "geo-map-basemap",
        inspectorLabel: tt("底图"),
        inspectorIcon: "image",
      },
      {
        id: "legend-position",
        kind: "select",
        label: tt("图例位置"),
        value: project.legend?.position || "bottom-right",
        options: LEGEND_POSITION_OPTIONS.map((entry) => ({
          value: entry.value,
          label: tt(entry.label),
        })),
        slot: "inspector",
        inspectorGroup: "geo-map-legend",
        inspectorLabel: tt("图例"),
        inspectorIcon: "layers",
      },
      {
        id: "legend-title",
        kind: "text",
        label: tt("图例标题"),
        value: project.legend?.title || "",
        placement: "more",
        slot: "inspector",
        inspectorGroup: "geo-map-legend",
        inspectorLabel: tt("图例"),
        inspectorIcon: "layers",
      },
    ];
    if (project.layers.length > 1) {
      controls.push({
        id: "layer-selector",
        kind: "select",
        label: tt("当前图层（单选）"),
        icon: "layers",
        iconOnly: true,
        group: "geo-map-layer",
        value: activeLayer?.id || "",
        options: project.layers.map((layer) => ({
          value: layer.id,
          label: layer.id,
        })),
      });
    }
    if (activeLayer) {
      controls.push({
        id: `layer:${activeLayer.id}:visible`,
        kind: "toggle",
        label: tt("图层可见"),
        icon: "select",
        iconOnly: true,
        group: "geo-map-layer",
        value: (activeLayer.layout?.visibility ?? "visible") === "visible",
      });
    }
    controls.push(...geoMapAdvancedControls(project, activeLayer, tt));
    return {
      version: 1,
      kind: activeLayer ? "geo-map-layer" : "geo-map",
      id: activeLayer ? `geo-map-layer:${activeLayer.id}` : "geo-map",
      label: activeLayer?.id || tt("地图"),
      revision: editor.editRevision,
      controls,
    };
  }, [accent, activeLayer, editor.editRevision, project, tt]);

  if (!context || !project) return null;

  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    if (
      message.selectionRevision !== undefined &&
      message.selectionRevision !== editor.editRevision
    ) {
      return;
    }
    if (message.transactionId && message.phase !== "commit") return;
    if (applyGeoMapAdvancedCommand(editor, project, message)) return;
    if (message.controlId === "title") {
      editor.setTitle(String(message.value ?? ""));
      return;
    }
    if (message.controlId === "subtitle") {
      editor.setSubtitle(String(message.value ?? ""));
      return;
    }
    if (message.controlId === "projection-name") {
      const name = String(message.value);
      if (PROJECTION_OPTIONS.some((entry) => entry.value === name)) {
        editor.setProjection({
          name: name as GeoMapProject["projection"]["name"],
        });
      }
      return;
    }
    if (message.controlId === "basemap-provider") {
      const provider = String(message.value);
      if (BASEMAP_PROVIDER_OPTIONS.some((entry) => entry.value === provider)) {
        editor.setBasemap({
          provider: provider as GeoMapProject["basemap"]["provider"],
        });
      }
      return;
    }
    if (message.controlId === "basemap-scale-band") {
      const band = String(message.value);
      if ((SCALE_BAND_OPTIONS as readonly string[]).includes(band)) {
        editor.setBasemap({
          scaleBand: band as GeoMapProject["basemap"]["scaleBand"],
        });
      }
      return;
    }
    if (message.controlId === "legend-position") {
      const position = String(message.value);
      if (LEGEND_POSITION_OPTIONS.some((entry) => entry.value === position)) {
        editor.setLegend({
          position: position as NonNullable<
            GeoMapProject["legend"]
          >["position"],
        });
      }
      return;
    }
    if (message.controlId === "legend-title") {
      editor.setLegend({ title: String(message.value ?? "").slice(0, 120) });
      return;
    }
    if (message.controlId === "layer-selector") {
      const next = String(message.value || "");
      if (project.layers.some((layer) => layer.id === next)) {
        editor.selectLayer(next);
      }
      return;
    }
    const visibility = /^layer:([a-z][a-z0-9_-]{0,63}):visible$/.exec(
      message.controlId,
    );
    if (visibility) {
      const layer = project.layers.find((entry) => entry.id === visibility[1]);
      const visible = (layer?.layout?.visibility ?? "visible") === "visible";
      if (layer && visible !== (message.value === true)) {
        editor.toggleLayerVisibility(layer.id);
      }
    }
  };

  return (
    <SelectionToolbar context={context} onCommand={command} accent={accent} />
  );
}
