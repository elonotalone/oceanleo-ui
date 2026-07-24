"use client";

import {
  useLayoutEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  cssPixelValue,
  elementInlineSize,
  elementOuterInlineSize,
  equalMeasuredWidths,
  normalizedAvailableWidth,
  normalizedMeasuredWidth,
  toolbarContainerInlineSize,
  toolbarSizingBoundary,
} from "./selection-toolbar-measure";

export function useSelectionToolbarMeasure({
  toolbarRef,
  prefixRef,
  suffixRef,
  measurementRef,
  viewportCapacityRef,
  moreButtonRef,
  morePanelRef,
  restoreMoreFocusRef,
  effectiveVariant,
  prefixVisible,
  suffixVisible,
  hasAdaptiveControls,
  contextLeading,
  contextTrailing,
  leading,
  trailing,
  toolsLauncher,
  measurementIdentity,
  setMeasuredWidths,
  setAvailableWidth,
}: {
  toolbarRef: RefObject<HTMLDivElement | null>;
  prefixRef: RefObject<HTMLDivElement | null>;
  suffixRef: RefObject<HTMLDivElement | null>;
  measurementRef: RefObject<HTMLDivElement | null>;
  viewportCapacityRef: RefObject<HTMLDivElement | null>;
  moreButtonRef: RefObject<HTMLButtonElement | null>;
  morePanelRef: RefObject<HTMLDivElement | null>;
  restoreMoreFocusRef: MutableRefObject<boolean>;
  effectiveVariant: "bar" | "floating";
  prefixVisible: boolean;
  suffixVisible: boolean;
  hasAdaptiveControls: boolean;
  contextLeading: unknown;
  contextTrailing: unknown;
  leading: unknown;
  trailing: unknown;
  toolsLauncher: unknown;
  measurementIdentity: string;
  setMeasuredWidths: Dispatch<
    SetStateAction<ReadonlyMap<string, number>>
  >;
  setAvailableWidth: Dispatch<SetStateAction<number>>;
}): void {
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const readLayout = () => {
      restoreMoreFocusRef.current =
        moreButtonRef.current === document.activeElement ||
        Boolean(morePanelRef.current?.contains(document.activeElement));
      const nextMeasured = new Map<string, number>();
      const measurementNodes =
        measurementRef.current?.querySelectorAll<HTMLElement>(
          "[data-selection-measure-control-id]",
        );
      measurementNodes?.forEach((node) => {
        const width = elementInlineSize(node);
        const id = node.dataset.selectionMeasureControlId;
        if (id && width > 0) {
          nextMeasured.set(id, normalizedMeasuredWidth(width));
        }
      });
      setMeasuredWidths((current) =>
        equalMeasuredWidths(current, nextMeasured)
          ? current
          : nextMeasured,
      );

      let containerWidth = toolbarContainerInlineSize(
        toolbar,
        effectiveVariant,
      );
      const measuredViewportCapacity =
        effectiveVariant === "floating"
          ? elementInlineSize(viewportCapacityRef.current)
          : 0;
      if (measuredViewportCapacity > 0) {
        containerWidth = Math.min(
          containerWidth,
          measuredViewportCapacity,
        );
      }
      if (!(containerWidth > 0)) {
        setAvailableWidth(Number.POSITIVE_INFINITY);
        return;
      }
      const style = window.getComputedStyle(toolbar);
      const chromeWidth =
        cssPixelValue(style.paddingInlineStart) +
        cssPixelValue(style.paddingInlineEnd) +
        cssPixelValue(style.borderInlineStartWidth) +
        cssPixelValue(style.borderInlineEndWidth) +
        elementOuterInlineSize(prefixRef.current) +
        elementOuterInlineSize(suffixRef.current);
      const regionCount =
        (prefixVisible ? 1 : 0) +
        (hasAdaptiveControls ? 1 : 0) +
        (suffixVisible ? 1 : 0);
      const regionGaps =
        Math.max(0, regionCount - 1) * cssPixelValue(style.columnGap);
      const nextAvailable = normalizedAvailableWidth(
        containerWidth - chromeWidth - regionGaps,
      );
      setAvailableWidth((current) =>
        current === nextAvailable ? current : nextAvailable,
      );
    };

    readLayout();
    const boundary = toolbarSizingBoundary(toolbar);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(readLayout);
    if (boundary) observer?.observe(boundary);
    if (prefixRef.current) observer?.observe(prefixRef.current);
    if (suffixRef.current) observer?.observe(suffixRef.current);
    if (measurementRef.current) observer?.observe(measurementRef.current);
    if (viewportCapacityRef.current) {
      observer?.observe(viewportCapacityRef.current);
    }
    measurementRef.current
      ?.querySelectorAll<HTMLElement>("[data-selection-measure-control-id]")
      .forEach((node) => observer?.observe(node));
    window.addEventListener("resize", readLayout);
    window.visualViewport?.addEventListener("resize", readLayout);
    window.visualViewport?.addEventListener("scroll", readLayout);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", readLayout);
      window.visualViewport?.removeEventListener("resize", readLayout);
      window.visualViewport?.removeEventListener("scroll", readLayout);
    };
  }, [
    contextLeading,
    contextTrailing,
    effectiveVariant,
    hasAdaptiveControls,
    leading,
    measurementIdentity,
    measurementRef,
    moreButtonRef,
    morePanelRef,
    prefixRef,
    prefixVisible,
    restoreMoreFocusRef,
    setAvailableWidth,
    setMeasuredWidths,
    suffixRef,
    suffixVisible,
    toolsLauncher,
    toolbarRef,
    trailing,
    viewportCapacityRef,
  ]);
}
