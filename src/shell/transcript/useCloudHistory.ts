"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage } from "../../lib/agent";
import { recallConversationAnchor } from "../task-scroll-memory";

const PAGE_SIZE = 60;
/** The cloud detail API supplies a full thread. Page its rendered rows around a stable message id. */
export function useCloudHistory(taskKey: string, messages: readonly AgentMessage[]) {
  const [window, setWindow] = useState<{ key: string; firstId: number | null }>({ key: taskKey, firstId: null });
  const saved = useMemo(() => recallConversationAnchor(taskKey), [taskKey]);
  const anchorIndex = saved && !saved.atBottom ? messages.findIndex((message) => String(message.id) === saved.messageId) : -1;
  const known = window.key === taskKey && window.firstId != null ? messages.findIndex((message) => message.id === window.firstId) : -1;
  const initial = anchorIndex >= 0 ? Math.max(0, anchorIndex - 20) : Math.max(0, messages.length - PAGE_SIZE);
  const start = known >= 0 ? Math.min(known, anchorIndex >= 0 ? anchorIndex : known) : initial;
  const firstId = messages[start]?.id ?? null;
  useLayoutEffect(() => {
    if (firstId != null) setWindow((current) => current.key === taskKey && current.firstId === firstId ? current : { key: taskKey, firstId });
  }, [taskKey, firstId]);
  const latest = useRef({ taskKey, messages, start });
  latest.current = { taskKey, messages, start };
  const loadEarlier = useCallback(async () => {
    const current = latest.current;
    // Let the shared loader paint its pending state before expanding this
    // already-fetched page. A synchronous resolution batches it out of the DOM.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (latest.current.taskKey !== current.taskKey) return;
    setWindow({ key: current.taskKey, firstId: current.messages[Math.max(0, current.start - PAGE_SIZE)]?.id ?? null });
  }, []);
  return { visible: messages.slice(start), hasMore: start > 0, loadEarlier };
}
