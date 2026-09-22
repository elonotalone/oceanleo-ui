"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { saveCursorKey } from "./cursor-key-api";

function spoken(tt: ReturnType<typeof useUI>, message: string): string {
  const text = message.trim();
  if (text === "这台电脑不在线。") return tt("这台电脑不在线。");
  if (!text || text === "没留下。") return tt("没留下。");
  return text;
}

export function CursorKeySheet({
  open,
  computerId,
  onClose,
}: {
  open: boolean;
  computerId: string;
  onClose: () => void;
}) {
  const tt = useUI();
  const savingRef = useRef(false);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) return;
    savingRef.current = false;
    setKey("");
    setError("");
    setSaving(false);
  }, [open]);

  if (!open) return null;

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await saveCursorKey(computerId, key);
      setKey("");
      savingRef.current = false;
      setSaving(false);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(spoken(tt, message));
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      data-oceanleo-cc-cursor-key-sheet=""
      className="absolute inset-x-0 bottom-0 z-10 border-t border-neutral-700 bg-neutral-900 px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] text-neutral-100">{tt("Key")}</p>
        <button
          type="button"
          data-oceanleo-cc-cursor-key-close=""
          disabled={saving}
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-[12px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
        >
          {tt("关闭")}
        </button>
      </div>
      <label className="block text-[11px] text-neutral-500">
        {tt("Key")}
        <input
          type="password"
          autoComplete="off"
          data-oceanleo-cc-cursor-key-input=""
          value={key}
          disabled={saving}
          onChange={(event) => setKey(event.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 font-mono text-[12px] text-neutral-100 outline-none disabled:opacity-50"
        />
      </label>
      {error ? (
        <p data-oceanleo-cc-cursor-key-error="" className="mt-2 text-[12px] text-rose-300">
          {error}
        </p>
      ) : null}
      <div className="mt-3">
        <button
          type="submit"
          data-oceanleo-cc-cursor-key-save=""
          disabled={saving}
          className="rounded-lg bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-900 disabled:opacity-50"
        >
          {tt("保存")}
        </button>
      </div>
    </form>
  );
}
