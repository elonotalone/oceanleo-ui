"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cloudBrowserScreenshot,
  listCloudBrowserEvents,
  listCloudBrowsers,
  type CloudBrowserEvent,
  type CloudBrowserSession,
} from "../lib/browser";
import type { UITranslate } from "../i18n/ui/useUI";

type SessionDataOptions = {
  effectiveTaskId: string;
  liveRequested: boolean;
  tt: UITranslate;
  setError: (message: string) => void;
};

export function useCloudBrowserSessionData({
  effectiveTaskId,
  liveRequested,
  tt,
  setError,
}: SessionDataOptions) {
  const [sessions, setSessions] = useState<CloudBrowserSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [events, setEvents] = useState<CloudBrowserEvent[]>([]);
  const [eventId, setEventId] = useState<number | null>(null);
  const [shotUrl, setShotUrl] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const taskScopeRef = useRef<string | null>(null);
  const reloadGenerationRef = useRef(0);
  const selectedIdRef = useRef("");

  const reload = useCallback(async (preferredId = "") => {
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
      setError(taskResult.error || tt("当前任务的浏览记录加载失败"));
    } else {
      setError("");
    }
    const recent = recentResult.data?.items || [];
    const scoped = taskResult?.ok ? taskResult.data?.items || [] : [];
    const items = [
      ...scoped,
      ...recent.filter(
        (item) => !scoped.some((scopedItem) => scopedItem.id === item.id),
      ),
    ];
    const scopeChanged = taskScopeRef.current !== effectiveTaskId;
    taskScopeRef.current = effectiveTaskId;
    setSessions(items);
    setSelectedId((current) => {
      let next = "";
      if (preferredId && items.some((item) => item.id === preferredId)) {
        next = preferredId;
      } else {
        const taskSession = items.find(
          (item) => effectiveTaskId && item.task_id === effectiveTaskId,
        );
        if (scopeChanged && effectiveTaskId) next = taskSession?.id || "";
        else if (current && items.some((item) => item.id === current)) {
          next = current;
        } else if (taskSession) next = taskSession.id;
        else next = items[0]?.id || "";
      }
      selectedIdRef.current = next;
      return next;
    });
  }, [effectiveTaskId, setError, tt]);

  const refreshEvents = useCallback(async () => {
    const sessionId = selectedIdRef.current;
    if (!sessionId) return;
    const result = await listCloudBrowserEvents(sessionId);
    if (result.ok) setEvents(result.data?.items || []);
  }, []);

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
    setEvents([]);
    setEventId(null);
    if (!selectedId || liveRequested) return;
    let alive = true;
    const refresh = () => {
      void listCloudBrowserEvents(selectedId).then((result) => {
        if (!alive || !result.ok) return;
        const items = result.data?.items || [];
        setEvents(items);
        setEventId((current) => {
          if (
            current &&
            items.some(
              (item) => item.id === current && item.has_screenshot,
            )
          ) {
            return current;
          }
          return (
            [...items]
              .reverse()
              .find((item) => item.has_screenshot)?.id || null
          );
        });
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [liveRequested, selectedId]);

  useEffect(() => {
    if (!eventId) {
      setShotUrl("");
      return;
    }
    let url = "";
    let alive = true;
    void cloudBrowserScreenshot(eventId).then((result) => {
      if (!alive || !result.ok || !result.data) return;
      url = URL.createObjectURL(result.data);
      setShotUrl(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [eventId]);

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
    events,
    eventId,
    setEventId,
    shotUrl,
    deleteArmed,
    setDeleteArmed,
    reload,
    refreshEvents,
    chooseSession,
    upsertSession,
    clearSelection,
  };
}
