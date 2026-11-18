"use client";

import { useState, type FormEvent } from "react";
import { useWebsiteUI } from "./website-preview-i18n";
import { DEFAULT_WORK_KIND, type WorkKind } from "../works/kinds";
import { COLLECTION_ACTION_BTN_PRIMARY } from "../collection-chrome";
import type { LibraryItem } from "../library-data";
import { HostingTierChoice } from "./HostingTierChoice";
import type { HostingTier } from "./hosting-tier";
import { createWebsiteFromDescription } from "./create-website";

export function CreateWebsiteEntry({
  disabled,
  kind = DEFAULT_WORK_KIND,
  onCreated,
}: {
  disabled?: boolean;
  kind?: WorkKind;
  onCreated: (item: LibraryItem) => void;
}) {
  const tt = useWebsiteUI();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState<HostingTier | "">("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || disabled || !description.trim() || !tier) return;
    setPending(true);
    setError("");
    try {
      const created = await createWebsiteFromDescription(description, tier, kind);
      setOpen(false);
      setDescription("");
      setTier("");
      onCreated(created.item);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "作品创建失败，请重试。");
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
          setTier("");
          setOpen(true);
        }}
      >
        {tt("新建作品")}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tt("新建作品")}
          data-library-create-website-dialog=""
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/25 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false);
          }}
        >
          <form
            onSubmit={(event) => void submit(event)}
            className="max-h-[90vh] overflow-y-auto w-full max-w-lg rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-5 shadow-xl"
          >
            <h2 className="text-base font-semibold">{tt("新建作品")}</h2>
            <label className="mt-4 block text-sm text-[var(--fg-2,#57534e)]">
              {tt("描述你想做的作品")}
              <textarea
                autoFocus
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={tt("例如：一个展示作品集和联系方式的作品")}
                rows={4}
                className="mt-2 w-full resize-y rounded-xl border border-[var(--border,#e7e5e4)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent,#4f46e5)]"
                disabled={pending}
              />
            </label>
            <HostingTierChoice value={tier} onChange={setTier} disabled={pending} />
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
                disabled={pending || !description.trim() || !tier}
              >
                {tt(pending ? "创建中…" : "创建作品")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}


export const CreateWorkEntry = CreateWebsiteEntry;
