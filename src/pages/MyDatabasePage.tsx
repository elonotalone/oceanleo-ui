"use client";

// ============================================================================
// @oceanleo/ui — 「我的数据库」统一页面 + 可嵌入面板（单一事实源）
// ----------------------------------------------------------------------------
// 替代旧的「我的图片（image 站私有作品库）」。全 OceanLeo 系列共享同一个数据库，
// 跨站可见，分三个子页签：
//   作品   —— 用户在各站产出的全部 AI 作品（图片/视频/3D/数字人/音频/Logo/PPT…）
//   素材   —— 用户上传 / 收藏进来的输入素材
//   知识库 —— 用户写下 / 上传、供各站 AI 生成参考的知识条目
//
// 两种用法：
//   <MyDatabasePage />      作为整页内容（包进各站 <AppShell>，放在 /database 路由）
//   <MyDatabasePanel />     嵌入三栏工作台右列 ResultCanvas 的「我的数据库」标签
// ============================================================================

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  getDatabaseOverview,
  deleteWork,
  deleteAsset,
  addKnowledge,
  deleteKnowledge,
  MEDIA_TYPE_LABEL,
  type DatabaseOverview,
  type WorkItem,
  type AssetItem,
  type KnowledgeItem,
} from "../lib/database";
import { useUI } from "../i18n/ui/useUI";

type Tab = "works" | "assets" | "knowledge";

const TABS: { id: Tab; label: string }[] = [
  { id: "works", label: "作品" },
  { id: "assets", label: "素材" },
  { id: "knowledge", label: "知识库" },
];

export interface MyDatabasePanelProps {
  /** 默认子页签，默认「作品」。 */
  defaultTab?: Tab;
  /** 强调色（删除按钮/选中态等），默认 indigo。 */
  accent?: string;
  /** 点击某条作品/素材的回调（如三栏工作台里「用作参考」）。 */
  onPick?: (url: string, item: WorkItem | AssetItem) => void;
  /** 仅展示某媒体类型的作品/素材（如 video 站只看视频）；不传=全部。 */
  mediaType?: WorkItem["media_type"];
}

export function MyDatabasePanel({
  defaultTab = "works",
  accent = "#4f46e5",
  onPick,
  mediaType,
}: MyDatabasePanelProps) {
  const tt = useUI();
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [ov, setOv] = useState<DatabaseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await getDatabaseOverview({ mediaType, limit: 200 });
    setLoading(false);
    if (!r.ok || !r.data) {
      setError(r.status === 401 ? tt("登录后即可在这里看到你的数据库。") : r.error || tt("加载失败"));
      return;
    }
    setOv(r.data);
  }, [mediaType, tt]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  async function onDeleteWork(id: string) {
    setOv((o) => (o ? { ...o, works: o.works.filter((w) => w.id !== id) } : o));
    await deleteWork(id);
  }
  async function onDeleteAsset(id: string) {
    setOv((o) => (o ? { ...o, assets: o.assets.filter((a) => a.id !== id) } : o));
    await deleteAsset(id);
  }
  async function onDeleteKnowledge(id: string) {
    setOv((o) => (o ? { ...o, knowledge: o.knowledge.filter((k) => k.id !== id) } : o));
    await deleteKnowledge(id);
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-stone-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 子页签 + 计数 */}
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
          {TABS.map((t) => {
            const n = ov?.counts?.[t.id] ?? 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  tab === t.id ? "bg-white text-stone-800 shadow-sm" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {tt(t.label)}
                {n > 0 && <span className="ml-1 text-[11px] text-stone-400">{n}</span>}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-stone-400">{loading ? tt("加载中…") : tt("全 OceanLeo 系列共享 · 跨站可见")}</span>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "works" && (
          <MediaGrid
            loading={loading}
            items={ov?.works ?? []}
            accent={accent}
            emptyText={tt("还没有作品，去各站生成第一件作品吧。")}
            onZoom={setZoom}
            onPick={onPick}
            onDelete={onDeleteWork}
            badge={(it) => (it as WorkItem).media_type}
          />
        )}
        {tab === "assets" && (
          <MediaGrid
            loading={loading}
            items={ov?.assets ?? []}
            accent={accent}
            emptyText={tt("还没有上传素材。生成时上传/拖入的图片会归档到这里。")}
            onZoom={setZoom}
            onPick={onPick}
            onDelete={onDeleteAsset}
            badge={(it) => (it as AssetItem).media_type}
          />
        )}
        {tab === "knowledge" && (
          <KnowledgeList
            loading={loading}
            items={ov?.knowledge ?? []}
            accent={accent}
            onAdded={() => void load()}
            onDelete={onDeleteKnowledge}
          />
        )}
      </div>

      {zoom && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setZoom(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt={tt("放大预览")} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        </div>
      )}
    </div>
  );
}

function isVideoLike(mt?: string, url?: string): boolean {
  if (mt === "video" || mt === "avatar") return true;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url || "");
}

function MediaGrid({
  loading,
  items,
  accent,
  emptyText,
  onZoom,
  onPick,
  onDelete,
  badge,
}: {
  loading: boolean;
  items: (WorkItem | AssetItem)[];
  accent: string;
  emptyText: string;
  onZoom: (src: string) => void;
  onPick?: (url: string, item: WorkItem | AssetItem) => void;
  onDelete: (id: string) => void;
  badge?: (it: WorkItem | AssetItem) => string | undefined;
}) {
  const tt = useUI();
  if (!loading && items.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center text-stone-400">
        <svg className="h-12 w-12 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.8" />
          <path d="M4 17l5-5 4 4 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="grid auto-rows-min grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {loading && items.length === 0
        ? Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-stone-100" />
          ))
        : items.map((c) => {
            const mt = badge?.(c);
            const thumb = c.thumb_url || c.url;
            const video = isVideoLike(mt, c.url);
            return (
              <div
                key={c.id}
                className="group relative aspect-square overflow-hidden rounded-xl border border-stone-200 bg-stone-50 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                title={c.title || (c as WorkItem).prompt || ""}
              >
                {video && !c.thumb_url ? (
                  <video src={c.url} muted className="h-full w-full object-cover" onClick={() => onZoom(c.url)} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={c.title || ""}
                    loading="lazy"
                    onClick={() => onZoom(c.url)}
                    className="h-full w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
                {mt && (
                  <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {tt(MEDIA_TYPE_LABEL[mt as keyof typeof MEDIA_TYPE_LABEL] || mt)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="absolute right-1.5 top-1.5 z-10 hidden h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white group-hover:flex"
                  aria-label={tt("删除")}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
                {onPick && (
                  <button
                    type="button"
                    onClick={() => onPick(c.url, c)}
                    className="absolute inset-x-1.5 bottom-1.5 hidden rounded-lg py-1 text-[11px] font-medium text-white group-hover:block"
                    style={{ background: `${accent}e6` }}
                  >
                    {tt("用作参考")}
                  </button>
                )}
              </div>
            );
          })}
    </div>
  );
}

function KnowledgeList({
  loading,
  items,
  accent,
  onAdded,
  onDelete,
}: {
  loading: boolean;
  items: KnowledgeItem[];
  accent: string;
  onAdded: () => void;
  onDelete: (id: string) => void;
}) {
  const tt = useUI();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() && !content.trim()) return;
    setSaving(true);
    const r = await addKnowledge({ title: title.trim(), content: content.trim() });
    setSaving(false);
    if (r.ok) {
      setTitle("");
      setContent("");
      onAdded();
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={tt("知识条目标题（如：我的品牌调性）")}
          className="w-full border-0 bg-transparent px-1 py-1 text-[14px] font-medium text-stone-800 outline-none placeholder:text-stone-400"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder={tt("写下供各站 AI 生成时参考的内容…")}
          className="mt-1 w-full resize-none border-0 bg-transparent px-1 py-1 text-[13px] leading-relaxed text-stone-700 outline-none placeholder:text-stone-400"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving || (!title.trim() && !content.trim())}
            className="rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-white transition disabled:opacity-50"
            style={{ background: accent }}
          >
            {saving ? tt("保存中…") : tt("添加到知识库")}
          </button>
        </div>
      </div>

      {!loading && items.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-stone-400">{tt("还没有知识条目，添加第一条吧。")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((k) => (
            <div key={k.id} className="group flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
              <div className="min-w-0 flex-1">
                {k.title && <p className="text-[13px] font-medium text-stone-900">{k.title}</p>}
                {k.content && <p className="mt-0.5 line-clamp-3 text-[12px] leading-relaxed text-stone-500">{k.content}</p>}
              </div>
              <button
                type="button"
                onClick={() => onDelete(k.id)}
                className="shrink-0 text-stone-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
                aria-label={tt("删除")}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface MyDatabasePageProps {
  accent?: string;
  /** 标题，默认「我的数据库」。 */
  title?: ReactNode;
}

export function MyDatabasePage({ accent = "#4f46e5", title }: MyDatabasePageProps) {
  const tt = useUI();
  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col px-8 py-6">
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{title ?? tt("我的数据库")}</h1>
      <p className="mt-1 text-[13px] text-neutral-500">
        {tt("你在全 OceanLeo 系列里产出的作品、上传的素材与知识库，统一汇集于此，跨站可用。")}
      </p>
      <div className="mt-5 min-h-0 flex-1">
        <MyDatabasePanel accent={accent} />
      </div>
    </div>
  );
}
