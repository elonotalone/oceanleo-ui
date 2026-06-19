"use client";

// ============================================================================
// @oceanleo/ui — 文件库 FileLibrary（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-19 定稿：文件库 = 升级版「我的数据库」（整合，不再两个概念）。
// 四个 tab：
//   上传文件 —— 用户真实上传、可被本站 AI 使用的文件；跨站可见，默认当前站。
//   作品     —— 用户在各站产出的 AI 作品（user_creations）。
//   素材     —— 收藏的开放素材（user_assets 非上传）。
//   知识库   —— 供各站 AI 参考的知识条目（user_knowledge）。
// 「上传文件」+「作品」支持跨站分区：顶部站点选择器，默认当前站，可切「全部站」。
// 真实后端：/v1/database/{upload,files,overview,...}。
// ============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  listFiles,
  uploadFile,
  deleteFile,
  getDatabaseOverview,
  deleteWork,
  deleteAsset,
  addKnowledge,
  deleteKnowledge,
  MEDIA_TYPE_LABEL,
  type FileItem,
  type WorkItem,
  type AssetItem,
  type KnowledgeItem,
} from "../lib/database";

type Tab = "files" | "works" | "assets" | "knowledge";

const TABS: { id: Tab; label: string }[] = [
  { id: "files", label: "上传文件" },
  { id: "works", label: "作品" },
  { id: "assets", label: "素材" },
  { id: "knowledge", label: "知识库" },
];

export interface SiteOption {
  id: string;
  label: string;
}

export interface FileLibraryProps {
  /** 当前站 id（上传归属 + 文件库默认分区）。 */
  siteId: string;
  /** 当前站显示名（站点选择器里高亮）。 */
  siteName?: string;
  /** 跨站分区可选站点（不传则只给「当前站 / 全部站」两项）。 */
  sites?: SiteOption[];
  accent?: string;
  defaultTab?: Tab;
  title?: ReactNode;
}

export function FileLibrary({
  siteId,
  siteName,
  sites,
  accent = "#4f46e5",
  defaultTab = "files",
  title = "文件库",
}: FileLibraryProps) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  // 站点分区：当前站 id | "__all__"（全部站）| 指定 site id
  const [scopeSite, setScopeSite] = useState<string>(siteId);

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col px-8 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{title}</h1>
          <p className="mt-1 text-[13px] text-neutral-500">
            上传文件供本站 AI 使用；作品 / 素材 / 知识库全 OceanLeo 系列共享，跨站可见。
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                tab === t.id ? "bg-white text-stone-800 shadow-sm" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 站点分区选择器（仅「上传文件 / 作品」可跨站分区） */}
        {(tab === "files" || tab === "works") && (
          <SitePartition
            value={scopeSite}
            currentSiteId={siteId}
            currentSiteName={siteName || siteId}
            sites={sites}
            onChange={setScopeSite}
          />
        )}
      </div>

      <div className="mt-5 min-h-0 flex-1">
        {tab === "files" && (
          <FilesPanel siteId={siteId} scopeSite={scopeSite} accent={accent} />
        )}
        {tab === "works" && <WorksPanel scopeSite={scopeSite} accent={accent} />}
        {tab === "assets" && <AssetsPanel accent={accent} />}
        {tab === "knowledge" && <KnowledgePanel accent={accent} />}
      </div>
    </div>
  );
}

// --- 站点分区选择器 --------------------------------------------------------
function SitePartition({
  value,
  currentSiteId,
  currentSiteName,
  sites,
  onChange,
}: {
  value: string;
  currentSiteId: string;
  currentSiteName: string;
  sites?: SiteOption[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[12px]">
      <span className="text-stone-400">分区</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] text-stone-700 outline-none focus:border-stone-400"
      >
        <option value={currentSiteId}>{currentSiteName}（当前站）</option>
        <option value="__all__">全部 OceanLeo 站</option>
        {(sites || [])
          .filter((s) => s.id !== currentSiteId)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
      </select>
    </div>
  );
}

// --- 上传文件 tab ----------------------------------------------------------
function FilesPanel({
  siteId,
  scopeSite,
  accent,
}: {
  siteId: string;
  scopeSite: string;
  accent: string;
}) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const all = scopeSite === "__all__";
    const r = await listFiles({
      siteId: all ? undefined : scopeSite,
      scope: all ? "all" : "site",
      limit: 200,
    });
    setLoading(false);
    if (!r.ok || !r.data) {
      setError(r.status === 401 ? "登录后即可使用文件库。" : r.error || "加载失败");
      return;
    }
    setItems(r.data.items || []);
  }, [scopeSite]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    for (const f of Array.from(files)) {
      const r = await uploadFile(f, { siteId });
      if (!r.ok) {
        setError(r.error || `上传失败：${f.name}`);
        break;
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    await load();
  }

  async function onDelete(id: string) {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await deleteFile(id);
  }

  if (error) {
    return <PanelMessage text={error} />;
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFiles(e.dataTransfer.files);
        }}
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50/60 px-6 py-8 text-center"
      >
        <span className="text-2xl">📎</span>
        <p className="text-sm text-stone-600">
          点击或拖拽文件到此处上传（归「当前站」，可被本站 AI 使用）
        </p>
        <p className="text-xs text-stone-400">单文件 ≤ 20MB · 图片 / 文档 / 音视频均可</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-1 rounded-lg px-4 py-1.5 text-[13px] font-medium text-white transition disabled:opacity-60"
          style={{ background: accent }}
        >
          {uploading ? "上传中…" : "选择文件"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>

      {loading && items.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone-400">加载中…</p>
      ) : items.length === 0 ? (
        <PanelMessage text="还没有上传文件。拖拽或点击上方区域上传第一个文件。" />
      ) : (
        <div className="space-y-2">
          {items.map((f) => (
            <FileRow key={f.id} f={f} crossSite={scopeSite === "__all__"} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({
  f,
  crossSite,
  onDelete,
}: {
  f: FileItem;
  crossSite: boolean;
  onDelete: (id: string) => void;
}) {
  const isImg = f.media_type === "image";
  const name = (f.meta?.filename as string) || f.title || "文件";
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-stone-100">
        {isImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-lg">📄</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-stone-800">{name}</p>
        <p className="text-[11px] text-stone-400">
          {MEDIA_TYPE_LABEL[(f.media_type as keyof typeof MEDIA_TYPE_LABEL) || "other"] || "文件"}
          {f.bytes ? ` · ${(f.bytes / 1024).toFixed(0)}KB` : ""}
          {crossSite && f.site_id ? ` · ${f.site_id}` : ""}
        </p>
      </div>
      <a
        href={f.url}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg px-2.5 py-1 text-[12px] text-stone-500 transition hover:bg-stone-100"
      >
        打开
      </a>
      <button
        type="button"
        onClick={() => onDelete(f.id)}
        className="text-stone-300 opacity-0 transition group-hover:opacity-100 hover:text-rose-500"
        aria-label="删除"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// --- 作品 / 素材 / 知识库（复用 overview，跨站分区作用于 works） -----------
function WorksPanel({ scopeSite, accent }: { scopeSite: string; accent: string }) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getDatabaseOverview({ limit: 200 }).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (!r.ok || !r.data) {
        setError(r.status === 401 ? "登录后即可查看。" : r.error || "加载失败");
        return;
      }
      const all = r.data.works || [];
      setItems(scopeSite === "__all__" ? all : all.filter((w) => (w.site_id || "") === scopeSite));
    });
    return () => {
      alive = false;
    };
  }, [scopeSite]);

  if (error) return <PanelMessage text={error} />;
  return (
    <MediaGrid
      loading={loading}
      items={items}
      accent={accent}
      emptyText="该分区还没有作品。"
      onDelete={async (id) => {
        setItems((xs) => xs.filter((x) => x.id !== id));
        await deleteWork(id);
      }}
      badge={(it) => (it as WorkItem).media_type}
      crossSite={scopeSite === "__all__"}
    />
  );
}

function AssetsPanel({ accent }: { accent: string }) {
  const [items, setItems] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getDatabaseOverview({ limit: 200 }).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (!r.ok || !r.data) {
        setError(r.status === 401 ? "登录后即可查看。" : r.error || "加载失败");
        return;
      }
      // 素材 = 收藏的（非上传）。上传的在「上传文件」tab，这里排除。
      setItems((r.data.assets || []).filter((a) => !(a.meta as { is_upload?: boolean })?.is_upload));
    });
    return () => {
      alive = false;
    };
  }, []);
  if (error) return <PanelMessage text={error} />;
  return (
    <MediaGrid
      loading={loading}
      items={items}
      accent={accent}
      emptyText="还没有收藏素材。"
      onDelete={async (id) => {
        setItems((xs) => xs.filter((x) => x.id !== id));
        await deleteAsset(id);
      }}
      badge={(it) => (it as AssetItem).media_type}
    />
  );
}

function KnowledgePanel({ accent }: { accent: string }) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getDatabaseOverview({ limit: 200 }).then((r) => {
      setLoading(false);
      if (r.ok && r.data) setItems(r.data.knowledge || []);
    });
  }, []);
  useEffect(() => load(), [load]);

  async function save() {
    if (!title.trim() && !content.trim()) return;
    setSaving(true);
    const r = await addKnowledge({ title: title.trim(), content: content.trim() });
    setSaving(false);
    if (r.ok) {
      setTitle("");
      setContent("");
      load();
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="知识条目标题（如：我的品牌调性）"
          className="w-full border-0 bg-transparent px-1 py-1 text-[14px] font-medium text-stone-800 outline-none placeholder:text-stone-400"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="写下供各站 AI 生成时参考的内容…"
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
            {saving ? "保存中…" : "添加到知识库"}
          </button>
        </div>
      </div>
      {!loading && items.length === 0 ? (
        <PanelMessage text="还没有知识条目，添加第一条吧。" />
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
                onClick={async () => {
                  setItems((xs) => xs.filter((x) => x.id !== k.id));
                  await deleteKnowledge(k.id);
                }}
                className="shrink-0 text-stone-300 opacity-0 transition group-hover:opacity-100 hover:text-rose-500"
                aria-label="删除"
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

function MediaGrid({
  loading,
  items,
  accent,
  emptyText,
  onDelete,
  badge,
  crossSite,
}: {
  loading: boolean;
  items: (WorkItem | AssetItem)[];
  accent: string;
  emptyText: string;
  onDelete: (id: string) => void;
  badge?: (it: WorkItem | AssetItem) => string | undefined;
  crossSite?: boolean;
}) {
  const [zoom, setZoom] = useState<string | null>(null);
  if (!loading && items.length === 0) return <PanelMessage text={emptyText} />;
  return (
    <>
      <div className="grid auto-rows-min grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {loading && items.length === 0
          ? Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-xl bg-stone-100" />
            ))
          : items.map((c) => {
              const mt = badge?.(c);
              const thumb = c.thumb_url || c.url;
              return (
                <div
                  key={c.id}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-stone-200 bg-stone-50 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  title={c.title || (c as WorkItem).prompt || ""}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumb}
                    alt={c.title || ""}
                    loading="lazy"
                    onClick={() => setZoom(c.url)}
                    className="h-full w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {mt && (
                    <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {MEDIA_TYPE_LABEL[mt as keyof typeof MEDIA_TYPE_LABEL] || mt}
                    </span>
                  )}
                  {crossSite && c.site_id && (
                    <span className="absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                      {c.site_id}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    className="absolute right-1.5 top-1.5 z-10 hidden h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white group-hover:flex"
                    aria-label="删除"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              );
            })}
      </div>
      {zoom && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setZoom(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="放大预览" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        </div>
      )}
    </>
  );
}

function PanelMessage({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center text-stone-400">
      <svg className="h-12 w-12 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M4 17l5-5 4 4 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="max-w-xs text-sm">{text}</p>
    </div>
  );
}
