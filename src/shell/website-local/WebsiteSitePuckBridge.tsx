"use client";

/**
 * Lives inside `<Puck>` (via `overrides.puck`, so both faces have it) and keeps
 * the route and Puck in step without remounting Puck:
 * - reports which section Puck has selected;
 * - pushes document changes that did not come from Puck (edit bar, undo/redo)
 *   with `setData` (no Puck history entry), so selection and face survive;
 * - selects a section on request (after duplicate).
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createUsePuck, type Data } from "@puckeditor/core";

export interface SitePuckBridgeValue {
  /** Bumped whenever the route changed the page outside Puck. */
  pushToken: number;
  data: () => Data;
  onSelectedSection: (sectionId: string | null) => void;
  /** Bumped together with `selectId` to ask Puck to select a section. */
  selectToken: number;
  selectId: string;
}

export const SitePuckBridgeContext = createContext<SitePuckBridgeValue | null>(null);

const usePuckSelect = createUsePuck();

function SitePuckBridge() {
  const bridge = useContext(SitePuckBridgeContext);
  const dispatch = usePuckSelect((state) => state.dispatch);
  const getSelectorForId = usePuckSelect((state) => state.getSelectorForId);
  const selectedId = usePuckSelect((state) => {
    const id = (state.selectedItem?.props as { id?: unknown } | undefined)?.id;
    return typeof id === "string" ? id : null;
  });
  const pushed = useRef(bridge?.pushToken ?? 0);
  const selected = useRef(bridge?.selectToken ?? 0);

  useEffect(() => {
    bridge?.onSelectedSection(selectedId);
    // Report changes of Puck's selection only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!bridge || bridge.pushToken === pushed.current) return;
    pushed.current = bridge.pushToken;
    dispatch({ type: "setData", data: bridge.data(), recordHistory: false });
  }, [bridge, dispatch]);

  useEffect(() => {
    if (!bridge || bridge.selectToken === selected.current) return;
    selected.current = bridge.selectToken;
    const selector = bridge.selectId ? getSelectorForId(bridge.selectId) : undefined;
    dispatch({
      type: "setUi",
      ui: { itemSelector: selector ? { index: selector.index, zone: selector.zone } : null },
      recordHistory: false,
    });
  }, [bridge, dispatch, getSelectorForId]);

  return null;
}

export function SitePuckBridgeHost({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <SitePuckBridge />
    </>
  );
}
