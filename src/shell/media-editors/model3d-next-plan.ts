/**
 * 新核普通模式的 L1/L2 控件表。纯函数，测试直接调。
 * 控件 id 与旧核浮条同源：azimuth / elevation / zoom / exposure /
 * background / material-color / node-visible / auto-rotate / reset-camera。
 */
import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
} from "../selection-context-types";
import { MODEL3D_STAGE_TOKENS } from "./model3d-framing.mjs";
import { DEFAULT_MODEL3D_VIEW } from "./model3d-workbench-defaults";
import { MODEL3D_SELECTION_KIND } from "./model3d-next-l4-chips";

const inspector = (
  group: string,
  label: string,
  icon: SelectionControl["inspectorIcon"],
) => ({
  slot: "inspector" as const,
  inspectorGroup: group,
  inspectorLabel: label,
  inspectorIcon: icon,
});

export interface Model3DNextViewState {
  azimuth: number;
  elevation: number;
  zoom: number;
  autoRotate: boolean;
  exposure: number;
  background: string;
  materialColor: string;
  nodeVisible: boolean;
  selectedNodeName: string;
  revision: number;
}

export function defaultModel3DNextView(): Model3DNextViewState {
  return {
    azimuth: DEFAULT_MODEL3D_VIEW.azimuth,
    elevation: DEFAULT_MODEL3D_VIEW.elevation,
    zoom: DEFAULT_MODEL3D_VIEW.zoom,
    autoRotate: DEFAULT_MODEL3D_VIEW.autoRotate,
    exposure: DEFAULT_MODEL3D_VIEW.exposure,
    background: DEFAULT_MODEL3D_VIEW.background,
    materialColor: "#ffffff",
    nodeVisible: true,
    selectedNodeName: "",
    revision: 0,
  };
}

export const MODEL3D_NEXT_L1_CONTROL_IDS = [
  "azimuth",
  "elevation",
  "zoom",
  "exposure",
  "background",
  "material-color",
  "node-visible",
  "auto-rotate",
  "reset-camera",
] as const;

export function model3dNextSelectionContext(
  view: Model3DNextViewState,
): SelectionContext {
  const viewGroup = inspector("model-camera", "编辑器相机", "position");
  const lookGroup = inspector("model-look", "外观", "color");
  const controls: SelectionControl[] = [
    {
      id: "azimuth",
      kind: "range",
      label: "水平环绕",
      value: view.azimuth,
      min: -180,
      max: 180,
      ...viewGroup,
    },
    {
      id: "elevation",
      kind: "range",
      label: "垂直环绕",
      value: view.elevation,
      min: 1,
      max: 179,
      ...viewGroup,
    },
    {
      id: "zoom",
      kind: "range",
      label: "镜头距离",
      value: view.zoom,
      min: 20,
      max: 500,
      step: 5,
      ...viewGroup,
    },
    {
      id: "reset-camera",
      kind: "action",
      label: "居中取景",
      icon: "position",
      ...viewGroup,
    },
    {
      id: "exposure",
      kind: "range",
      label: "曝光",
      value: view.exposure,
      min: 0,
      max: 2,
      step: 0.05,
      ...lookGroup,
    },
    {
      id: "background",
      kind: "color",
      label: "背景",
      value: view.background,
      ...lookGroup,
    },
    {
      id: "material-color",
      kind: "color",
      label: "材质颜色",
      value: view.materialColor,
      ...lookGroup,
    },
    {
      id: "node-visible",
      kind: "toggle",
      label: "显示节点",
      icon: "select",
      value: view.nodeVisible,
      ...lookGroup,
    },
    {
      id: "auto-rotate",
      kind: "toggle",
      label: "自动旋转",
      icon: "animate",
      value: view.autoRotate,
      ...viewGroup,
    },
  ];
  return {
    version: 1,
    kind: MODEL3D_SELECTION_KIND,
    id: "active-model",
    label: view.selectedNodeName || "3D 模型",
    revision: view.revision,
    controls,
  };
}

export function applyModel3DNextControl(
  view: Model3DNextViewState,
  message: SelectionCommand,
): Model3DNextViewState {
  if (message.selectionId && message.selectionId !== "active-model") return view;
  const numeric =
    typeof message.value === "number" && Number.isFinite(message.value)
      ? message.value
      : 0;
  const next = { ...view, revision: view.revision + 1 };
  switch (message.controlId) {
    case "azimuth":
      return { ...next, azimuth: numeric };
    case "elevation":
      return { ...next, elevation: numeric };
    case "zoom":
      return { ...next, zoom: numeric };
    case "exposure":
      return { ...next, exposure: numeric };
    case "background":
      return {
        ...next,
        background: String(
          message.value || MODEL3D_STAGE_TOKENS["stage.bg.bottom"],
        ),
      };
    case "material-color":
      return { ...next, materialColor: String(message.value || "#ffffff") };
    case "node-visible":
      return { ...next, nodeVisible: message.value === true };
    case "auto-rotate":
      return { ...next, autoRotate: message.value === true };
    case "reset-camera":
      return {
        ...next,
        azimuth: DEFAULT_MODEL3D_VIEW.azimuth,
        elevation: DEFAULT_MODEL3D_VIEW.elevation,
        zoom: DEFAULT_MODEL3D_VIEW.zoom,
      };
    default:
      return view;
  }
}

export function cameraOrbitAttribute(view: Model3DNextViewState): string {
  return `${view.azimuth}deg ${view.elevation}deg ${view.zoom}%`;
}

export function hexToRgb01(hex: string): [number, number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [1, 1, 1, 1];
  const n = Number.parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

/** 前 / 右 / 后 / 左。走 model-viewer 的 camera-orbit，不另写相机核。 */
export const MODEL3D_FOUR_VIEW_ORBITS = [
  "0deg 75deg 105%",
  "90deg 75deg 105%",
  "180deg 75deg 105%",
  "-90deg 75deg 105%",
] as const;

export type ModelViewerCaptureHost = {
  getAttribute?: (name: string) => string | null;
  setAttribute?: (name: string, value: string) => void;
  updateComplete?: Promise<unknown>;
  toBlob?: (opts?: { mimeType?: string; qualityArgument?: number }) => Promise<Blob>;
};

export async function captureModelViewerPng(
  viewer: ModelViewerCaptureHost | null | undefined,
): Promise<Blob> {
  if (!viewer || typeof viewer.toBlob !== "function") {
    throw new Error("3D 查看器还给出图。");
  }
  const blob = await viewer.toBlob({
    mimeType: "image/png",
    qualityArgument: 0.92,
  });
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error("出图没有像素。");
  }
  return blob;
}

export async function captureModelViewerFourViews(
  viewer: ModelViewerCaptureHost | null | undefined,
): Promise<Blob[]> {
  if (!viewer) throw new Error("3D 查看器还没就绪。");
  const original =
    typeof viewer.getAttribute === "function"
      ? viewer.getAttribute("camera-orbit") || ""
      : "";
  const blobs: Blob[] = [];
  for (const orbit of MODEL3D_FOUR_VIEW_ORBITS) {
    if (typeof viewer.setAttribute === "function") {
      viewer.setAttribute("camera-orbit", orbit);
    }
    if (viewer.updateComplete) await viewer.updateComplete;
    blobs.push(await captureModelViewerPng(viewer));
  }
  if (original && typeof viewer.setAttribute === "function") {
    viewer.setAttribute("camera-orbit", original);
  }
  return blobs;
}
