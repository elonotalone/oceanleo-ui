"use client";

import { useEffect, useRef } from "react";
import type {
  AdvancedEditRevision,
  AdvancedPersistenceState,
} from "./advanced-persistence-controller";
import {
  deleteAdvancedRecovery,
  readAdvancedRecovery,
  writeAdvancedRecovery,
} from "./advanced-recovery-store";
import type { AdvancedEditorRecoveryAdapter } from "./advanced-editor-adapter";

const RECOVERY_DEBOUNCE_MS = 450;

export function useAdvancedRecovery({
  editorId,
  revision,
  dirty,
  persistenceState,
  recovery,
}: {
  editorId: string;
  revision: AdvancedEditRevision;
  dirty: boolean;
  persistenceState: AdvancedPersistenceState;
  recovery?: AdvancedEditorRecoveryAdapter;
}): void {
  const recoveryRef = useRef(recovery);
  const restoredKeyRef = useRef("");
  const hadDirtyRef = useRef(false);
  recoveryRef.current = recovery;

  useEffect(() => {
    const active = recoveryRef.current;
    if (!active?.ready || restoredKeyRef.current === active.key) return;
    let cancelled = false;
    restoredKeyRef.current = active.key;
    void readAdvancedRecovery(active.key)
      .then(async (record) => {
        if (cancelled || !record) return;
        const latest = recoveryRef.current;
        if (!latest || latest.key !== record.key || !latest.ready) return;
        const restored = await latest.restore(record.payload);
        if (restored !== false) hadDirtyRef.current = true;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [recovery?.key, recovery?.ready]);

  useEffect(() => {
    const active = recoveryRef.current;
    if (!dirty || !active?.ready) return;
    hadDirtyRef.current = true;
    const persist = () => {
      const latest = recoveryRef.current;
      if (!latest?.ready) return;
      void Promise.resolve(latest.capture())
        .then((payload) =>
          writeAdvancedRecovery({
            key: latest.key,
            editorId,
            revision,
            updatedAt: Date.now(),
            payload,
          }),
        )
        .catch(() => undefined);
    };
    const timer = window.setTimeout(persist, RECOVERY_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      persist();
    };
  }, [dirty, editorId, recovery?.key, recovery?.ready, revision]);

  useEffect(() => {
    const active = recoveryRef.current;
    if (
      !active ||
      dirty ||
      persistenceState !== "saved" ||
      !hadDirtyRef.current
    ) {
      return;
    }
    hadDirtyRef.current = false;
    void deleteAdvancedRecovery(active.key).catch(() => undefined);
  }, [dirty, persistenceState, recovery?.key]);
}
