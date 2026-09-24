"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  CUSTOM_INSTRUCTIONS_MAX_CHARS,
  countChars,
  updatePersonalization,
  type PersonalizationApiCode,
  type PersonalizationPrefs,
} from "../../../lib/personalization-api";
import { ButtonSpinner, SkeletonLine } from "../../../ui";
import { CARD, FIELD, Note, PRIMARY, QUIET, accentStyle, errorCopy, notAvailableCopy } from "./parts";
import type { PrefsState } from "./state";

type PrefsUpdate = (update: (current: PersonalizationPrefs) => PersonalizationPrefs) => void;

export function CustomInstructionsCard({
  accent,
  prefs,
  loadKey,
  onPrefsChange,
  onRetry,
}: {
  accent?: string;
  prefs: PrefsState;
  /** 每次重新读取偏好就换一个值，编辑框随之丢掉旧草稿。 */
  loadKey: number;
  onPrefsChange: PrefsUpdate;
  onRetry: () => void;
}) {
  const tt = useUI();
  return (
    <section className="space-y-3" data-personalization-section="instructions">
      <h3 className="text-[15px] font-semibold text-neutral-900">{tt("自定义指令")}</h3>
      <div className={CARD} data-personalization-card="instructions">
        <p className="text-[12px] leading-relaxed text-neutral-500">
          {tt("告诉 OceanLeo 你希望它怎么回答：称呼、语气、格式、需要避免的事")}
        </p>
        {prefs.status === "loading" ? (
          <div className="mt-3 space-y-2">
            <SkeletonLine className="h-3 w-4/5" />
            <SkeletonLine className="h-3 w-2/5" />
          </div>
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
        {prefs.status === "ready" ? (
          <InstructionsEditor
            key={loadKey}
            accent={accent}
            saved={prefs.prefs.custom_instructions}
            onPrefsChange={onPrefsChange}
          />
        ) : null}
      </div>
    </section>
  );
}

function InstructionsEditor({
  accent,
  saved,
  onPrefsChange,
}: {
  accent?: string;
  saved: string;
  onPrefsChange: PrefsUpdate;
}) {
  const tt = useUI();
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<PersonalizationApiCode | null>(null);

  const chars = countChars(draft);
  const tooLong = chars > CUSTOM_INSTRUCTIONS_MAX_CHARS;
  const canSubmit = draft !== saved && !tooLong && !saving;

  async function submit() {
    if (!canSubmit) return;
    const text = draft;
    setSaving(true);
    setError(null);
    setJustSaved(false);
    const res = await updatePersonalization({ custom_instructions: text });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const stored = res.data;
    const storedText = stored ? stored.custom_instructions : text;
    onPrefsChange((current) => stored ?? { ...current, custom_instructions: storedText });
    setDraft((current) => (current === text ? storedText : current));
    setJustSaved(true);
  }

  return (
    <div className="mt-3">
      <textarea
        rows={6}
        value={draft}
        placeholder={tt("例如：叫我小李；先给结论再展开；不要用表情符号。")}
        aria-label={tt("自定义指令")}
        aria-invalid={tooLong}
        onChange={(e) => {
          setDraft(e.target.value);
          setJustSaved(false);
          setError(null);
        }}
        className={`${FIELD} resize-y leading-relaxed`}
        data-personalization-instructions
      />
      <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
        <span className="text-red-600">
          {tooLong ? tt("最多 {n} 字", { n: CUSTOM_INSTRUCTIONS_MAX_CHARS }) : ""}
        </span>
        <span
          className={`tabular-nums ${tooLong ? "text-red-600" : "text-neutral-400"}`}
          data-personalization-instructions-count
        >
          {chars} / {CUSTOM_INSTRUCTIONS_MAX_CHARS}
        </span>
      </div>
      {error ? (
        <div className="mt-2">
          <Note kind="error" text={errorCopy(error, tt)} />
        </div>
      ) : null}
      {justSaved ? (
        <div className="mt-2">
          <Note kind="ok" text={tt("已保存")} />
        </div>
      ) : null}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className={PRIMARY}
          style={accentStyle(accent)}
          disabled={!canSubmit}
          onClick={() => void submit()}
          data-personalization-instructions-submit
        >
          {saving ? <ButtonSpinner label={tt("确认")} /> : tt("确认")}
        </button>
      </div>
    </div>
  );
}
