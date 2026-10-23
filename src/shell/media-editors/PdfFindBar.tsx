"use client";

/** 基础编辑的「查找」：舞台右上角一条查找栏，结果在页面上高亮并逐个跳过去。 */
import { useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";
import type { PdfViewerBridge } from "./pdf-viewer-bridge";

export function PdfFindBar({ bridge, onClose }: { bridge: PdfViewerBridge; onClose: () => void }) {
  const tt = useUI();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ total: number; active: number; busy: boolean }>({
    total: 0,
    active: -1,
    busy: false,
  });
  useEffect(() => {
    inputRef.current?.focus();
    return () => bridge.stopFind();
  }, [bridge]);
  useEffect(() => {
    const keyword = query.trim();
    if (!keyword) {
      bridge.stopFind();
      setState({ total: 0, active: -1, busy: false });
      return undefined;
    }
    let alive = true;
    setState((current) => ({ ...current, busy: true }));
    const timer = window.setTimeout(() => {
      bridge
        .find(keyword)
        .then((result) => alive && setState({ ...result, busy: false }))
        .catch(() => alive && setState({ total: 0, active: -1, busy: false }));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [bridge, query]);
  const step = (direction: 1 | -1) => {
    if (!state.total) return;
    const active = bridge.stepFind(direction);
    setState((current) => ({ ...current, active }));
  };
  const count = !query.trim()
    ? ""
    : state.busy
      ? tt("正在查找…")
      : state.total
        ? `${state.active + 1} / ${state.total}`
        : tt("没有找到");
  return (
    <div
      role="search"
      data-pdf-find-bar=""
      className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] p-1 text-[var(--awb-text)] shadow-[var(--awb-shadow-floating)]"
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") step(event.shiftKey ? -1 : 1);
          if (event.key === "Escape") onClose();
        }}
        placeholder={tt("在文档里查找")}
        aria-label={tt("在文档里查找")}
        className="h-8 w-48 rounded-lg bg-transparent px-2 text-[13px] outline-none placeholder:text-[var(--awb-muted)]"
      />
      <span aria-live="polite" className="min-w-14 px-1 text-center text-[12px] tabular-nums text-[var(--awb-muted)]">
        {count}
      </span>
      <button
        type="button"
        aria-label={tt("上一个")}
        disabled={!state.total}
        onClick={() => step(-1)}
        className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[var(--awb-hover)] disabled:opacity-35"
      >
        <AdvancedEditorIcon name="chevron" className="h-4 w-4 rotate-180" />
      </button>
      <button
        type="button"
        aria-label={tt("下一个")}
        disabled={!state.total}
        onClick={() => step(1)}
        className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[var(--awb-hover)] disabled:opacity-35"
      >
        <AdvancedEditorIcon name="chevron" className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={tt("关闭查找")}
        onClick={onClose}
        className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[var(--awb-hover)]"
      >
        <AdvancedEditorIcon name="close" className="h-4 w-4" />
      </button>
    </div>
  );
}
