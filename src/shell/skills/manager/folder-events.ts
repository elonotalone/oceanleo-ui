"use client";

// W09B — "folders changed" signal shared by every manager surface on the page
// (settings manager, project skills dialog, official library, `/` picker). After any
// write the writer calls `notifyFoldersChanged()`; readers re-fetch when the version moves.

import { useSyncExternalStore } from "react";

let version = 0;
const listeners = new Set<() => void>();

export function notifyFoldersChanged(): void {
  version += 1;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): number {
  return version;
}

export function useFoldersVersion(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

export function foldersVersionForTests(): number {
  return version;
}
