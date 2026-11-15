"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { moveDeckElement, resizeDeckElement, rotateDeckElement, type DeckResizeHandle } from "./deck-geometry";
import type { DeckElement } from "./deck-schema";
import { deckPointerStartsDragging } from "./deck-text-gesture";
import type { DeckEditorState } from "./use-deck-editor";

interface ElementInteraction {
  id: string;
  pointerId: number;
  dragging: boolean;
  mode: "move" | "resize" | "rotate";
  handle?: DeckResizeHandle;
  startX: number;
  startY: number;
  origin: DeckElement;
  preview: Partial<DeckElement>;
}

export function useDeckElementInteraction(editor: DeckEditorState) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<ElementInteraction | null>(
    null,
  );
  const interactionRef = useRef<ElementInteraction | null>(null);
  const slide = editor.activeSlide;
  const editingId = editor.textEditingElementId;

  useEffect(() => {
    const canvas = canvasRef.current;
    editor.setCanvasElement(canvas);
    return () => {
      const current = interactionRef.current;
      interactionRef.current = null;
      if (current && canvas?.hasPointerCapture(current.pointerId)) {
        canvas.releasePointerCapture(current.pointerId);
      }
      editor.setCanvasElement(null);
    };
  }, [editor.setCanvasElement]);

  const startInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    element: DeckElement,
    mode: ElementInteraction["mode"],
    handle?: DeckResizeHandle,
  ) => {
    if (
      event.button !== 0 || element.locked || editingId === element.id ||
      editor.readOnly || editor.loading || editor.sourceFailed
    ) return;
    event.stopPropagation();
    editor.selectElement(element.id);
    const pending: ElementInteraction = {
      id: element.id,
      pointerId: event.pointerId,
      dragging: false,
      mode,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...element, rows: element.rows?.map((row) => [...row]) },
      preview: {},
    };
    interactionRef.current = pending;
    setInteraction(pending);
  };

  const updateInteraction = (event: Pick<PointerEvent, "pointerId" | "clientX" | "clientY" | "shiftKey" | "preventDefault">) => {
    const interaction = interactionRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!interaction || event.pointerId !== interaction.pointerId || !rect?.width || !rect.height) return;
    const start = { x: interaction.startX, y: interaction.startY };
    const current = { x: event.clientX, y: event.clientY };
    if (!interaction.dragging) {
      if (!deckPointerStartsDragging(start, current)) return;
      canvasRef.current?.setPointerCapture(interaction.pointerId);
    }
    event.preventDefault();
    let preview: Partial<DeckElement>;
    if (interaction.mode === "move") {
      preview = moveDeckElement(interaction.origin, start, current, rect);
    } else if (interaction.mode === "resize" && interaction.handle) {
      preview = resizeDeckElement(
        interaction.origin,
        interaction.handle,
        start,
        current,
        rect,
        event.shiftKey || interaction.origin.type === "image",
      );
    } else {
      preview = rotateDeckElement(
        interaction.origin,
        start,
        current,
        rect,
        event.shiftKey,
      );
    }
    const next = { ...interaction, dragging: true, preview };
    interactionRef.current = next;
    setInteraction(next);
  };

  const clearInteraction = () => {
    const current = interactionRef.current;
    interactionRef.current = null;
    setInteraction(null);
    if (current && canvasRef.current?.hasPointerCapture(current.pointerId)) {
      canvasRef.current.releasePointerCapture(current.pointerId);
    }
  };

  const finishInteraction = (event: Pick<PointerEvent, "pointerId">) => {
    const interaction = interactionRef.current;
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    clearInteraction();
    if (Object.keys(interaction.preview).length) {
      editor.patchElement(interaction.id, interaction.preview);
    }
  };

  const cancelInteraction = (event: Pick<PointerEvent, "pointerId">) => {
    if (interactionRef.current?.pointerId === event.pointerId) clearInteraction();
  };

  const interacting = interaction !== null;
  useEffect(() => {
    if (!interacting) return;
    // Before capture, a pointer can leave the canvas while still below the threshold.
    const outsideCanvas = (event: PointerEvent) =>
      !canvasRef.current?.contains(event.target as Node);
    const move = (event: PointerEvent) => { if (outsideCanvas(event)) updateInteraction(event); };
    const up = (event: PointerEvent) => { if (outsideCanvas(event)) finishInteraction(event); };
    const cancel = (event: PointerEvent) => { if (outsideCanvas(event)) cancelInteraction(event); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [interacting, editor.patchElement]);

  useEffect(() => {
    const current = interactionRef.current;
    if (current && (
      editor.readOnly || editor.loading || editor.sourceFailed ||
      !slide.elements.some((element) => element.id === current.id && !element.locked)
    )) clearInteraction();
  }, [editor.readOnly, editor.loading, editor.sourceFailed, slide.id, slide.elements]);

  return {
    canvasRef, interaction, startInteraction, updateInteraction,
    finishInteraction, cancelInteraction, clearInteraction,
  };
}
