"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type StepsFoldPreference = boolean | null;

type StepsFoldPreferenceContextValue = {
  preference: StepsFoldPreference;
  setPreference: (expanded: boolean) => void;
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
  if (!taskId) return <>{children}</>;
  return <TaskStepsFoldPreference taskId={taskId}>{children}</TaskStepsFoldPreference>;
}

function TaskStepsFoldPreference({ taskId, children }: { taskId: string; children: ReactNode }) {
  const [preference, setPreferenceState] = useState<StepsFoldPreference>(null);
  const loadedTask = useRef<string | null>(null);

  useEffect(() => {
    loadedTask.current = null;
    const stored = readPreference(taskId);
    setPreferenceState(stored);
    loadedTask.current = taskId;
  }, [taskId]);

  useEffect(() => {
    if (loadedTask.current !== taskId || preference === null) return;
    try {
      window.localStorage.setItem(storageKey(taskId), preference ? "1" : "0");
    } catch {
      // Storage can be unavailable in privacy-restricted documents.
    }
  }, [preference, taskId]);

  const value = useMemo<StepsFoldPreferenceContextValue>(
    () => ({
      preference,
      setPreference: (expanded) => setPreferenceState(expanded),
    }),
    [preference],
  );
  return <StepsFoldPreferenceContext.Provider value={value}>{children}</StepsFoldPreferenceContext.Provider>;
}

/** Returns null when no task provider is present, preserving the legacy behaviour. */
export function useStepsFoldPreference(): StepsFoldPreferenceContextValue | null {
  return useContext(StepsFoldPreferenceContext);
}
