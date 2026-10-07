"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { filterLibraryWorks, libraryWorkRef, listLibraryWorks, type BayLibraryWork } from "../../../lib/bay/library";
import type { BayWorkRef } from "../../../lib/bay/types";
import { Modal } from "../../../ui";
import { requireBayLogin } from "../shell/bay-state";
import { BTN_SECONDARY, INPUT, errorText } from "./need-ui";
import { siteLabel, timeAgoText } from "./need-format";

interface PickRequest {
  seq: number;
  title?: string;
  resolve: (work: BayWorkRef | null) => void;
}

let request: PickRequest | null = null;
let requestSeq = 0;
let hostSeq = 0;
const hosts: number[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function settle(work: BayWorkRef | null): void {
  const current = request;
  request = null;
  emit();
  current?.resolve(work);
}

/**
 * 从「我的库」挑一个作品：返回 `{ kind: "task", id, site_key, title }`，取消返回 null。
 * 弹窗由 `LibraryWorkPickerHost` 渲染，调用处的界面树里要挂着一个（Bay 外壳与本目录的表单都挂）；
 * 一个都没挂时直接返回 null。没登录先走登录。
 */
export function pickLibraryWork(opts?: { title?: string }): Promise<BayWorkRef | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!requireBayLogin()) return Promise.resolve(null);
  if (hosts.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    if (request) request.resolve(null);
    requestSeq += 1;
    request = { seq: requestSeq, title: opts?.title, resolve };
    emit();
  });
}

/** 挂几个都只有最早挂上的那个渲染弹窗。 */
export function LibraryWorkPickerHost() {
  const [id] = useState(() => {
    hostSeq += 1;
    return hostSeq;
  });
  useEffect(() => {
    hosts.push(id);
    emit();
    return () => {
      const index = hosts.indexOf(id);
      if (index >= 0) hosts.splice(index, 1);
      if (hosts.length === 0 && request) settle(null);
      else emit();
    };
  }, [id]);
  const active = useSyncExternalStore(
    subscribe,
    () => (hosts[0] === id ? request : null),
    () => null,
  );
  if (!active) return null;
  return <LibraryWorkPickerDialog key={active.seq} title={active.title} onDone={settle} />;
}

function LibraryWorkPickerDialog({ title, onDone }: { title?: string; onDone: (work: BayWorkRef | null) => void }) {
  const tt = useUI();
  const titleId = useId();
  const [works, setWorks] = useState<BayLibraryWork[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    listLibraryWorks().then(
      (items) => {
        if (alive) setWorks(items);
      },
      (reason: unknown) => {
        if (!alive) return;
        setWorks([]);
        setError(errorText(tt, reason, tt("没能读到你的作品，请稍后再试。")));
      },
    );
    return () => {
      alive = false;
    };
  }, [tt]);

  const shown = useMemo(() => filterLibraryWorks(works || [], query), [works, query]);

  return (
    <Modal onClose={() => onDone(null)} labelledBy={titleId} className="max-w-lg">
      <div className="flex max-h-[min(40rem,calc(100dvh-2rem))] min-h-0 flex-col" data-bay-library-picker>
        <header className="shrink-0 border-b border-stone-200 px-5 py-4">
          <h2 id={titleId} className="text-[15px] font-semibold text-stone-800">
            {title || tt("从我的库挑一个作品")}
          </h2>
          <p className="mt-1 text-[12px] text-stone-500">{tt("对方签约前只能只读预览，签约后才能在编辑器里打开。")}</p>
        </header>
        <div className="shrink-0 px-5 pt-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tt("搜索作品标题")}
            className={INPUT}
            aria-label={tt("搜索作品标题")}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {works === null ? (
            <p className="py-6 text-center text-[13px] text-stone-400">{tt("加载中…")}</p>
          ) : error ? (
            <p className="py-6 text-center text-[13px] text-rose-500">{error}</p>
          ) : shown.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-stone-400">
              {works.length === 0 ? tt("你的库里还没有作品。") : tt("没有找到匹配的作品。")}
            </p>
          ) : (
            <ul className="space-y-1">
              {shown.map((work) => (
                <li key={work.id}>
                  <button
                    type="button"
                    onClick={() => onDone(libraryWorkRef(work))}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-50"
                    data-bay-library-work={work.id}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-stone-800">{work.title || tt("未命名作品")}</span>
                      <span className="mt-0.5 block text-[11px] text-stone-400">
                        {siteLabel(tt, work.site_key)} · {timeAgoText(tt, work.created_at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="flex shrink-0 justify-end border-t border-stone-200 px-5 py-3">
          <button type="button" className={BTN_SECONDARY} onClick={() => onDone(null)}>
            {tt("取消")}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
