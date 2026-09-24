"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  updatePersonalization,
  type PersonalizationApiCode,
  type PersonalizationPrefs,
} from "../../../lib/personalization-api";
import { SkeletonLine, Switch } from "../../../ui";
import { CARD, CARD_DESC, CARD_TITLE, Note, QUIET, errorCopy, notAvailableCopy } from "./parts";
import type { PrefsState } from "./state";

export function MemoryToggleCard({
  prefs,
  onPrefsChange,
  onRetry,
}: {
  prefs: PrefsState;
  onPrefsChange: (update: (current: PersonalizationPrefs) => PersonalizationPrefs) => void;
  onRetry: () => void;
}) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PersonalizationApiCode | null>(null);

  async function toggle(next: boolean) {
    if (prefs.status !== "ready" || busy) return;
    const previous = prefs.prefs.memory_enabled;
    setError(null);
    setBusy(true);
    onPrefsChange((current) => ({ ...current, memory_enabled: next }));
    const res = await updatePersonalization({ memory_enabled: next });
    setBusy(false);
    if (!res.ok) {
      onPrefsChange((current) => ({ ...current, memory_enabled: previous }));
      setError(res.error);
      return;
    }
    const stored = res.data;
    if (stored) onPrefsChange(() => stored);
  }

  const enabled = prefs.status === "ready" && prefs.prefs.memory_enabled;

  return (
    <div className={CARD} data-personalization-card="memory-toggle">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={CARD_TITLE}>{tt("生成对话记忆")}</p>
          <p className={CARD_DESC}>
            {tt("允许 OceanLeo 根据你们的对话，生成并记住你的偏好与常用做法")}
          </p>
        </div>
        {prefs.status === "ready" ? (
          <Switch
            checked={enabled}
            onChange={(next) => void toggle(next)}
            disabled={busy}
            label={tt("生成对话记忆")}
          />
        ) : prefs.status === "loading" ? (
          <SkeletonLine className="h-5 w-9" />
        ) : null}
      </div>
      {prefs.status === "ready" && !enabled ? (
        <p className="mt-3 text-[12px] leading-relaxed text-neutral-500" data-personalization-memory-off>
          {tt("已关闭：OceanLeo 不会再生成或使用记忆。已有的记忆会保留，随时可以重新打开。")}
        </p>
      ) : null}
      {prefs.status === "failed" && prefs.code === "not_available" ? (
        <div className="mt-3">
          <Note kind="info" text={notAvailableCopy(tt)} />
        </div>
      ) : null}
      {prefs.status === "failed" && prefs.code !== "not_available" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Note kind="error" text={errorCopy(prefs.code, tt)} />
          <button type="button" className={QUIET} onClick={onRetry}>
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3">
          <Note kind="error" text={errorCopy(error, tt)} />
        </div>
      ) : null}
    </div>
  );
}
