"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { normalizeLocale, type Locale } from "../../../i18n/config";
import { useUI } from "../../../i18n/ui/useUI";
import {
  MEMORY_IMPORT_MAX_CHARS,
  countChars,
  getMemoryImportPrompt,
  importMemories,
  type MemoryImportResult,
  type PersonalizationApiCode,
} from "../../../lib/personalization-api";
import { writeClipboardText } from "../../../shell/share/share-clipboard";
import { ButtonSpinner, Modal } from "../../../ui";
import {
  CARD,
  CARD_DESC,
  CARD_TITLE,
  FIELD,
  Note,
  PRIMARY,
  QUIET,
  accentStyle,
  errorCopy,
  notAvailableCopy,
  skipReasonCopy,
} from "./parts";

type PromptState =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "failed"; code: PersonalizationApiCode };

const STEP_BADGE =
  "mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white";

function useCurrentLocale(): Locale {
  try {
    return normalizeLocale(useLocale());
  } catch {
    return "zh";
  }
}

/**
 * `available`：`false` = 网关上没有个性化端点（导入与它同批上线，同样不在），
 * 这一行只说「还没启用」、不给入口；`true` / `null`（还在读）都给入口，
 * 对话框自己再按提示词端点的回执判一次。
 */
export function MemoryImportRow({
  accent,
  available,
  onImported,
}: {
  accent?: string;
  available: boolean | null;
  onImported: () => void;
}) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  return (
    <div className={CARD} data-personalization-card="memory-import">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={CARD_TITLE}>{tt("从其他 AI 导入记忆")}</p>
          <p className={CARD_DESC}>{tt("把其他 AI 记得的关于你的信息搬到 OceanLeo。")}</p>
        </div>
        {available !== false ? (
          <button
            type="button"
            className={`${QUIET} shrink-0`}
            onClick={() => setOpen(true)}
            data-personalization-import-open
          >
            {tt("导入")}
          </button>
        ) : null}
      </div>
      {available === false ? (
        <div className="mt-3">
          <Note kind="info" text={notAvailableCopy(tt)} />
        </div>
      ) : null}
      {open ? (
        <MemoryImportDialog accent={accent} onClose={() => setOpen(false)} onImported={onImported} />
      ) : null}
    </div>
  );
}

export function MemoryImportDialog({
  accent,
  onClose,
  onImported,
}: {
  accent?: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const tt = useUI();
  const locale = useCurrentLocale();
  const titleId = useId();
  const answerId = useId();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState<PromptState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [answer, setAnswer] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<PersonalizationApiCode | null>(null);
  const [result, setResult] = useState<MemoryImportResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPrompt({ status: "loading" });
    void getMemoryImportPrompt(locale).then((res) => {
      if (cancelled) return;
      setPrompt(res.ok ? { status: "ready", text: res.data } : { status: "failed", code: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [locale, attempt]);

  const notAvailable = prompt.status === "failed" && prompt.code === "not_available";
  const text = answer.trim();
  const textChars = countChars(text);
  const textTooLong = textChars > MEMORY_IMPORT_MAX_CHARS;
  const canImport = !notAvailable && textChars > 0 && !textTooLong && !importing;

  async function copyPrompt() {
    if (prompt.status !== "ready") return;
    const copied = await writeClipboardText(prompt.text);
    setCopyState(copied ? "copied" : "failed");
    if (!copied) {
      promptRef.current?.focus();
      promptRef.current?.select();
    }
  }

  async function runImport() {
    if (!canImport) return;
    setImporting(true);
    setError(null);
    const res = await importMemories(text);
    setImporting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.data);
    setAnswer("");
    onImported();
  }

  return (
    <Modal onClose={onClose} className="max-w-lg" labelledBy={titleId}>
      <div className="max-h-[85vh] overflow-y-auto p-5" data-personalization-import-dialog>
        <h3 id={titleId} className="text-[15px] font-semibold text-neutral-900">
          {tt("从其他 AI 导入记忆")}
        </h3>

        {notAvailable ? (
          <div className="mt-4">
            <Note kind="info" text={notAvailableCopy(tt)} />
          </div>
        ) : (
          <>
            <section className="mt-4" data-personalization-import-step="1">
              <p className="flex items-start text-[13px] leading-relaxed text-neutral-700">
                <span className={STEP_BADGE}>1</span>
                {tt("把这段话发给你常用的 AI，让它总结它记得的关于你的信息")}
              </p>
              {prompt.status === "loading" ? (
                <p className="mt-2 text-[12px] text-neutral-500">{tt("加载中…")}</p>
              ) : null}
              {prompt.status === "failed" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Note kind="error" text={errorCopy(prompt.code, tt)} />
                  <button type="button" className={QUIET} onClick={() => setAttempt((n) => n + 1)}>
                    {tt("重试")}
                  </button>
                </div>
              ) : null}
              {prompt.status === "ready" ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    ref={promptRef}
                    readOnly
                    rows={6}
                    value={prompt.text}
                    className={`${FIELD} resize-none bg-neutral-50 text-[13px] leading-relaxed text-neutral-700`}
                    data-personalization-import-prompt
                  />
                  <button
                    type="button"
                    className={QUIET}
                    onClick={() => void copyPrompt()}
                    data-personalization-import-copy
                  >
                    {copyState === "copied" ? tt("已复制") : tt("复制")}
                  </button>
                  {copyState === "failed" ? (
                    <Note kind="error" text={tt("复制失败，请手动选中上面的文字复制。")} />
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="mt-5" data-personalization-import-step="2">
              <label
                htmlFor={answerId}
                className="flex items-start text-[13px] leading-relaxed text-neutral-700"
              >
                <span className={STEP_BADGE}>2</span>
                {tt("把它的回答粘贴到这里")}
              </label>
              <textarea
                id={answerId}
                rows={8}
                value={answer}
                aria-invalid={textTooLong}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  setError(null);
                }}
                className={`${FIELD} mt-2 resize-y text-[13px]`}
                data-personalization-import-answer
              />
              <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
                <span className="text-red-600">
                  {textTooLong ? tt("最多 {n} 字", { n: MEMORY_IMPORT_MAX_CHARS }) : ""}
                </span>
                <span className={`tabular-nums ${textTooLong ? "text-red-600" : "text-neutral-400"}`}>
                  {textChars} / {MEMORY_IMPORT_MAX_CHARS}
                </span>
              </div>
              {error ? (
                <div className="mt-2">
                  <Note kind="error" text={errorCopy(error, tt)} />
                </div>
              ) : null}
              {result ? <ImportResultSummary result={result} /> : null}
            </section>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={QUIET} onClick={onClose} data-personalization-import-close>
            {result ? tt("完成") : tt("关闭")}
          </button>
          {notAvailable ? null : (
            <button
              type="button"
              className={PRIMARY}
              style={accentStyle(accent)}
              disabled={!canImport}
              onClick={() => void runImport()}
              data-personalization-import-submit
            >
              {importing ? <ButtonSpinner label={tt("导入")} /> : tt("导入")}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ImportResultSummary({ result }: { result: MemoryImportResult }) {
  const tt = useUI();
  return (
    <div
      className="mt-3 rounded-lg border border-neutral-200 p-3"
      role="status"
      data-personalization-import-result
    >
      <p className="text-[13px] font-medium text-neutral-900">
        {tt("导入 {imported} 条，跳过 {skipped} 条", {
          imported: result.imported,
          skipped: result.skipped.length,
        })}
      </p>
      {result.skipped.length > 0 ? (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
          {result.skipped.map((skip, index) => (
            <li
              key={`${index}:${skip.content}`}
              className="break-words text-[12px] text-neutral-500"
              data-personalization-import-skip
            >
              <span className="text-neutral-700">{skip.content || "—"}</span>
              {" · "}
              {skipReasonCopy(skip.reason, tt)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
