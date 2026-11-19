"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** A task's notices belong to its stream, outside the measured composer footer. */
export const StreamNoticeTarget = createContext<HTMLElement | null | undefined>(undefined);

export function StreamNotice({ children }: { children: ReactNode }) {
  const target = useContext(StreamNoticeTarget);
  // Other composer hosts keep their existing inline notices. A task waits for
  // its tail to mount rather than briefly putting the notice in the footer.
  return target === undefined ? children : target ? createPortal(children, target) : null;
}

export function useHasStreamNoticeTarget() {
  return useContext(StreamNoticeTarget) !== undefined;
}
