import { useEffect, useRef, useState } from "react";
import { createStreamingTextBuffer } from "./streaming-text";

export function useStreamingText(content: string, active: boolean): string {
  const [display, setDisplay] = useState(content);
  const buffer = useRef<ReturnType<typeof createStreamingTextBuffer> | null>(null);
  useEffect(() => {
    const next = createStreamingTextBuffer(setDisplay);
    next.update(content, false);
    buffer.current = next;
    return () => { next.dispose(); buffer.current = null; };
  }, []);
  useEffect(() => {
    const reduced = typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    buffer.current?.update(content, active && !reduced &&
      (typeof document === "undefined" || !document.hidden));
  }, [content, active]);
  // Stop and final reconciliation are synchronous from the reader's view.
  return active ? display : content;
}
