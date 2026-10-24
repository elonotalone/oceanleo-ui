"use client";

// W09B — load the skill folders of one scope (personal or one project) and keep
// them in step with `notifyFoldersChanged()`.

import { useCallback, useEffect, useRef, useState } from "react";

import { listFolders, type Folder } from "../kit";
import { useFoldersVersion } from "./folder-events";

export type ScopeFoldersStatus = "loading" | "ready" | "signed-out" | "error";

export interface ScopeFoldersState {
  items: Folder[];
  status: ScopeFoldersStatus;
  error: string;
  setItems: (update: (items: Folder[]) => Folder[]) => void;
  reload: () => void;
}

/** `projectId` undefined → personal scope ("mine"). `enabled=false` skips loading (closed dialogs). */
export function useScopeFolders(projectId: string | undefined, enabled = true): ScopeFoldersState {
  const version = useFoldersVersion();
  const [items, setItemsState] = useState<Folder[]>([]);
  const [status, setStatus] = useState<ScopeFoldersStatus>("loading");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    // Background refreshes keep the grid on screen; only the first load shows skeletons.
    if (!loadedOnce.current) setStatus("loading");
    void listFolders({
      scope: projectId ? "project" : "mine",
      projectId,
      skillsOnly: true,
    }).then((result) => {
      if (!alive) return;
      if (result.ok) {
        loadedOnce.current = true;
        setItemsState(result.data);
        setStatus("ready");
        setError("");
        return;
      }
      if (result.status === 401) {
        setItemsState([]);
        setStatus("signed-out");
        return;
      }
      setError(result.error);
      setStatus(loadedOnce.current ? "ready" : "error");
    });
    return () => {
      alive = false;
    };
  }, [enabled, projectId, version, tick]);

  const setItems = useCallback((update: (items: Folder[]) => Folder[]) => {
    setItemsState((current) => update(current));
  }, []);
  const reload = useCallback(() => setTick((value) => value + 1), []);

  return { items, status, error, setItems, reload };
}
