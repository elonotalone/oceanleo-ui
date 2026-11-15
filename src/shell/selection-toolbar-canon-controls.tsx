"use client";

import { useEffect, useState } from "react";
import type { CanonicalSelectionControl } from "./edit-bar-canon";
import type { SelectionControl, SelectionPanelAction } from "./selection-context";
import { EDIT_BAR_FIELD_CLASS } from "./edit-bar-surface";
import { isEditBarSurface, preserveEditBarSelection } from "./edit-bar-selection-preserve";

export const EDIT_BAR_FONT_SIZE_PRESETS = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72, 96,
] as const;

type TextStyle = { fontFamily: string; fontSize: number | null; mixedFamily: boolean; mixedSize: boolean };
export type EditBarTextBookmark = {
  range: Range;
  editor: HTMLElement;
  anchor: Node | null;
  anchorOffset: number;
  focus: Node | null;
  focusOffset: number;
};

function editableFor(node: Node | null): HTMLElement | null {
  const element = node?.nodeType === 1 ? node as Element : node?.parentElement;
  return element?.closest<HTMLElement>('[contenteditable]:not([contenteditable="false"])') || null;
}

/** DOM 书签只属于同一可编辑宿主；不会把弹层搜索框或另一篇文档当成选区。 */
export function captureEditBarTextBookmark(): EditBarTextBookmark | null {
  if (typeof document === "undefined") return null;
  const selection = document.getSelection();
  const editor = editableFor(selection?.anchorNode || null);
  if (!selection?.rangeCount || !editor || isEditBarSurface(editor) ||
      !editor.contains(selection.focusNode)) return null;
  return { range: selection.getRangeAt(0).cloneRange(), editor,
    anchor: selection.anchorNode, anchorOffset: selection.anchorOffset,
    focus: selection.focusNode, focusOffset: selection.focusOffset };
}

export function restoreEditBarTextBookmark(bookmark: EditBarTextBookmark | null, focus = true): void {
  if (!bookmark?.editor.isConnected || !bookmark.range.startContainer.isConnected ||
      !bookmark.range.endContainer.isConnected) return;
  const selection = bookmark.editor.ownerDocument.getSelection();
  if (!selection) return;
  if (focus) bookmark.editor.focus({ preventScroll: true });
  // cloneRange 随 DOM 变化跟踪边界；保留反向选区时使用原端点。
  selection.removeAllRanges();
  selection.addRange(bookmark.range);
  if (bookmark.anchor?.isConnected && bookmark.focus?.isConnected &&
      typeof selection.setBaseAndExtent === "function") {
    try {
      selection.setBaseAndExtent(bookmark.anchor, bookmark.anchorOffset, bookmark.focus, bookmark.focusOffset);
    } catch { /* 节点被宿主替换后仍保留 live Range 的有效边界。 */ }
  }
}

function computedTextStyle(element: Element): { fontFamily: string; fontSize: number | null } {
  let fontFamily = "";
  let fontSize: number | null = null;
  // 浏览器会返回计算后的继承值；祖先兜底同时覆盖无布局的 DOM 测试环境。
  for (let current: Element | null = element; current && (!fontFamily || fontSize === null); current = current.parentElement) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (!fontFamily && style?.fontFamily && !/^(inherit|initial|unset)$/i.test(style.fontFamily)) fontFamily = style.fontFamily;
    if (fontSize === null && style?.fontSize.endsWith("px")) fontSize = Number.parseFloat(style.fontSize);
  }
  return { fontFamily, fontSize };
}

export function readEditBarTextStyle(): TextStyle | null {
  const bookmark = captureEditBarTextBookmark();
  if (!bookmark) return null;
  const { range, editor } = bookmark;
  const samples: ReturnType<typeof computedTextStyle>[] = [];
  const root = range.commonAncestorContainer;
  if (range.collapsed || root.nodeType === 3) {
    samples.push(computedTextStyle(root.nodeType === 1 ? root as Element : root.parentElement || editor));
  } else {
    const walker = editor.ownerDocument.createTreeWalker(root, 4 /* SHOW_TEXT */);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.length || !range.intersectsNode(node) ||
          (node === range.startContainer && range.startOffset === node.textContent.length) ||
          (node === range.endContainer && range.endOffset === 0)) continue;
      samples.push(computedTextStyle(node.parentElement || editor));
    }
  }
  if (!samples.length) samples.push(computedTextStyle(editor));
  const families = new Set(samples.map((sample) => normalizeEditBarFontFamily(sample.fontFamily)));
  const sizes = new Set(samples.map((sample) => sample.fontSize));
  return { ...samples[0], mixedFamily: families.size > 1, mixedSize: sizes.size > 1 };
}

export function normalizeEditBarFontFamily(value: string): string {
  return value.split(",")[0].trim().replace(/^["']|["']$/g, "");
}

export function useEditBarTextStyle(forMeasurement = false): TextStyle | null {
  const [style, setStyle] = useState<TextStyle | null>(null);
  useEffect(() => {
    if (forMeasurement) return;
    const update = () => {
      const next = readEditBarTextStyle();
      // 弹层搜索 / 键盘导航期间保留宿主值，离开编辑栏后释放旧值。
      if (!next && isEditBarSurface(document.activeElement)) return;
      setStyle((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    update();
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [forMeasurement]);
  return style;
}

export function editBarFontName(control: SelectionControl, inherited: TextStyle | null): string {
  if (control.value === null || control.value === "mixed" || inherited?.mixedFamily) return "多种";
  const value = typeof control.value === "string" && !/^(default|inherit|unset)$/i.test(control.value) ? control.value : "";
  const canonical = (control as CanonicalSelectionControl).canonValueLabel;
  const effective = value || inherited?.fontFamily || canonical || "";
  const family = normalizeEditBarFontFamily(effective);
  const option = control.options?.find((item) => normalizeEditBarFontFamily(item.value).toLocaleLowerCase() === family.toLocaleLowerCase());
  return option?.label || family || "字体";
}

/** 旧写法的字体面板键：按钮上写当前字体名，点开编辑器自己的字体面板。 */
export function SelectionToolbarFontFamilyButton({
  control,
  buttonClass,
  activePanel,
  onOpenPanel,
  onActivated,
  forMeasurement = false,
}: {
  control: CanonicalSelectionControl;
  buttonClass: string;
  activePanel: boolean;
  onOpenPanel?: (panelId: string, panelAction?: SelectionPanelAction, anchor?: HTMLElement) => void;
  onActivated?: () => void;
  forMeasurement?: boolean;
}) {
  const inherited = useEditBarTextStyle(forMeasurement);
  const fontName = editBarFontName(control, inherited);
  return (
    <button
      type="button"
      disabled={control.disabled}
      tabIndex={forMeasurement ? -1 : undefined}
      onPointerDown={preserveEditBarSelection}
      onClick={(event) => {
        if (forMeasurement) return;
        onOpenPanel?.(control.panelId || control.id, control.panelAction, event.currentTarget);
        onActivated?.();
      }}
      aria-haspopup="dialog"
      aria-expanded={activePanel}
      aria-label={forMeasurement ? undefined : `${control.label}：${fontName}`}
      title={forMeasurement ? undefined : `${control.label}：${fontName}`}
      className={`${buttonClass} ${EDIT_BAR_FIELD_CLASS} min-w-28 max-w-48`}
      data-edit-bar-font-family
    >
      <span className="min-w-0 truncate font-semibold" style={{ fontFamily: typeof control.value === "string" && control.value !== "default" ? control.value : inherited?.fontFamily || fontName }}>
        {fontName}
      </span>
      <span className="shrink-0 text-[9px] opacity-50">⌄</span>
    </button>
  );
}
