import type { SelectionCommand } from "../selection-context";
import type {
  CropRatio,
  FabricImageEditorState,
  ImageFitMode,
} from "./types";

function numeric(value: SelectionCommand["value"], fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function dispatchFabricImageCommand(
  editor: FabricImageEditorState,
  message: SelectionCommand,
): void {
  const selected = editor.selected;
  switch (message.controlId) {
    case "tool-select":
      editor.setActiveTool("select");
      break;
    case "tool-draw":
      editor.setActiveTool("draw");
      break;
    case "tool-erase":
      editor.setActiveTool("erase");
      break;
    case "zoom-out":
      editor.zoomOut();
      break;
    case "zoom-fit":
      editor.zoomFit();
      break;
    case "zoom-in":
      editor.zoomIn();
      break;
    case "text":
      editor.setSelectedText({ value: String(message.value ?? "") });
      break;
    case "font-size":
      editor.setSelectedText({ fontSize: numeric(message.value, 16) });
      break;
    case "text-color":
      editor.setSelectedText({ fill: String(message.value || "#000000") });
      break;
    case "bold":
      editor.setSelectedText({ bold: message.value === true });
      break;
    case "italic":
      editor.setSelectedText({ italic: message.value === true });
      break;
    case "underline":
      editor.setSelectedText({ underline: message.value === true });
      break;
    case "linethrough":
      editor.setSelectedText({ linethrough: message.value === true });
      break;
    case "line-height":
      editor.setSelectedText({ lineHeight: numeric(message.value, 1.16) });
      break;
    case "char-spacing":
      editor.setSelectedText({ charSpacing: numeric(message.value, 0) });
      break;
    case "align":
      if (
        message.value === "left" ||
        message.value === "center" ||
        message.value === "right"
      ) {
        editor.setSelectedText({ align: message.value });
      }
      break;
    case "fill":
      editor.setSelectedFill(String(message.value || "#000000"));
      break;
    case "opacity":
      editor.setSelectedOpacity(numeric(message.value, 100));
      break;
    case "stroke":
      editor.setSelectedStroke({ color: String(message.value || "#000000") });
      break;
    case "stroke-width":
      editor.setSelectedStroke({ width: numeric(message.value) });
      break;
    case "radius":
      editor.setSelectedRadius(numeric(message.value));
      break;
    case "position-x":
      editor.setSelectedGeometry({ x: numeric(message.value, selected?.x ?? 0) });
      break;
    case "position-y":
      editor.setSelectedGeometry({ y: numeric(message.value, selected?.y ?? 0) });
      break;
    case "object-width":
      editor.setSelectedGeometry({
        width: numeric(message.value, selected?.width ?? 1),
      });
      break;
    case "object-height":
      editor.setSelectedGeometry({
        height: numeric(message.value, selected?.height ?? 1),
      });
      break;
    case "angle":
      editor.setTargetAngle(numeric(message.value, selected?.angle ?? 0));
      break;
    case "image-fit":
      if (["contain", "cover", "fill"].includes(String(message.value))) {
        editor.setSelectedImageFit(message.value as ImageFitMode);
      }
      break;
    case "shadow":
      editor.setSelectedShadow({ enabled: message.value === true });
      break;
    case "canvas-background":
      editor.setCanvasBackground(String(message.value || "#ffffff"));
      break;
    case "table-rows":
      if (selected?.table) {
        editor.resizeSelectedTable(
          numeric(message.value, selected.table.rows),
          selected.table.columns,
        );
      }
      break;
    case "table-columns":
      if (selected?.table) {
        editor.resizeSelectedTable(
          selected.table.rows,
          numeric(message.value, selected.table.columns),
        );
      }
      break;
    case "table-header-fill":
      editor.setSelectedTableStyle({
        headerFill: String(message.value || "#f1f3f9"),
      });
      break;
    case "table-body-fill":
      editor.setSelectedTableStyle({
        bodyFill: String(message.value || "#ffffff"),
      });
      break;
    case "table-text-color":
      editor.setSelectedTableStyle({
        textColor: String(message.value || "#20242c"),
      });
      break;
    case "table-border-color":
      editor.setSelectedTableStyle({
        borderColor: String(message.value || "#8b93a7"),
      });
      break;
    case "table-border-width":
      editor.setSelectedTableStyle({
        borderWidth: numeric(message.value, 1),
      });
      break;
    case "crop-start":
      editor.startCrop();
      break;
    case "crop-apply":
      void editor.confirmCrop();
      break;
    case "crop-cancel":
      editor.cancelCrop();
      break;
    case "crop-ratio":
      if (
        ["free", "1:1", "4:3", "16:9", "9:16"].includes(
          String(message.value),
        )
      ) {
        editor.setCropRatio(message.value as CropRatio);
        if (!editor.cropping) editor.startCrop();
      }
      break;
    case "rotate-left":
      editor.rotateTarget(-90);
      break;
    case "rotate-right":
      editor.rotateTarget(90);
      break;
    case "flip-x":
      editor.flipTarget("x");
      break;
    case "flip-y":
      editor.flipTarget("y");
      break;
    case "brightness":
    case "contrast":
    case "saturation":
      editor.setFilter(message.controlId, numeric(message.value));
      break;
    case "grayscale":
      editor.setFilter("grayscale", message.value === true);
      break;
    case "lock":
      if (selected && message.value !== selected.locked) {
        editor.toggleLayerLock(selected.id);
      }
      break;
    case "layer-up":
      if (selected) editor.moveLayer(selected.id, "up");
      break;
    case "layer-down":
      if (selected) editor.moveLayer(selected.id, "down");
      break;
    case "duplicate":
      void editor.duplicateSelected();
      break;
    case "delete":
      editor.deleteSelected();
      break;
  }
}

