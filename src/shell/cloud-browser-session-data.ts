"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listCloudBrowserCheckpoints,
  listCloudBrowsers,
  type CloudBrowserCheckpoint,
  type CloudBrowserSession,
} from "../lib/browser";
import type { UITranslate } from "../i18n/ui/useUI";

type SessionDataOptions = {
  effectiveTaskId: string;
  liveRequested: boolean;
  tt: UITranslate;
  setError: (message: string) => void;
};

const CHECKPOINT_STATES = new Set([
  "warm",
  "hibernated",
  "restoring",
  "restored",
  "failed",
]);

function validCheckpoint(
  value: CloudBrowserCheckpoint,
  sessionId: string,
): boolean {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      value.id.length > 0 &&
      value.id.length <= 160 &&
      value.session_id === sessionId &&
      Number.isSafeInteger(value.generation) &&
      value.generation > 0 &&
      typeof value.created_at === "string" &&
      Number.isFinite(Date.parse(value.created_at)) &&
      typeof value.page_title === "string" &&
      value.page_title.length <= 512 &&
      typeof value.page_url === "string" &&
      value.page_url.length <= 2_048 &&
      CHECKPOINT_STATES.has(value.state) &&
      Number.isSafeInteger(value.session_version) &&
      value.session_version > 0 &&
      typeof value.runtime_version === "string" &&
      value.runtime_version.length > 0 &&
      value.runtime_version.length <= 160,
  );
}

export function normalizeCloudBrowserCheckpoints(
  value: unknown,
  sessionId: string,
): CloudBrowserCheckpoint[] | null {
  if (!Array.isArray(value)) return null;
  const checkpoints = value.filter(
    (item): item is CloudBrowserCheckpoint =>
      validCheckpoint(item as CloudBrowserCheckpoint, sessionId),
  );
  if (checkpoints.length !== value.length) return null;
  checkpoints.sort((left, right) => right.generation - left.generation);
  const generations = new Set<number>();
  for (const checkpoint of checkpoints) {
    if (generations.has(checkpoint.generation)) return null;
    generations.add(checkpoint.generation);
  }
  return checkpoints;
}

export function useCloudBrowserSessionData({
  effectiveTaskId,
  liveRequested,
  tt,
  setError,
}: SessionDataOptions) {
  const [sessions, setSessions] = useState<CloudBrowserSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [checkpoints, setCheckpoints] = useState<
    CloudBrowserCheckpoint[]
  >([]);
  const [checkpointsLoading, setCheckpointsLoading] = useState(false);
  const [checkpointsError, setCheckpointsError] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const taskScopeRef = useRef<string | null>(null);
  const reloadGenerationRef = useRef(0);
  const checkpointGenerationRef = useRef(0);
  const selectedIdRef = useRef("");

  const reload = useCallback(
    async (preferredId = "") => {
      const generation = ++reloadGenerationRef.current;
      const [recentResult, taskResult] = await Promise.all([
        listCloudBrowsers(),
        effectiveTaskId
          ? listCloudBrowsers(1, effectiveTaskId)
          : Promise.resolve(null),
      ]);
      if (generation !== reloadGenerationRef.current) return;
      if (!recentResult.ok) {
        setError(recentResult.error || tt("浏览记录加载失败"));
        return;
      }
      if (effectiveTaskId && taskResult && !taskResult.ok) {
        setError(
          taskResult.error || tt("当前任务的浏览记录加载失败"),
        );
      } else {
        setError("");
      }
      const recent = recentResult.data?.items || [];
      const scoped = taskResult?.ok ? taskResult.data?.items || [] : [];
      const items = [
        ...scoped,
        ...recent.filter(
          (item) =>
            !scoped.some(
              (scopedItem) => scopedItem.id === item.id,
            ),
        ),
      ];
      const scopeChanged = taskScopeRef.current !== effectiveTaskId;
      taskScopeRef.current = effectiveTaskId;
      setSessions(items);
      setSelectedId((current) => {
        let next = "";
        if (
          preferredId &&
          items.some((item) => item.id === preferredId)
        ) {
          next = preferredId;
        } else {
          const taskSession = items.find(
            (item) =>
              effectiveTaskId && item.task_id === effectiveTaskId,
          );
          if (scopeChanged && effectiveTaskId) {
            next = taskSession?.id || "";
          } else if (
            current &&
            items.some((item) => item.id === current)
          ) {
            next = current;
          } else if (taskSession) {
            next = taskSession.id;
          } else {
            next = items[0]?.id || "";
          }
        }
        selectedIdRef.current = next;
        return next;
      });
    },
    [effectiveTaskId, setError, tt],
  );

  const refreshCheckpoints = useCallback(async () => {
    const sessionId = selectedIdRef.current;
    if (!sessionId) {
      setCheckpoints([]);
      return;
    }
    const generation = ++checkpointGenerationRef.current;
    setCheckpointsLoading(true);
    const result = await listCloudBrowserCheckpoints(sessionId);
    if (generation !== checkpointGenerationRef.current) return;
    setCheckpointsLoading(false);
    if (!result.ok) {
      setCheckpointsError(
        result.error || tt("会话快照加载失败"),
      );
      return;
    }
    const normalized = normalizeCloudBrowserCheckpoints(
      result.data?.items,
      sessionId,
    );
    if (!normalized) {
      setCheckpoints([]);
      setCheckpointsError(tt("会话快照数据不符合 v3 契约"));
      return;
    }
    setCheckpoints(normalized);
    setCheckpointsError("");
  }, [tt]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (liveRequested) return;
    void reload();
    const timer = window.setInterval(() => void reload(), 5_000);
    return () => window.clearInterval(timer);
  }, [liveRequested, reload]);

  useEffect(() => {
    setDeleteArmed(false);
    setCheckpoints([]);
    setCheckpointsError("");
    ++checkpointGenerationRef.current;
    if (!selectedId) return;
    void refreshCheckpoints();
  }, [refreshCheckpoints, selectedId]);

  const chooseSession = useCallback((sessionId: string) => {
    selectedIdRef.current = sessionId;
    setSelectedId(sessionId);
  }, []);

  const upsertSession = useCallback((session: CloudBrowserSession) => {
    setSessions((current) => [
      session,
      ...current.filter((item) => item.id !== session.id),
    ]);
    selectedIdRef.current = session.id;
    setSelectedId(session.id);
  }, []);

  const clearSelection = useCallback(() => {
    selectedIdRef.current = "";
    setSelectedId("");
  }, []);

  return {
    sessions,
    selectedId,
    selected:
      sessions.find((item) => item.id === selectedId) || null,
    checkpoints,
    checkpointsLoading,
    checkpointsError,
    deleteArmed,
    setDeleteArmed,
    reload,
    refreshCheckpoints,
    chooseSession,
    upsertSession,
    clearSelection,
  };
}
