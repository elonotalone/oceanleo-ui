"use client";

import { useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { appShareHref } from "./insights-model";

export function ShareLinkButton({ appId }: { appId: string }): ReactElement {
  const tt = useUI();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const href = appShareHref(appId, origin);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function copy() {
    setError("");
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
    } catch {
      setCopied(false);
      setError(tt("没能复制，请手动选中复制"));
    }
  }

  return (
    <div data-bay-share className="space-y-1.5">
      <p className="text-[12px] font-medium text-neutral-600">{tt("分享链接")}</p>
      <code data-bay-share-link className="block overflow-x-auto rounded-lg bg-neutral-50 px-3 py-2 text-[12px] text-neutral-800">
        {href}
      </code>
      <button
        type="button"
        data-bay-share-copy
        onClick={() => void copy()}
        className="rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700"
      >
        {copied ? tt("已复制") : tt("复制")}
      </button>
      {error ? <p className="text-[12px] text-rose-600">{error}</p> : null}
    </div>
  );
}
