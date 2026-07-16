"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import type {
  DeckElement,
  DeckLayout,
  DeckTextAlign,
} from "./deck-schema";
import type { DeckEditorState } from "./use-deck-editor";

function number(value: SelectionCommand["value"], fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function DeckContextToolbar({
  editor,
  accent = "#4f46e5",
}: {
  editor: DeckEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const element = editor.selectedElement;
  const slide = editor.activeSlide;
  const context = useMemo<SelectionContext>(() => {
    if (!element) {
      return {
        version: 1,
        kind: "slide",
        id: slide.id,
        label: tt("当前幻灯片"),
        controls: [
          {
            id: "layout",
            kind: "select",
            label: tt("版式"),
            icon: "layout",
            value: slide.layout,
            options: [
              ["title", "封面标题"],
              ["title-body", "标题正文"],
              ["section", "章节页"],
              ["bullets", "要点列表"],
              ["image-left", "左图右文"],
              ["image-right", "左文右图"],
              ["blank", "空白页"],
            ].map(([value, label]) => ({ value, label: tt(label) })),
            group: "layout",
          },
          { id: "title", kind: "text", label: tt("标题"), value: slide.title, group: "content" },
          { id: "body", kind: "text", label: tt("正文"), value: slide.body, group: "content" },
          {
            id: "background",
            kind: "color",
            label: tt("背景"),
            value: slide.background || "#ffffff",
            group: "style",
          },
          {
            id: "notes",
            kind: "text",
            label: tt("备注"),
            value: slide.notes,
            placement: "more",
          },
          {
            id: "duplicate-slide",
            kind: "action",
            label: tt("复制幻灯片"),
            icon: "duplicate",
            placement: "more",
          },
          {
            id: "delete-slide",
            kind: "action",
            label: tt("删除幻灯片"),
            icon: "delete",
            danger: true,
            disabled: editor.deck.slides.length <= 1,
            placement: "more",
          },
        ],
      };
    }
    return {
      version: 1,
      kind: `slide-${element.type}`,
      id: element.id,
      label: element.label || element.alt || element.type,
      controls: [
        ...(["text", "shape"].includes(element.type)
          ? [
              {
                id: "text",
                kind: "text" as const,
                label: tt("文字"),
                value: element.text || "",
                group: "text",
              },
              {
                id: "font-size",
                kind: "number" as const,
                label: tt("字号"),
                icon: "font-size",
                value: element.fontSize || 18,
                min: 4,
                max: 300,
                group: "text",
              },
              {
                id: "color",
                kind: "color" as const,
                label: tt("文字色"),
                value: element.color || "#111827",
                group: "color",
              },
              {
                id: "bold",
                kind: "toggle" as const,
                label: tt("加粗"),
                icon: "bold",
                iconOnly: true,
                value: element.bold === true,
                group: "style",
              },
              {
                id: "italic",
                kind: "toggle" as const,
                label: tt("斜体"),
                icon: "italic",
                iconOnly: true,
                value: element.italic === true,
                group: "style",
              },
              {
                id: "align",
                kind: "select" as const,
                label: tt("对齐"),
                icon: "align-left",
                value: element.align || "left",
                options: [
                  { value: "left", label: tt("左") },
                  { value: "center", label: tt("中") },
                  { value: "right", label: tt("右") },
                ],
                group: "align",
              },
            ]
          : []),
        ...(element.type === "shape"
          ? [
              {
                id: "fill",
                kind: "color" as const,
                label: tt("填充"),
                value: element.fill || "#ffffff",
                group: "color",
              },
            ]
          : []),
        ...(element.type === "image"
          ? [
              {
                id: "src",
                kind: "text" as const,
                label: tt("图片 URL"),
                value: element.src || "",
                group: "image",
              },
              {
                id: "alt",
                kind: "text" as const,
                label: tt("替代文字"),
                value: element.alt || "",
                placement: "more" as const,
              },
            ]
          : []),
        { id: "x", kind: "number", label: "X %", value: element.x, placement: "more" },
        { id: "y", kind: "number", label: "Y %", value: element.y, placement: "more" },
        {
          id: "width",
          kind: "number",
          label: tt("宽") + " %",
          value: element.width,
          placement: "more",
        },
        {
          id: "height",
          kind: "number",
          label: tt("高") + " %",
          value: element.height,
          placement: "more",
        },
        {
          id: "rotation",
          kind: "number",
          label: tt("旋转"),
          icon: "rotate",
          value: element.rotation,
          placement: "more",
        },
        { id: "layer-up", kind: "action", label: tt("上移一层"), icon: "layer-up", placement: "more" },
        { id: "layer-down", kind: "action", label: tt("下移一层"), icon: "layer-down", placement: "more" },
        { id: "duplicate", kind: "action", label: tt("复制"), icon: "duplicate", placement: "more" },
        {
          id: "delete",
          kind: "action",
          label: tt("删除"),
          icon: "delete",
          danger: true,
          placement: "more",
        },
      ],
    };
  }, [editor.deck.slides.length, element, slide, tt]);

  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    if (!element) {
      switch (message.controlId) {
        case "layout":
          editor.patchSlide({ layout: String(message.value) as DeckLayout });
          break;
        case "title":
        case "body":
        case "notes":
          editor.patchSlide({ [message.controlId]: String(message.value ?? "") });
          break;
        case "background":
          editor.patchSlide({ background: String(message.value || "") });
          break;
        case "duplicate-slide":
          editor.duplicateSlide();
          break;
        case "delete-slide":
          editor.deleteSlide();
          break;
      }
      return;
    }
    const patch: Partial<DeckElement> = {};
    switch (message.controlId) {
      case "text":
      case "src":
      case "alt":
      case "color":
      case "fill":
        patch[message.controlId] = String(message.value ?? "");
        break;
      case "font-size":
        patch.fontSize = number(message.value, 18);
        break;
      case "bold":
      case "italic":
        patch[message.controlId] = message.value === true;
        break;
      case "align":
        patch.align = String(message.value) as DeckTextAlign;
        break;
      case "x":
      case "y":
      case "width":
      case "height":
      case "rotation":
        patch[message.controlId] = number(message.value);
        break;
      case "layer-up":
        editor.moveElementLayer(1);
        return;
      case "layer-down":
        editor.moveElementLayer(-1);
        return;
      case "duplicate":
        editor.duplicateElement();
        return;
      case "delete":
        editor.deleteElement();
        return;
    }
    editor.patchElement(element.id, patch);
  };
  return (
    <SelectionToolbar
      context={context}
      onCommand={command}
      accent={accent}
    />
  );
}
