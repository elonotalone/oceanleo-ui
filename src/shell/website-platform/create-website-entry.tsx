"use client";

import { useState, type FormEvent } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { COLLECTION_ACTION_BTN_PRIMARY } from "../collection-chrome";
import type { LibraryItem } from "../library-data";
import { createWebsiteFromDescription } from "./create-website";

export function CreateWebsiteEntry({
  disabled,
  onCreated,
}: {
  disabled?: boolean;
  onCreated: (item: LibraryItem) => void;
}) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || disabled || !description.trim()) return;
    setPending(true);
    setError("");
    try {
      const created = await createWebsiteFromDescription(description);
      setOpen(false);
      setDescription("");
      onCreated(created.item);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "网站创建失败，请重试。");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-library-create-website=""
        className={`${COLLECTION_ACTION_BTN_PRIMARY} disabled:pointer-events-none disabled:opacity-50`}
        disabled={disabled}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {tt("新建网站")}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tt("新建网站")}
          data-library-create-website-dialog=""
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/25 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false);
          }}
        >
          <form
            onSubmit={(event) => void submit(event)}
            className="w-full max-w-lg rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-5 shadow-xl"
          >
            <h2 className="text-base font-semibold">{tt("新建网站")}</h2>
            <label className="mt-4 block text-sm text-[var(--fg-2,#57534e)]">
              {tt("描述你想做的网站")}
              <textarea
                autoFocus
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={tt("例如：一个展示作品集和联系方式的简洁网站")}
                rows={4}
                className="mt-2 w-full resize-y rounded-xl border border-[var(--border,#e7e5e4)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent,#4f46e5)]"
                disabled={pending}
              />
            </label>
            {error ? (
              <p role="alert" className="mt-2 text-xs text-rose-600">
                {tt(error)}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                {tt("取消")}
              </button>
              <button
                type="submit"
                className={COLLECTION_ACTION_BTN_PRIMARY}
                disabled={pending || !description.trim()}
              >
                {tt(pending ? "创建中…" : "创建网站")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

