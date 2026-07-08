"use client";

// ============================================================================
// @oceanleo/ui — 侧栏「探索」页 ExplorePage（单一事实源，宗旨 v19，2026-07-08）
// ----------------------------------------------------------------------------
// 操作员 2026-07-08：全家桶每个站在侧栏「首页 ↔ 工作台」之间加一个【探索】页，展示
// 【本站相关的素材】——数据来自 asset.oceanleo.com 的自囤 OSS 正式库
// （`api.oceanleo.com/v1/assets/library/search`，公开、免登录、有中文分类、加载快）。
//
// 各站呈现哪类素材由站点传 `ExploreConfig` 决定：
//   · ppt   → type="ppt"（PPT 模板）
//   · word  → type="image" + 教育/办公/商务场景照片（文档配图素材）
//   · video → type="video"
//   · image → type="image"
//   · study → type="image" + 教育/学生/学术场景（讲义/板书/教具/校园）
//   · …其余站按其创作产物挑最贴切的 type + 策划分类（见各站 lib/explore.ts）。
//
// 版式（操作员参照图 36adf580：Pi/DeepVinci 瀑布流）——**masonry 瀑布流**：每列
// 【等宽】、卡片【不等高】（按素材真实宽高比），多列自适应。用 CSS `columns` 实现
// （零依赖、SSR 友好、不需测量 DOM）。顶部一排【分类 chips】（首枚「全部」），点切分类
// 重新查询。点某卡片 → 放大铺满查看（同 MaterialLibrary 的浮层，Esc/← →/✕）。
//
// 这是【整站级素材浏览页】，独立于工作台里各 app 右栏的「素材库」标签（后者是某个成品
// app 的启发示例）。探索页是逛整站相关素材的地方。
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "../i18n/ui/useUI";
import { LibraryToolbar, LibraryChips } from "./LibraryLayout";

const GATEWAY = "https://api.oceanleo.com";

/** 探索页支持的素材类型（对齐后端 library/search 的 type 枚举）。 */
export type ExploreAssetType =
  | "image"
  | "vector"
  | "video"
  | "audio"
  | "music"
  | "3d"
  | "ppt"
  | "sticker"
  | "font"
  | "chart";

/** 一条素材（= 后端 library/search 返回的 Asset 子集，探索页只用到这些字段）。 */
interface ExploreAsset {
  id: string;
  type: string;
  title: string;
  thumb_url: string;
  preview_url: string;
  full_url: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  source_url: string;
  category?: string;
  tags?: string[];
}

/** 一个策划分类（chip）：category 键 + 中文标签。 */
export interface ExploreCategory {
  /** 后端 library/search 的 `category` 参数值。 */
  key: string;
  /** chip 显示的中文名。 */
  label: string;
  /** 可选：该分类下再按 `subtab`（scene_tags array-contains）细分（探索页暂只用 category）。 */
  subtab?: string;
}

/** 站点探索页配置（每站一份，见各站 lib/explore.ts）。 */
export interface ExploreConfig {
  /** 本站素材主类型。 */
  type: ExploreAssetType;
  /**
   * 策划分类 chips（保序）。不给则运行时从 `/library/categories?type=` 拉取全部分类兜底
   * （中文名走 categoryLabelFallback）。给了则只展示这些（更聚焦、更贴本站场景）。
   * 首枚「全部」由组件自动前插，不要自己加。
   */
  categories?: ExploreCategory[];
  /** 页面标题，默认「探索 · 素材」。 */
  title?: string;
  /** 页面副标题（一句话说明本站探索页展示什么素材）。 */
  subtitle?: string;
  /** 空态提示（该站/该分类暂无素材时）。 */
  emptyHint?: string;
}

export interface ExplorePageProps {
  config: ExploreConfig;
  /** 站点品牌色（chips 选中态 / 放大态按钮）。 */
  accent?: string;
  className?: string;
}

interface LibrarySearchResp {
  items: ExploreAsset[];
  page: number;
  page_size: number;
  total: number;
}

async function fetchLibrary(params: {
  type: string;
  category: string;
  q: string;
  page: number;
}): Promise<LibrarySearchResp> {
  const qs = new URLSearchParams({
    type: params.type,
    q: params.q || "",
    page: String(params.page),
    page_size: "30",
    license: "commercial",
  });
  if (params.category) qs.set("category", params.category);
  const resp = await fetch(`${GATEWAY}/v1/assets/library/search?${qs.toString()}`, {
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as LibrarySearchResp;
  return {
    items: Array.isArray(data.items) ? data.items : [],
    page: data.page ?? params.page,
    page_size: data.page_size ?? 30,
    total: data.total ?? 0,
  };
}

/**
 * 整站级「探索」素材浏览页：分类 chips + 瀑布流网格（等宽不等高）+ 放大查看。
 * 各站 /explore 路由里 `<ExplorePage config={SITE_EXPLORE} accent={ACCENT} />` 即可。
 */
export function ExplorePage({ config, accent = "#4f46e5", className = "" }: ExplorePageProps) {
  const tt = useUI();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [cat, setCat] = useState("");
  const [items, setItems] = useState<ExploreAsset[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  // 运行时兜底拉取的分类（config.categories 未提供时用）。
  const [autoCats, setAutoCats] = useState<ExploreCategory[]>([]);
  // 放大浮层用 portal 挂到 <body>：本页根节点是 `.v-page > *`，带 v-fade-up 动画的
  // `transform`（fill-mode both → translateY(0) 常驻）会成为 `position:fixed` 的包含块，
  // 令 `fixed inset-0` 相对本页（内容可高达数千 px）定位 → 居中大图上下巨量留白。
  // 挂到 body 即彻底摆脱该 transform 祖先，浮层真正相对视口铺满（操作员 2026-07-09）。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 搜索防抖（避免每键一次请求）。
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // 分类 chips：首枚恒为「全部」(key="")；其后是策划分类（或运行时兜底）。
  const chips = useMemo(() => {
    const src = config.categories?.length ? config.categories : autoCats;
    return [
      { id: "", label: "全部" },
      ...src.map((c) => ({ id: c.key, label: c.label })),
    ];
  }, [config.categories, autoCats]);

  // 无策划分类时，拉本类型在库里真实存在的分类（前 14 个，够一排 chips）。
  useEffect(() => {
    if (config.categories?.length) return;
    let alive = true;
    void fetch(`${GATEWAY}/v1/assets/library/categories?type=${encodeURIComponent(config.type)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((d: { categories?: string[] }) => {
        if (!alive) return;
        const cats = (d.categories || []).slice(0, 14).map((k) => ({
          key: k,
          label: exploreCategoryLabel(k),
        }));
        setAutoCats(cats);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [config.type, config.categories]);

  // 拉第一页（分类 / 搜索变化时重置）。
  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    setZoomIdx(null);
    try {
      const r = await fetchLibrary({ type: config.type, category: cat, q: debounced, page: 1 });
      setItems(r.items);
      setPage(1);
      setTotal(r.total);
    } catch {
      setError(tt("素材加载失败，请稍后重试。"));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [config.type, cat, debounced, tt]);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  const hasMore = items.length < total;

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const r = await fetchLibrary({ type: config.type, category: cat, q: debounced, page: next });
      setItems((prev) => {
        // 去重（分页边界偶发重复）。
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...r.items.filter((x) => !seen.has(x.id))];
      });
      setPage(next);
      setTotal(r.total);
    } catch {
      /* 加载更多失败静默，用户可再点 */
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, config.type, cat, debounced]);

  // 触底自动加载更多（IntersectionObserver 哨兵）。
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const zoom = zoomIdx !== null ? items[zoomIdx] : null;

  const navigate = useCallback(
    (dir: -1 | 1) => {
      setZoomIdx((idx) => {
        if (idx === null) return idx;
        const nx = idx + dir;
        if (nx < 0 || nx >= items.length) return idx;
        return nx;
      });
    },
    [items.length],
  );

  useEffect(() => {
    if (zoomIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") navigate(-1);
      else if (e.key === "ArrowRight") navigate(1);
      else if (e.key === "Escape") setZoomIdx(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoomIdx, navigate]);

  return (
    <div className={`mx-auto w-full max-w-6xl px-6 py-7 ${className}`}>
      {/* 标题区 */}
      <div className="mb-4">
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
          {tt(config.title || "探索 · 素材")}
        </h1>
        {config.subtitle && (
          <p className="mt-1 text-[13px] text-neutral-500">{tt(config.subtitle)}</p>
        )}
      </div>

      {/* 搜索行（右对齐窄框 + 网格/列表切换，与库三分区一致） */}
      <LibraryToolbar
        search={search}
        setSearch={setSearch}
        view={view}
        setView={setView}
        placeholder={tt("搜索素材")}
        tt={tt}
      />

      {/* 分类 chips（首枚「全部」；与库分区共用版式） */}
      {chips.length > 1 && (
        <LibraryChips chips={chips} active={cat} onChange={setCat} accent={accent} tt={tt} />
      )}

      {/* 内容区 */}
      <div className="mt-5">
        {loading ? (
          <ExploreSkeleton view={view} />
        ) : error ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-[13px] text-neutral-400">{error}</p>
            <button
              type="button"
              onClick={() => void loadFirst()}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[13px] text-neutral-600 transition hover:bg-neutral-50"
            >
              {tt("重试")}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-center">
            <svg className="h-10 w-10 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="8.5" cy="9.5" r="1.8" />
              <path d="M4 17l5-5 4 4 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-[13px] text-neutral-400">
              {search ? tt("未找到匹配的素材") : tt(config.emptyHint || "这个分类暂无素材，换一个分类看看。")}
            </p>
          </div>
        ) : view === "list" ? (
          <ExploreList items={items} onOpen={setZoomIdx} tt={tt} />
        ) : (
          // masonry 瀑布流：CSS columns，卡片 break-inside-avoid，等宽不等高。
          <div
            className="[column-fill:_balance] gap-3"
            style={{ columnCount: undefined, columnWidth: "220px" }}
          >
            {items.map((m, i) => (
              <ExploreCard key={m.id} m={m} onClick={() => setZoomIdx(i)} tt={tt} />
            ))}
          </div>
        )}

        {/* 触底哨兵 + 加载更多态 */}
        {!loading && !error && hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6">
            {loadingMore ? (
              <span className="flex items-center gap-2 text-[13px] text-neutral-400">
                <span className="v-spinner" /> {tt("加载更多…")}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void loadMore()}
                className="rounded-lg border border-neutral-200 px-4 py-1.5 text-[13px] text-neutral-600 transition hover:bg-neutral-50"
              >
                {tt("加载更多")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 放大态：铺满【视口】浮层（portal → body，绕开 .v-page 的 transform 包含块），
          Esc / ← → / ✕。 */}
      {zoom && mounted && createPortal(
        <div className="fixed inset-0 z-[90] flex flex-col bg-black/80 backdrop-blur-sm">
          <div className="flex shrink-0 items-center gap-2 px-4 py-3 text-white">
            <button
              type="button"
              onClick={() => setZoomIdx(null)}
              className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[12px] transition hover:bg-white/20"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {tt("返回")}
            </button>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{tt(zoom.title)}</span>
            {zoom.source_url && (
              <a
                href={zoom.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium text-white transition hover:opacity-90"
                style={{ background: accent }}
              >
                {tt("查看原素材")}
              </a>
            )}
            <span className="shrink-0 text-[11px] tabular-nums text-white/60">
              {(zoomIdx ?? 0) + 1} / {items.length}
            </span>
            <button
              type="button"
              onClick={() => setZoomIdx(null)}
              aria-label={tt("关闭")}
              className="shrink-0 rounded p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
            {zoom.type === "video" ? (
              <video
                key={zoom.id}
                src={zoom.full_url || zoom.preview_url}
                poster={zoom.thumb_url}
                controls
                autoPlay
                loop
                className="v-fade-in max-h-full max-w-full rounded-lg shadow-2xl"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={zoom.id}
                src={zoom.preview_url || zoom.thumb_url}
                alt={tt(zoom.title)}
                className="v-fade-in max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              />
            )}
            {zoomIdx !== null && zoomIdx > 0 && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label={tt("上一项")}
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/30"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {zoomIdx !== null && zoomIdx < items.length - 1 && (
              <button
                type="button"
                onClick={() => navigate(1)}
                aria-label={tt("下一项")}
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/30"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 瀑布流卡片（等宽不等高）：图片按真实宽高比占位，break-inside-avoid 不跨列断裂。
// ---------------------------------------------------------------------------
function ExploreCard({
  m,
  onClick,
  tt,
}: {
  m: ExploreAsset;
  onClick: () => void;
  tt: (s: string) => string;
}) {
  // 用真实宽高比给占位（无宽高时退回 3/4），避免加载时高度跳动、也让瀑布流长短参差。
  const ratio = m.width && m.height ? m.width / m.height : 3 / 4;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl border border-neutral-200 bg-white text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
    >
      <span className="relative block w-full overflow-hidden bg-neutral-100" style={{ aspectRatio: String(ratio) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={m.thumb_url}
          alt={tt(m.title)}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {m.type === "video" && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
              <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        )}
        <span className="pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/25 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
          <span className="rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
            {tt("放大查看")}
          </span>
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate text-[12px] font-medium text-neutral-700">{tt(m.title)}</span>
      </span>
    </button>
  );
}

function ExploreList({
  items,
  onOpen,
  tt,
}: {
  items: ExploreAsset[];
  onOpen: (i: number) => void;
  tt: (s: string) => string;
}) {
  return (
    <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200">
      {items.map((m, i) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onOpen(i)}
          className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-neutral-50"
        >
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.thumb_url} alt="" loading="lazy" className="h-full w-full object-cover" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-neutral-800">{tt(m.title)}</span>
            {m.category && (
              <span className="block truncate text-[11px] text-neutral-500">{exploreCategoryLabel(m.category)}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

function ExploreSkeleton({ view }: { view: "grid" | "list" }) {
  if (view === "list") {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-neutral-100" />
        ))}
      </div>
    );
  }
  // 瀑布流骨架：参差高度。
  const heights = [180, 240, 200, 280, 160, 220, 260, 190, 210, 250, 170, 230];
  return (
    <div className="gap-3" style={{ columnWidth: "220px" }}>
      {heights.map((h, i) => (
        <div
          key={i}
          className="mb-3 w-full break-inside-avoid animate-pulse rounded-xl bg-neutral-100"
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 分类键 → 中文名兜底（config.categories 未提供时用）。覆盖库里常见 category 键；
// 未覆盖的走「行业前缀剥离 + 原样」。与 asset 站 categoryLabel 精神一致，但探索页自带
// 一份轻量表（不 import asset 站代码，保持 @oceanleo/ui 无跨站依赖）。
// ---------------------------------------------------------------------------
const EXPLORE_CATEGORY_LABELS: Record<string, string> = {
  // image 场景/行业
  food: "美食",
  background: "背景",
  city: "城市",
  business: "商务",
  transport: "交通",
  abstract: "抽象",
  nature: "自然",
  travel: "旅行",
  tech: "科技",
  realestate: "房产",
  beauty: "美妆",
  wedding: "婚礼",
  ecommerce: "电商",
  festival: "节日",
  finance: "金融",
  medical: "医疗",
  pet: "宠物",
  fashion: "服饰",
  fitness: "健身",
  education: "教育",
  office: "办公",
  gaming: "电竞",
  coffee: "咖啡",
  wedding2: "婚礼",
  ocean: "海洋",
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
  music: "音乐现场",
  kids: "儿童",
  // 图表
  图表: "图表",
  chart: "图表",
  // vector
  icon: "icon 图标",
  "flat-illust": "扁平插画",
  symbol: "符号",
  shape: "形状",
  ornament: "装饰花纹",
  // 3d
  model: "3D 模型",
  hdri: "HDRI 环境",
  texture: "材质纹理",
  // video
  smoke: "烟雾",
  particles: "粒子",
  light: "光效",
  water: "水",
  clouds: "云朵",
  flowers: "花卉",
  // sticker / emoji
  emoji: "emoji 贴纸",
  hot: "热门",
  xhs: "小红书",
  guofeng: "国风水墨",
  // font
  "art-text": "艺术字",
};

/** 分类键 → 中文名（探索页兜底，覆盖不到的剥掉行业前缀后原样返回）。 */
export function exploreCategoryLabel(key: string): string {
  const k = (key || "").trim();
  if (EXPLORE_CATEGORY_LABELS[k]) return EXPLORE_CATEGORY_LABELS[k];
  const stripped = k.replace(/^(ind|bg|ph|vid|mus|sfx)-/, "");
  return EXPLORE_CATEGORY_LABELS[stripped] || stripped;
}

/** 便捷：ReactNode 版空态图标（供站点自定义空态时复用，可选）。 */
export function exploreEmptyIcon(): ReactNode {
  return (
    <svg className="h-10 w-10 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.8" />
      <path d="M4 17l5-5 4 4 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
