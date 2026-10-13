"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { filterLibraryWorks, libraryWorkRef, type BayLibraryWork } from "../../../lib/bay/library";
import type { BayWorkRef } from "../../../lib/bay/types";
import { Modal } from "../../../ui";
import { listMyArtifacts } from "../../artifact-client";
import { isDurableLibraryItem, type LibraryKind } from "../../library-data";
import { requireBayLogin } from "../shell/bay-state";
import { BTN_SECONDARY, INPUT, errorText } from "./need-ui";

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

const KIND_LABEL: Record<LibraryKind, string> = {
  website: "网站",
  canvas: "画布",
  ppt: "PPT",
  sheet: "表格",
  document: "文档",
  image: "图片",
  video: "视频",
  video_canvas: "视频工作流",
  audio: "音频",
  xhs: "小红书",
  threed: "3D",
  game: "游戏",
  geo_map: "地图",
  interactive_doc: "交互文档",
  file: "文件",
};

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

function httpsUrl(value: string | undefined): string {
  const text = (value || "").trim();
  return text.startsWith("https://") ? text : "";
}

/**
 * 从「我的库」挑一份文件：返回 `{ kind: "artifact", id, title }`，取消返回 null。
 * 弹窗由 `LibraryWorkPickerHost` 渲染；没登录先走登录。
 * 这里列的是库里的图片/文档/网站等，不会出现聊天记录。
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
  const ttRef = useRef(tt);
  ttRef.current = tt;
  const titleId = useId();
  const [works, setWorks] = useState<BayLibraryWork[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    listMyArtifacts({ limit: 60 }).then(
      (result) => {
        if (!alive) return;
        if (!result.ok) {
          setWorks([]);
          setError(result.error || ttRef.current("没能读到你的作品，请稍后再试。"));
          return;
        }
        const items: BayLibraryWork[] = [];
        for (const item of result.data?.items || []) {
          if (!isDurableLibraryItem(item)) continue;
          items.push({
            kind: "artifact",
            id: item.artifactId,
            site_key: (item.siteId || "").trim().toLowerCase() || "oceanleo",
            title: (item.title || "").trim(),
            status: item.kind,
            created_at: item.createdAt || null,
            thumb_url: httpsUrl(item.posterUrl || item.thumbUrl),
          });
        }
        setWorks(items);
      },
      (reason: unknown) => {
        if (!alive) return;
        setWorks([]);
        const translate = ttRef.current;
        setError(errorText(translate, reason, translate("没能读到你的作品，请稍后再试。")));
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => filterLibraryWorks(works || [], query), [works, query]);

  return (
    <Modal onClose={() => onDone(null)} labelledBy={titleId} className="max-w-lg">
      <div className="flex max-h-[min(40rem,calc(100dvh-2rem))] min-h-0 flex-col" data-bay-library-picker>
        <header className="shrink-0 border-b border-stone-200 px-5 py-4">
          <h2 id={titleId} className="text-[15px] font-semibold text-stone-800">
            {title || tt("从我的库挑一个作品")}
          </h2>
          <p className="mt-1 text-[12px] text-stone-500">{tt("从你的库里选一份文件，这里不会列出聊天记录。")}</p>
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
                    {work.thumb_url ? (
                      <img src={work.thumb_url} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-stone-100 text-[10px] text-stone-500">
                        {tt(KIND_LABEL[(work.status as LibraryKind) || "file"] || "文件")}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-stone-800">{work.title || tt("未命名作品")}</span>
                      <span className="mt-0.5 block text-[11px] text-stone-400">
                        {tt(KIND_LABEL[(work.status as LibraryKind) || "file"] || "文件")}
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
