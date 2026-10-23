"use client";

import { useEffect, useState } from "react";
import type { GameIterationRunner } from "../advanced-routes/GameRoute";

// Keep registration outside the hot-reloaded route module, as preview-host does.
// Hosts may register after the editor mounts; readers must subscribe to changes.
let runner: GameIterationRunner | null = null;
const listeners = new Set<() => void>();

export function registerGameIterationRunner(next: GameIterationRunner | null): void {
  runner = next;
  for (const listener of [...listeners]) listener();
}

export function useGameIterationRunner(): GameIterationRunner | null {
  const [current, setCurrent] = useState<GameIterationRunner | null>(() => runner);
  useEffect(() => {
    const changed = () => setCurrent(() => runner);
    listeners.add(changed);
    changed();
    return () => { listeners.delete(changed); };
  }, []);
  return current;
}
