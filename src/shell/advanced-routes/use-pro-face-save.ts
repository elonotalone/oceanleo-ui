"use client";

import { useEffect, useMemo } from "react";
import { bindProFaceHandoff } from "./editor-handoff";

/**
 * Thin face of the shared persist pipeline. The returned flush is the
 * editor's own save (what `persistence.flush` already is). Mode switch
 * must go through `saveBeforeLeavePro` / the draft gate — this hook
 * must not grow a second leave-and-lock save.
 */
export function useProFaceSave<T extends { ok: boolean }>(
  key: string,
  dirty: boolean,
  revision: number,
  save: () => Promise<T>,
) {
  const owner = useMemo(() => {
    const state = {
      current: { dirty, revision, save },
      flight: null as Promise<T | { ok: false; error: string }> | null,
      committed: null as { revision: number; result: T } | null,
    };
    const flush = () => {
      if (state.flight) return state.flight;
      const captured = state.current;
      if (state.committed?.revision === captured.revision) {
        return Promise.resolve(state.committed.result);
      }
      const running = Promise.resolve()
        .then(captured.save)
        .then((result) => {
          if (result.ok) {
            state.committed = { revision: captured.revision, result };
          }
          return result;
        })
        .catch((error) => ({
          ok: false as const,
          error: error instanceof Error ? error.message : "save failed",
        }));
      state.flight = running;
      void running
        .finally(() => {
          if (state.flight === running) state.flight = null;
        })
        .catch(() => {});
      return running;
    };
    return { state, flush };
    // Each item gets a separate ledger; old background saves retain their owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  owner.state.current = { dirty, revision, save };
  useEffect(
    () =>
      bindProFaceHandoff(key, {
        hasUnsavedChanges: () =>
          owner.state.current.dirty &&
          owner.state.committed?.revision !== owner.state.current.revision,
        flush: async () => (await owner.flush()).ok,
      }),
    [key, owner],
  );
  return owner.flush;
}
