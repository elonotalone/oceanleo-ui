"use client";
import { useEffect, useRef } from "react";
import { isRichDocFindShortcut } from "./doc-family-commands";

/** 路由常驻；浮层未挂载时 Ctrl/Cmd+F 也能打开查找。 */
export function useRichDocFindShortcut(enabled: boolean, open: () => void) {
  const latest = useRef({ enabled, open });
  latest.current = { enabled, open };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!latest.current.enabled || !isRichDocFindShortcut(event)) return;
      event.preventDefault();
      latest.current.open();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
