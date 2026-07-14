"use client";

// ============================================================================
// @oceanleo/ui — 统一文件库 ArtifactLibrary（单一事实源，2026-07-02）
// ----------------------------------------------------------------------------
// 操作员拍板：27 个功能子站的「文件库」必须与主站 oceanleo.com/library **完完全全
// 一样**——同一套页面顶部横排分区（全部 / 图片 / 文档 / 幻灯片 / 视频 / 音频 /
// 3D / 我的收藏）、同一套主区（搜索 + 网格/列表视图 + 预览弹窗 +
// 收藏）。数据 = `agent_artifacts` 表（全系列共用一个 Supabase 项目 + 跨站登录
// cookie + RLS owner-only），天然「全 OceanLeo 打通」：任何站产出的作品在所有站
// 的文件库可见。
//
// 本组件从主站 app/library/page.tsx 移植（去 sonner / react-markdown / 主站专有
// icon 依赖），主站与全部子站统一改用它。v5 起分类始终由本组件在主区顶部渲染，
// 不再上提到侧栏。
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserClient } from "../lib/auth/client";
import { Markdown } from "./Markdown";
import { Modal, SkeletonCard, EmptyState, timeAgo } from "../ui";
import { useUI } from "../i18n/ui/useUI";
import { LibraryToolbar, LibraryChips } from "./LibraryLayout";
import { MyLibrary } from "./MyLibrary";

export interface ArtifactItem {
  id: string;
  title: string;
  kind: string;
  content: string;
  url?: string;
  favorite: boolean;
  created_at: string;
}

/** 文件库筛选分区（= 主站侧栏内容 + 2026-07-02 新增音频 / 3D）。 */
export const ARTIFACT_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "images", label: "图片" },
  { id: "documents", label: "文档" },
  { id: "slides", label: "幻灯片" },
  { id: "videos", label: "视频" },
  { id: "audio", label: "音频" },
  { id: "threed", label: "3D" },
  { id: "favorites", label: "我的收藏" },
];

export type ArtifactFilter =
  | "all"
  | "images"
  | "documents"
  | "slides"
  | "videos"
  | "audio"
  | "threed"
  | "favorites";

const KIND_SETS: Record<string, string[]> = {
  images: ["image"],
  documents: ["markdown", "document", "text"],
  slides: ["slides", "slide", "presentation"],
  videos: ["video"],
  audio: ["audio", "music", "voice"],
  threed: ["3d", "threed", "model", "mesh"],
};

/** 统一把 artifact 归一到一种可渲染的预览形态，避免出现空白卡片。 */
type PreviewKind = "image" | "video" | "audio" | "text" | "link" | "file";

function isImage(a: ArtifactItem) {
  return a.kind === "image" || /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i.test(a.url || "");
}
function isVideo(a: ArtifactItem) {
  return a.kind === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(a.url || "");
}
function isAudio(a: ArtifactItem) {
  return (
    KIND_SETS.audio.includes(a.kind) || /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(a.url || "")
  );
}
/** URL 是否指向真正的媒体文件（可直接内嵌预览），而非一个网页/接口链接。 */
function isMediaUrl(url?: string) {
  return /\.(jpg|jpeg|png|gif|webp|avif|svg|mp4|webm|mov|m4v|mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(
    url || "",
  );
}

function previewKind(a: ArtifactItem): PreviewKind {
  if (isImage(a)) return "image";
  if (isVideo(a)) return "video";
  if (isAudio(a)) return "audio";
  if ((a.content || "").trim().length > 0) return "text";
  if ((a.url || "").trim().length > 0) return "link";
  return "file";
}

function hostOf(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }
}

const KIND_LABELS: Record<string, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  music: "音频",
  voice: "音频",
  markdown: "文档",
  document: "文档",
  text: "文档",
  slides: "幻灯片",
  slide: "幻灯片",
  presentation: "幻灯片",
  "3d": "3D 模型",
  threed: "3D 模型",
  model: "3D 模型",
  mesh: "3D 模型",
  search: "搜索结果",
  file: "文件",
  link: "链接",
};

/* image with blur-up placeholder */
function LazyImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-neutral-100 ${className || ""}`}>
      {!loaded && <div className="v-skeleton absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-all duration-500 ${
          loaded ? "scale-100 opacity-100 blur-0" : "scale-105 opacity-0 blur-md"
        }`}
      />
    </div>
  );
}

export interface ArtifactLibraryProps {
  /** 可选受控筛选分区；无论是否受控，顶部都会渲染筛选 chips（除非 hideChips）。 */
  filter?: ArtifactFilter;
  onFilterChange?: (f: ArtifactFilter) => void;
  accent?: string;
  /** true 时用 h-full 填满父容器（内嵌分栏用）。 */
  fill?: boolean;
  /**
   * 宗旨 v22（操作员 2026-07-12）：跨站只读库标签用——把筛选**锁死**到 `filter`（受控）
   * 且**隐藏顶部分区 chips**。因为标签本身（如「PPT库」「图片库」）已经代表了类型，右栏里
   * 再出现一整排「全部/图片/文档…」chips 是多余的。传 true 时：不渲染 chips，搜索占位反映
   * 该固定类型。默认 false（保持既有：受控/非受控都渲染 chips）。 */
  hideChips?: boolean;
}

const FILTER_CATEGORY: Record<ArtifactFilter, string> = {
  all: "all",
  images: "图片",
  documents: "文档",
  slides: "PPT",
  videos: "视频",
  audio: "音频",
  threed: "3D",
  favorites: "all",
};

const CATEGORY_FILTER: Record<string, ArtifactFilter> = {
  all: "all",
  图片: "images",
  文档: "documents",
  PPT: "slides",
  视频: "videos",
  音频: "audio",
  "3D": "threed",
};

/**
 * Full-page /library is now the same heterogeneous My Library used by the
 * five-slot workspace. `fill` remains the compatibility renderer for legacy
 * tab content; ResultCanvas replaces those tabs with MyLibrary centrally.
 */
export function ArtifactLibrary(props: ArtifactLibraryProps) {
  const tt = useUI();
  if (props.fill) return <ArtifactLibraryLegacy {...props} />;
  const filter = props.filter || "all";
  return (
    <div className="mx-auto flex h-[100dvh] min-h-0 w-full max-w-6xl flex-col px-6 py-8">
      <h1 className="shrink-0 text-[22px] font-semibold tracking-tight text-neutral-900">
        {tt("我的库")}
      </h1>
      <p className="mt-1 shrink-0 text-[13px] text-neutral-500">
        {tt("作品、网站、任务交付物和上传文件统一保存在这里。")}
      </p>
      <div className="mt-4 min-h-0 flex-1 overflow-hidden">
        <MyLibrary
          accent={props.accent}
          plain
          category={FILTER_CATEGORY[filter]}
          onlyFavorites={filter === "favorites"}
          onCategoryChange={(category) =>
            props.onFilterChange?.(CATEGORY_FILTER[category] || "all")
          }
        />
      </div>
    </div>
  );
}

function ArtifactLibraryLegacy({
  filter: controlledFilter,
  onFilterChange,
  accent = "#4f46e5",
  fill = false,
  hideChips = false,
}: ArtifactLibraryProps) {
  const tt = useUI();
  const [internalFilter, setInternalFilter] = useState<ArtifactFilter>("all");
  const filter = controlledFilter ?? internalFilter;
  const setFilter = (f: ArtifactFilter) => {
    if (controlledFilter === undefined) setInternalFilter(f);
    onFilterChange?.(f);
  };

  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const supabase = browserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!sess.session) {
        setAuthMsg(tt("登录后即可查看我的库。"));
        setLoading(false);
        return;
      }
      setAuthMsg(null);
      let query = supabase
        .from("agent_artifacts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (filter === "favorites") query = query.eq("favorite", true);
      else if (KIND_SETS[filter]) query = query.in("kind", KIND_SETS[filter]);
      const { data } = await query;
      if (!cancelled) {
        setArtifacts((data as ArtifactItem[]) || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, tt]);

  async function toggleFavorite(id: string, cur: boolean) {
    const supabase = browserClient();
    if (!supabase) return;
    setArtifacts((prev) => prev.map((a) => (a.id === id ? { ...a, favorite: !cur } : a)));
    const { error } = await supabase.from("agent_artifacts").update({ favorite: !cur }).eq("id", id);
    if (error) {
      // 失败回滚（静默——不引入 toast 依赖）。
      setArtifacts((prev) => prev.map((a) => (a.id === id ? { ...a, favorite: cur } : a)));
    }
  }

  const filtered = useMemo(
    () => artifacts.filter((a) => (a.title || "").toLowerCase().includes(debounced.toLowerCase())),
    [artifacts, debounced],
  );
  const selected = selectedIdx !== null ? filtered[selectedIdx] : null;

  const navigate = useCallback(
    (dir: -1 | 1) => {
      setSelectedIdx((idx) => {
        if (idx === null) return idx;
        const next = idx + dir;
        if (next < 0 || next >= filtered.length) return idx;
        return next;
      });
    },
    [filtered.length],
  );

  useEffect(() => {
    if (selectedIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") navigate(-1);
      else if (e.key === "ArrowRight") navigate(1);
      else if (e.key === "Escape") setSelectedIdx(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIdx, navigate]);

  async function copyContent(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  function kindLabel(kind: string): string {
    return tt(KIND_LABELS[kind] || kind || "文件");
  }

  const filterLabel = tt(
    ARTIFACT_FILTERS.find((f) => f.id === filter)?.label || "我的库",
  );

  return (
    // fill（内嵌右栏「库·文件库」，宗旨 v18，操作员 2026-07-07 三次校正）：**与「素材库」
    // (MaterialLibrary `relative min-h-full`) 逐字对齐**——`relative min-h-full w-full`，**绝不
    // 自带 overflow-y-auto**。病根（操作员截图 74959e6b 指的「滚动条右边还有一条空白」）：外层
    // ResultCanvas body 已经是 `v-scroll-stable overflow-y-auto p-4`（scrollbar-gutter:stable 在
    // 右缘预留了滚动槽），本组件再套一层自己的 `overflow-y-auto` → 出现【内层滚动条】，内层滚动
    // 条右侧再叠外层预留的 stable 槽 = 那条死空白。去掉本层 overflow → 只剩外层一条滚动条，右侧
    // 无空白，且滚动条右边就是面板边（素材库正因为没自带 overflow 才没这毛病）。
    // relative + min-h-full：让「文件点开」预览浮层 `absolute inset-0` 恰好占满库可见区（配合
    // 下面 selected 时隐藏网格 → flow 高塌缩到可见高，同 MaterialLibrary 放大态处理）。
    // 整页（受控）形态保持 px-8 py-6 页面版式不变。
    <div className={fill ? "relative min-h-full w-full" : "px-8 pb-6 pt-16"}>
      {/* 文件点开（宗旨 v18，操作员 2026-07-07）：**内联在右栏库里显示**，不再弹出 Modal 新页面。
          fill 态用 absolute inset-0 铺满库区域的浮层（同 MaterialLibrary 放大态）；受控整页态回退
          用 Modal（整页 /library 没有可铺满的相对容器）。返回/✕/Esc 关闭；← → 翻看。 */}
      {selected && fill && (
        <div className="absolute inset-0 z-20 flex flex-col rounded-xl bg-white">
          <div className="flex items-center gap-2 border-b border-neutral-100 px-1 pb-2">
            <button
              type="button"
              onClick={() => setSelectedIdx(null)}
              className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-600 transition hover:bg-neutral-50"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {tt("返回")}
            </button>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-800">
              {selected.title || tt("内容详情")}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">
              {(selectedIdx ?? 0) + 1} / {filtered.length}
            </span>
          </div>
          <div className="v-scroll relative min-h-0 flex-1 overflow-y-auto p-3">
            <ArtifactPreview
              a={selected}
              tt={tt}
              copied={copied}
              onCopy={copyContent}
              kindLabel={kindLabel}
            />
            {selectedIdx !== null && selectedIdx > 0 && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label={tt("上一项")}
                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-neutral-600 shadow transition hover:bg-white"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {selectedIdx !== null && selectedIdx < filtered.length - 1 && (
              <button
                type="button"
                onClick={() => navigate(1)}
                aria-label={tt("下一项")}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-neutral-600 shadow transition hover:bg-white"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
      {selected && !fill && (
        <Modal onClose={() => setSelectedIdx(null)} className="max-w-3xl">
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-neutral-900">
              {selected.title || tt("内容详情")}
            </h3>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="mr-2 text-[11px] tabular-nums text-neutral-400">
                {(selectedIdx ?? 0) + 1} / {filtered.length}
              </span>
              <button
                type="button"
                onClick={() => navigate(-1)}
                disabled={selectedIdx === 0}
                aria-label={tt("上一项")}
                className="rounded-lg border border-neutral-200 p-1.5 text-neutral-500 transition hover:bg-neutral-50 disabled:opacity-30"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => navigate(1)}
                disabled={selectedIdx === filtered.length - 1}
                aria-label={tt("下一项")}
                className="rounded-lg border border-neutral-200 p-1.5 text-neutral-500 transition hover:bg-neutral-50 disabled:opacity-30"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setSelectedIdx(null)}
                aria-label={tt("关闭")}
                className="ml-1 rounded p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="v-scroll max-h-[70vh] overflow-y-auto p-5">
            <ArtifactPreview
              a={selected}
              tt={tt}
              copied={copied}
              onCopy={copyContent}
              kindLabel={kindLabel}
            />
            <p className="mt-4 text-center text-[11px] text-neutral-300">{tt("← → 切换 · Esc 关闭")}</p>
          </div>
        </Modal>
      )}

      {/* fill 态「文件点开」时（selected&&fill）**整段工具条/分区/网格不渲染**（同
          MaterialLibrary 放大态 `!zoom`）：否则文件多时本 min-h-full 容器被网格撑高，
          `absolute inset-0` 预览浮层随之撑高、下方大片空白。隐藏后 flow 高塌缩到可见高。 */}
      {!(selected && fill) && (
        <>
      {/* 受控整页形态才有大标题（页面标题）；非受控（右栏内嵌 fill）无标题，搜索行上移，
          与「导航 / 素材库」一致（宗旨 v17）。搜索行统一走 LibraryToolbar（右对齐窄框 +
          网格/列表切换），三分区搜索框尺寸/位置一致。 */}
      {controlledFilter !== undefined ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{tt(filterLabel)}</h1>
          <LibraryToolbar
            search={search}
            setSearch={setSearch}
            view={view}
            setView={setView}
            placeholder={tt("搜索文件")}
            tt={tt}
          />
        </div>
      ) : (
        <LibraryToolbar
          search={search}
          setSearch={setSearch}
          view={view}
          setView={setView}
          placeholder={tt("搜索文件")}
          tt={tt}
        />
      )}

      {/* v5：文件类型永远在右侧页面顶部横排；不得再移到任何侧栏。
          宗旨 v22：hideChips（跨站只读库标签）时不渲染——标签本身即类型。 */}
      {!hideChips && (
        <LibraryChips
          chips={ARTIFACT_FILTERS}
          active={filter}
          onChange={(id) => setFilter(id as ArtifactFilter)}
          accent={accent}
          tt={tt}
        />
      )}

      {authMsg ? (
        <p className="py-16 text-center text-[13px] text-neutral-400">{authMsg}</p>
      ) : loading ? (
        // 卡片保持原来的小尺寸（固定列，随容器宽自然多列）——操作员 2026-07-07 明确：**不许
        // 靠放大卡片填满右侧空白**。右侧空白的真因是双滚动条（已在根容器去掉本层 overflow 修
        // 掉），与卡片尺寸无关。故这里回到原来的 2/3 列小卡片版式。
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} className="h-40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<BoxIcon />}
          title={
            debounced
              ? tt("未找到匹配的内容")
              : filter === "favorites"
                ? tt("还没有收藏")
                : tt("库中还没有内容")
          }
          desc={
            debounced
              ? tt("换个关键词试试，或清除筛选条件。")
              : tt("任务产出的图片、文档与交付物会自动收集到这里。")
          }
        />
      ) : view === "list" ? (
        <div className="v-fade-in mt-5 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {filtered.map((a, idx) => (
            <div key={a.id} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-neutral-50">
              <button
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <ListThumb a={a} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-neutral-900">
                    {a.title || tt("无标题")}
                  </span>
                  <span className="block truncate text-[11px] text-neutral-500">
                    {kindLabel(a.kind)} · {timeAgo(a.created_at, tt)}
                    {previewKind(a) === "link" && a.url ? ` · ${hostOf(a.url)}` : ""}
                  </span>
                </span>
              </button>
              <FavButton a={a} onToggle={toggleFavorite} tt={tt} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {filtered.map((a, idx) => (
            <div
              key={a.id}
              className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
              style={{ animation: `v-fade-up 0.3s ease ${Math.min(idx * 40, 320)}ms both` }}
            >
              <button type="button" onClick={() => setSelectedIdx(idx)} className="w-full text-left">
                <CardThumb a={a} kindLabel={kindLabel} />
                <div className="p-3">
                  <p className="truncate text-[13px] font-medium text-neutral-900">
                    {a.title || tt("无标题")}
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    {kindLabel(a.kind)} · {timeAgo(a.created_at, tt)}
                  </p>
                </div>
              </button>
              <FavButton a={a} onToggle={toggleFavorite} tt={tt} floating />
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 预览弹窗正文（图片 / 视频 / 音频 / 文本 / 链接 / 文件）
// ---------------------------------------------------------------------------
function ArtifactPreview({
  a,
  tt,
  copied,
  onCopy,
  kindLabel,
}: {
  a: ArtifactItem;
  tt: (s: string, vars?: Record<string, string | number>) => string;
  copied: boolean;
  onCopy: (s: string) => void;
  kindLabel: (k: string) => string;
}) {
  const kind = previewKind(a);
  const copyBtn = (text: string) => (
    <button
      type="button"
      onClick={() => onCopy(text)}
      className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.98]"
    >
      {copied ? tt("已复制 ✓") : tt("复制链接")}
    </button>
  );

  if (kind === "image") {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={a.id} src={a.url} alt={a.title} className="v-fade-in mx-auto max-h-[58vh] rounded-lg" />
        <div className="mt-4 flex justify-center gap-2">
          <a
            href={a.url}
            download
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.98]"
          >
            {tt("下载图片")}
          </a>
          {copyBtn(a.url || "")}
        </div>
      </>
    );
  }
  if (kind === "video" && isMediaUrl(a.url)) {
    return (
      <>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video key={a.id} src={a.url} controls className="v-fade-in mx-auto max-h-[58vh] w-full rounded-lg bg-black" />
        <div className="mt-4 flex justify-center gap-2">
          <a
            href={a.url}
            download
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.98]"
          >
            {tt("下载视频")}
          </a>
          {copyBtn(a.url || "")}
        </div>
      </>
    );
  }
  if (kind === "audio" && a.url) {
    return (
      <div key={a.id} className="v-fade-in flex flex-col items-center py-8">
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V6l11-2v12" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6.5" cy="18" r="2.5" />
            <circle cx="17.5" cy="16" r="2.5" />
          </svg>
        </span>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio src={a.url} controls className="w-full max-w-md" />
        <div className="mt-5 flex justify-center gap-2">
          <a
            href={a.url}
            download
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.98]"
          >
            {tt("下载音频")}
          </a>
          {copyBtn(a.url)}
        </div>
      </div>
    );
  }
  if (kind === "link" || kind === "file") {
    return (
      <div key={a.id} className="v-fade-in flex flex-col items-center py-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
          {kind === "link" ? <LinkIcon className="h-7 w-7" /> : <FileIcon className="h-7 w-7" />}
        </span>
        <p className="mt-4 text-[14px] font-medium text-neutral-800">{a.title || kindLabel(a.kind)}</p>
        {a.url && <p className="mt-1 max-w-full break-all px-6 text-[12px] text-neutral-500">{a.url}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {a.url && (
            <a
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.98]"
            >
              {tt("打开链接")}
            </a>
          )}
          {a.url && copyBtn(a.url)}
        </div>
      </div>
    );
  }
  return (
    <>
      <div key={a.id} className="v-fade-in">
        <Markdown className="prose prose-sm max-w-none">{a.content}</Markdown>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onCopy(a.content)}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.98]"
        >
          {copied ? tt("已复制 ✓") : tt("复制内容")}
        </button>
        {a.url && (
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.98]"
          >
            {tt("打开链接")}
          </a>
        )}
      </div>
    </>
  );
}

/** 网格卡片缩略图：任何类型都有可视内容，绝不留空白灰块。 */
function CardThumb({ a, kindLabel }: { a: ArtifactItem; kindLabel: (k: string) => string }) {
  const kind = previewKind(a);
  if (kind === "image") {
    return (
      <div className="aspect-video w-full overflow-hidden">
        <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.04]">
          <LazyImage src={a.url} alt={a.title} className="h-full w-full" />
        </div>
      </div>
    );
  }
  if (kind === "video" && isMediaUrl(a.url)) {
    return (
      <div className="aspect-video w-full overflow-hidden bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={a.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      </div>
    );
  }
  if (kind === "text") {
    return (
      <div className="aspect-video w-full overflow-hidden bg-neutral-50 p-4">
        <div className="line-clamp-6 text-[12px] leading-relaxed text-neutral-600">{a.content}</div>
      </div>
    );
  }
  const Icon = kind === "link" ? LinkIcon : kind === "audio" ? AudioIcon : kind === "video" ? VideoIcon : FileIcon;
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-br from-neutral-50 to-neutral-100 px-4 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-neutral-400 shadow-sm ring-1 ring-neutral-200/70">
        <Icon className="h-5 w-5" />
      </span>
      <span className="max-w-full truncate text-[11px] text-neutral-500">
        {kind === "link" ? hostOf(a.url) : kindLabel(a.kind)}
      </span>
    </div>
  );
}

/** 列表视图的小方块缩略图。 */
function ListThumb({ a }: { a: ArtifactItem }) {
  const kind = previewKind(a);
  if (kind === "image") {
    return <LazyImage src={a.url} alt="" className="h-9 w-9 shrink-0 rounded-lg" />;
  }
  const Icon = kind === "link" ? LinkIcon : kind === "audio" ? AudioIcon : kind === "video" ? VideoIcon : FileIcon;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function FavButton({
  a,
  onToggle,
  tt,
  floating = false,
}: {
  a: ArtifactItem;
  onToggle: (id: string, cur: boolean) => void;
  tt: (s: string) => string;
  floating?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(a.id, a.favorite);
      }}
      aria-label={a.favorite ? tt("取消收藏") : tt("收藏")}
      className={
        floating
          ? `absolute right-2 top-2 rounded-lg bg-white/80 p-1.5 backdrop-blur transition-all duration-150 hover:text-yellow-500 active:scale-90 ${
              a.favorite ? "text-yellow-500 opacity-100" : "text-neutral-400 opacity-0 group-hover:opacity-100"
            }`
          : `shrink-0 rounded-lg p-1.5 transition-all duration-150 hover:text-yellow-500 active:scale-90 ${
              a.favorite ? "text-yellow-500" : "text-neutral-300 opacity-0 group-hover:opacity-100"
            }`
      }
    >
      <svg
        className={`h-4 w-4 ${a.favorite ? "fill-yellow-500 text-yellow-500" : ""}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function LinkIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 14a5 5 0 007.07 0l2.83-2.83a5 5 0 00-7.07-7.07L11.5 5.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 10a5 5 0 00-7.07 0L4.1 12.83a5 5 0 007.07 7.07l1.32-1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function FileIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function VideoIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="13" height="14" rx="2" />
      <path d="M16 10l5-3v10l-5-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function AudioIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18V6l11-2v12" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 8l9 5 9-5M12 13v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
