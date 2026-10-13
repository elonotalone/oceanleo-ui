"use client";

import { useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayAppThreadInput, BayAppThreadKind, BayAppThreadVisibility } from "../../../lib/bay/app-feedback";
import { BayRevealForm } from "../form";
import { BODY_MAX, KIND_FILTERS, TITLE_MAX, composerProblem, kindLabel } from "./feedback-model";

const FIELD = "mt-1 w-full rounded-full border border-neutral-900 bg-white px-3 py-2 text-[13px] outline-none focus:border-stone-400";
const CHIP =
  "rounded-lg border px-2.5 py-1 text-[12px] ";
const CHIP_ON = "border-neutral-900 bg-neutral-900 text-white";
const CHIP_OFF = "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50";

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
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void publish();
      }}
    >
      <p className="text-[12.5px] font-medium text-neutral-800">{tt("写留言")}</p>
      <BayRevealForm
        items={[
          {
            id: "kind",
            label: tt("类型"),
            done: true,
            summary: tt(kindLabel(kind)),
            children: (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={tt("类型")}>
                {KIND_FILTERS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    data-bay-composer-kind={value}
                    aria-pressed={kind === value}
                    onClick={() => setKind(value)}
                    className={CHIP + (kind === value ? CHIP_ON : CHIP_OFF)}
                  >
                    {tt(kindLabel(value))}
                  </button>
                ))}
              </div>
            ),
          },
          {
            id: "visibility",
            label: tt(visibility === "public" ? "公开" : "只给作者看"),
            done: true,
            children: (
              <div className="flex flex-wrap gap-1.5">
                {(["public", "private"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    data-bay-visibility={value}
                    aria-pressed={visibility === value}
                    onClick={() => setVisibility(value)}
                    className={CHIP + (visibility === value ? CHIP_ON : CHIP_OFF)}
                  >
                    {value === "public" ? tt("公开") : tt("只给作者看")}
                  </button>
                ))}
              </div>
            ),
          },
          {
            id: "title",
            label: tt("标题"),
            done: title.trim().length >= 2,
            summary: title.trim() || undefined,
            children: (
              <input
                value={title}
                maxLength={TITLE_MAX + 8}
                onChange={(event) => setTitle(event.target.value)}
                data-bay-field="title"
                className={FIELD}
              />
            ),
          },
          {
            id: "body",
            label: tt("正文"),
            done: body.trim().length >= 5,
            summary: body.trim() || undefined,
            children: (
              <textarea
                value={body}
                maxLength={BODY_MAX + 8}
                rows={4}
                onChange={(event) => setBody(event.target.value)}
                data-bay-field="body"
                className={FIELD}
              />
            ),
          },
        ]}
      />
      {fieldError.title ? (
        <p data-bay-field-error="title" className="text-[12px] text-rose-600">
          {tt(fieldError.title)}
        </p>
      ) : null}
      {fieldError.body ? (
        <p data-bay-field-error="body" className="text-[12px] text-rose-600">
          {tt(fieldError.body)}
        </p>
      ) : null}
      {error ? <p className="text-[12px] text-rose-600">{error}</p> : null}
      <button
        type="submit"
        data-bay-action="submit-thread"
        disabled={busy}
        className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {busy ? tt("提交中…") : tt("发布")}
      </button>
    </form>
  );
}
