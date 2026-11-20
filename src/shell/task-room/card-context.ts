"use client";

// How a task card opens its child inside a host (RoomView passes its `onOpenChild`).
// Without a provider the card asks the right panel, then falls back to a page.
import { createContext, useContext } from "react";
import type { OpenTaskChildDetail } from "./open-child";

export const TaskChildOpenContext = createContext<((detail: OpenTaskChildDetail) => void) | null>(null);

export function useTaskChildOpener(): ((detail: OpenTaskChildDetail) => void) | null {
  return useContext(TaskChildOpenContext);
}
