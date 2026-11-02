"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type StepsFoldPreference = boolean | null;

type StepsFoldPreferenceContextValue = {
  taskId: string;
  preference: StepsFoldPreference;
  setPreference: (expanded: boolean) => void;
  latestBlocks: ReadonlySet<HTMLDivElement>;
  registerBlock: (element: HTMLDivElement) => () => void;
};

const StepsFoldPreferenceContext = createContext<StepsFoldPreferenceContextValue | null>(null);

export const STEPS_FOLD_PREFERENCE_KEY_PREFIX = "oceanleo_steps_fold:v1:";

function storageKey(taskId: string): string {
  return `${STEPS_FOLD_PREFERENCE_KEY_PREFIX}${taskId}`;
}

function readPreference(taskId: string): StepsFoldPreference {
  try {
    const value = window.localStorage.getItem(storageKey(taskId));
    if (value === "1" || value === "true") return true;
    if (value === "0" || value === "false") return false;
  } catch {
    // Storage can be unavailable in privacy-restricted documents.
  }
  return null;
}

export function StepsFoldPreferenceProvider({
  taskId,
  children,
}: {
  taskId: string | null | undefined;
  children: ReactNode;
}) {
  // Always the same element type: a task id arriving (home → task) must not
  // remount the conversation and composer underneath.
  return <TaskStepsFoldPreference taskId={taskId || null}>{children}</TaskStepsFoldPreference>;
}

function TaskStepsFoldPreference({ taskId, children }: { taskId: string | null; children: ReactNode }) {
  const [stored, setStored] = useState<{ taskId: string | null; preference: StepsFoldPreference }>({ taskId: null, preference: null });
  const preference = stored.taskId === taskId ? stored.preference : null;
  const [blocks, setBlocks] = useState<HTMLDivElement[]>([]);
  const [latestBlocks, setLatestBlocks] = useState<ReadonlySet<HTMLDivElement>>(new Set());
  const registerBlock = useCallback((element: HTMLDivElement) => {
    setBlocks((current) => [...current, element]);
    return () => setBlocks((current) => current.filter((block) => block !== element));
  }, []);

  useLayoutEffect(() => {
    // Compute once per committed block list, rather than scanning the whole
    // conversation separately in every block on every preference change.
    const latestByStream = new Map<Element | null, HTMLDivElement>();
    for (const block of blocks) {
      if (!block.isConnected) continue;
      const stream = block.closest("[data-agent-stream]") ?? block.parentElement;
      const previous = latestByStream.get(stream);
      // DOCUMENT_POSITION_FOLLOWING; no browser-only Node global during SSR.
      if (!previous || (previous.compareDocumentPosition(block) & 4) !== 0) latestByStream.set(stream, block);
    }
    const next = new Set(latestByStream.values());
    setLatestBlocks((current) => current.size === next.size && [...next].every((block) => current.has(block)) ? current : next);
  }, [blocks, children]);

  useEffect(() => {
    setStored({ taskId, preference: taskId ? readPreference(taskId) : null });
  }, [taskId]);

  const setPreference = useCallback((expanded: boolean) => {
    if (!taskId) return;
    setStored({ taskId, preference: expanded });
    try {
      window.localStorage.setItem(storageKey(taskId), expanded ? "1" : "0");
    } catch {
      // Storage can be unavailable in privacy-restricted documents.
    }
  }, [taskId]);

  // No task yet → no context value: AgentProgress keeps today's behaviour.
  const value = useMemo<StepsFoldPreferenceContextValue | null>(
    () => (taskId ? {
      taskId,
      preference,
      setPreference,
      latestBlocks,
      registerBlock,
    } : null),
    [preference, taskId, setPreference, latestBlocks, registerBlock],
  );
  return <StepsFoldPreferenceContext.Provider value={value}>{children}</StepsFoldPreferenceContext.Provider>;
}

/** Returns null when no task provider is present, preserving the legacy behaviour. */
export function useStepsFoldPreference(): StepsFoldPreferenceContextValue | null {
  return useContext(StepsFoldPreferenceContext);
}

/** Latest means last in this conversation's rendered order, even after it stops
 * running. Registration order is not chronology: native history is prepended.
 * Separate mounted native/cloud streams each have their own latest block. */
export function useStepsFoldBlock(running: boolean, hasEntries: boolean) {
  const context = useStepsFoldPreference();
  const elementRef = useRef<HTMLDivElement>(null);
  const registerBlock = context?.registerBlock;
  useLayoutEffect(() => {
    if (hasEntries && elementRef.current && registerBlock) return registerBlock(elementRef.current);
  }, [hasEntries, registerBlock]);

  const element = elementRef.current;
  const latest = !context || Boolean(element && context.latestBlocks.has(element));
  const taskId = context?.taskId ?? null;
  const preference = latest ? context?.preference ?? null : null;
  const initial = latest && (preference ?? running);
  const [state, setState] = useState({ taskId, latest, preference, running, open: initial, touched: false });
  let current = state;
  if (state.taskId !== taskId || state.latest !== latest) {
    current = { taskId, latest, preference, running, open: initial, touched: false };
  } else if (state.preference !== preference) {
    current = { ...state, preference, running, open: preference ?? running, touched: false };
  } else if (state.running !== running) {
    current = { ...state, running, open: !state.touched && preference === null ? initial : state.open };
  }
  // Adjust before rendering so a newly historical block never paints expanded.
  if (current !== state) setState(current);
  const setOpen = (open: boolean) => {
    setState({ ...current, open, touched: true });
    if (latest) context?.setPreference(open);
  };
  return { elementRef, open: current.open, toggle: () => setOpen(!current.open), close: () => setOpen(false) };
}
