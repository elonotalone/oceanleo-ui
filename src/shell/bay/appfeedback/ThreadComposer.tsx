"use client";

import { useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayAppThreadInput, BayAppThreadKind, BayAppThreadVisibility } from "../../../lib/bay/app-feedback";
import { BODY_MAX, KIND_FILTERS, TITLE_MAX, composerProblem, kindLabel } from "./feedback-model";

export function ThreadComposer({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string;
  onSubmit: (input: BayAppThreadInput) => Promise<void>;
}): ReactElement {
  const tt = useUI();
  const [kind, setKind] = useState<BayAppThreadKind>("question");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<BayAppThreadVisibility>("public");
  const [fieldError, setFieldError] = useState<{ title: string | null; body: string | null }>({ title: null, body: null });

  async function publish() {
    const problem = composerProblem({ title, body });
    setFieldError(problem);
    if (problem.title || problem.body) return;
    await onSubmit({ kind, title: title.trim(), body: body.trim(), visibility });
  }

  return (
    <form
      data-bay-thread-composer
      className="space-y-2 rounded-xl border border-neutral-200 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void publish();
      }}
    >
      <p className="text-[12.5px] font-medium text-neutral-800">{tt("写留言")}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={tt("写留言")}>
        {KIND_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            data-bay-composer-kind={value}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={
              "rounded-lg border px-2.5 py-1 text-[12px] " +
              (kind === value
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 text-neutral-700 hover:bg-neutral-50")
            }
          >
            {tt(kindLabel(value))}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-[12px] text-neutral-600">{tt("标题")}</span>
        <input
          value={title}
          maxLength={TITLE_MAX + 8}
          onChange={(event) => setTitle(event.target.value)}
          data-bay-field="title"
          className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-stone-400"
        />
        {fieldError.title ? (
          <p data-bay-field-error="title" className="mt-1 text-[12px] text-rose-600">
            {tt(fieldError.title)}
          </p>
        ) : null}
      </label>
      <label className="block">
        <span className="text-[12px] text-neutral-600">{tt("正文")}</span>
        <textarea
          value={body}
          maxLength={BODY_MAX + 8}
          rows={4}
          onChange={(event) => setBody(event.target.value)}
          data-bay-field="body"
          className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-stone-400"
        />
        {fieldError.body ? (
          <p data-bay-field-error="body" className="mt-1 text-[12px] text-rose-600">
            {tt(fieldError.body)}
          </p>
        ) : null}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {(["public", "private"] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-bay-visibility={value}
            aria-pressed={visibility === value}
            onClick={() => setVisibility(value)}
            className={
              "rounded-lg border px-2.5 py-1 text-[12px] " +
              (visibility === value
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 text-neutral-700 hover:bg-neutral-50")
            }
          >
            {value === "public" ? tt("公开") : tt("只给作者看")}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-neutral-500">{tt("报错里有账号、截图等私人内容时选只给作者看")}</p>
      {error ? <p className="text-[12px] text-rose-600">{error}</p> : null}
      <button
        type="submit"
        data-bay-action="submit-thread"
        disabled={busy}
        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {busy ? tt("提交中…") : tt("发布")}
      </button>
    </form>
  );
}
