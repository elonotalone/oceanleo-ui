"use client";

// ============================================================================
// @oceanleo/ui — 首页 app 卡片网格（操作员 2026-07-25 拍板的合并版首页卡片）
// ----------------------------------------------------------------------------
// 一张卡 = 一个 app（本站 `lib/app-catalog.ts` 的 GoalApp）= 一个代表 prompt。首页
// 不再渲染 PROMPT_LIBRARY 的纯文字 prompt 卡（那条路径留给未迁移的站，见 HomeCards）。
//
// 版式（合同 §0 第 3/4/5/6/7/10/11/13 条）：
//   常态：左侧 1:1 缩略图（`app.thumb`；无图回退 emoji tint，**不留白**）
//         右上 app 名（深色 15px 半粗）、右下 tagline（浅色 13px，两行截断）
//   hover / 触屏轻点一次：图片放大铺满整卡 → 图上居中「预览」，卡片下缘浮出
//         「prompt」「生成类似」
//   点整卡（未命中按钮）= 把代表 prompt 灌进首页输入框（与旧 prompt 卡完全一致）
//   顶部按 `app.group` 出分类 tab（无 group 的归「全部」）；末位一张「查看全部 →」跳
//   `/workspace`；「添加 prompt」入口与用户自建卡保留，自建卡用无图 emoji 版式混排。
//
// 代表 prompt 为空的 app（music 站 22 个 app 全是这样）：不渲染 prompt / 生成类似
// 按钮，**绝不灌空串**；但仍可「预览」，并在 lightbox 里走「高级编辑」。
// ============================================================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { representativePrompt, type GoalApp } from "./app-catalog";
import {
  workspaceAppAdvancedHref,
  workspaceAppFillHref,
} from "./site-catalog-controller";
import {
  loadCustomPromptCards,
  promptCardsForSite,
  saveCustomPromptCards,
  type PromptCard,
} from "./home-cards";
import { AddPromptModal, PromptCardModal } from "./HomePromptModals";
import { ImageLightbox } from "./ImageLightbox";
import { brandColorFor, tintOf } from "../lib/brand-color";
import { useUI } from "../i18n/ui/useUI";

/** 分类 tab 的「全部」哨兵值（不会与站点自定义 group 撞名）。 */
export const HOME_APP_ALL_GROUP = "__all__";
/** 首页精选张数默认上限（合同 §0 第 10 条：只放精选 8–12 张）。 */
export const HOME_APP_FEATURED_LIMIT = 12;
/** 「查看全部 →」目标：本站工作台目录。 */
export const HOME_APP_SEE_ALL_HREF = "/workspace";

/** 出现在首页的 app（隐藏在目录外的运行时不算）。 */
function visibleApps(apps: GoalApp[]): GoalApp[] {
  return (apps || []).filter((a) => a && a.id && !a.hiddenFromDirectory);
}

/**
 * 顶部分类 tab 的 group 列表（按 catalog 里首次出现的顺序去重）。没有 `group` 的 app
 * 不产生 tab —— 它们只在「全部」里出现。
 */
export function homeAppGroups(apps: GoalApp[]): string[] {
  const seen: string[] = [];
  for (const app of visibleApps(apps)) {
    const group = (app.group || "").trim();
    if (group && !seen.includes(group)) seen.push(group);
  }
  return seen;
}

/** 当前分类下的精选 app（「全部」含无 group 的卡）。 */
export function featuredHomeApps(
  apps: GoalApp[],
  limit = HOME_APP_FEATURED_LIMIT,
  group: string = HOME_APP_ALL_GROUP,
): GoalApp[] {
  const pool =
    group === HOME_APP_ALL_GROUP
      ? visibleApps(apps)
      : visibleApps(apps).filter((a) => (a.group || "").trim() === group);
  return limit > 0 ? pool.slice(0, limit) : pool;
}

/**
 * lightbox 大图的素材来源：站点 catalog 里的 `thumb` 既可能是稳定素材 key，也可能是
 * 已拼好的 `<key>.thumb.webp` 直链。后者要换成大图变体 `<key>.webp`，否则「预览」放大
 * 的仍是那张缩略图。
 */
export function appPreviewImageKey(app: GoalApp): string | undefined {
  const thumb = (app.thumb || "").trim();
  if (!thumb) return undefined;
  return thumb.replace(/\.thumb\.webp$/i, ".webp");
}

// ---------------------------------------------------------------------------
// 单张卡（app 卡 / 自建 prompt 卡共用外壳：左方图 + 右文 + hover 铺满层）
// ---------------------------------------------------------------------------

function CardShell({
  expanded,
  onExpand,
  onActivate,
  children,
  extra,
}: {
  expanded: boolean;
  /** 触屏第一次轻点：只展开（等价 hover 态），不触发点卡动作。 */
  onExpand: () => void;
  onActivate: () => void;
  children: ReactNode;
  extra?: ReactNode;
}) {
  // 触屏没有 hover：记下本次交互的指针类型，第一次轻点先展开。
  const touchRef = useRef(false);
  return (
    <div
      data-home-app-card
      data-expanded={expanded ? "1" : "0"}
      role="button"
      tabIndex={0}
      onPointerDown={(e) => {
        touchRef.current = e.pointerType === "touch";
      }}
      onClick={() => {
        if (touchRef.current && !expanded) {
          onExpand();
          return;
        }
        onActivate();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className="group relative flex min-h-[92px] cursor-pointer overflow-hidden rounded-xl border border-stone-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow"
    >
      {children}
      {extra}
    </div>
  );
}

/** 左侧 1:1 图块：有图放图，无图放 emoji tint（同尺寸，绝不留白）。 */
function SquareThumb({
  thumb,
  icon,
  color,
  alt,
}: {
  thumb?: string;
  icon: ReactNode;
  color: string;
  alt: string;
}) {
  return (
    <span className="relative block aspect-square w-[86px] shrink-0 overflow-hidden bg-stone-100">
      {thumb ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={thumb} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span
          className="grid h-full w-full place-items-center text-[26px] leading-none"
          style={{ background: tintOf(color, 0.14), color }}
        >
          {icon}
        </span>
      )}
    </span>
  );
}

/** 右侧文字：上深色 15px 半粗 app 名，下浅色 13px tagline（两行截断）。 */
function CardText({ name, tagline, badge }: { name: string; tagline?: string; badge?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-between px-3 py-2.5">
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-stone-800">{name}</span>
        {badge}
      </div>
      {tagline ? (
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-stone-500">{tagline}</p>
      ) : null}
    </div>
  );
}

function AppCard({
  app,
  accent,
  expanded,
  onExpand,
  onPick,
  onPreview,
}: {
  app: GoalApp;
  accent: string;
  /** 展开态由网格集中持有：同一时刻最多一张卡展开（V1-verdict RR-2）。 */
  expanded: boolean;
  onExpand: () => void;
  onPick: (prompt: string) => void;
  onPreview: (app: GoalApp) => void;
}) {
  const tt = useUI();
  const prompt = representativePrompt(app);
  const color = app.logoColor || brandColorFor(app.id);
  const name = tt(app.name);
  // hover / 轻点展开态：图片放大铺满整卡（无图的 app 用 tint 铺满，同样不留白）。
  const fillVisible = expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100";
  const barVisible = expanded ? "translate-y-0" : "translate-y-full group-hover:translate-y-0";

  return (
    <CardShell
      expanded={expanded}
      onExpand={onExpand}
      onActivate={() => {
        if (prompt) onPick(prompt);
      }}
      extra={
        <>
          {/* 图片放大铺满整卡（常态两栏在下面，被这一层盖住） */}
          <span
            data-home-app-card-fill
            className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ${fillVisible}`}
          >
            {app.thumb ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={app.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span
                className="grid h-full w-full place-items-center text-[40px] leading-none"
                style={{ background: tintOf(color, 0.18), color }}
              >
                {app.icon ?? "✨"}
              </span>
            )}
            <span className="absolute inset-0 bg-stone-900/25" />
          </span>

          {/* 图上居中「预览」 */}
          <span
            data-home-app-card-preview
            className={`absolute inset-0 grid place-items-center transition-opacity duration-200 ${fillVisible}`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPreview(app);
              }}
              className="rounded-full bg-white/90 px-4 py-1.5 text-[12.5px] font-medium text-stone-800 shadow-sm backdrop-blur-sm transition hover:bg-white"
            >
              {tt("预览")}
            </button>
          </span>

          {/* 卡片下缘浮出「prompt」「生成类似」（代表 prompt 为空 → 一个都不给） */}
          {prompt && (
            <span
              data-home-app-card-actions
              className={`absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-stone-900/70 to-transparent px-2 pb-2 pt-4 transition-transform duration-200 ${barVisible}`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPick(prompt);
                }}
                className="rounded-lg px-3 py-1 text-[12px] font-medium text-white shadow-sm transition hover:opacity-90"
                style={{ background: accent }}
              >
                {tt("prompt")}
              </button>
              <a
                href={workspaceAppFillHref(app.id)}
                onClick={(e) => e.stopPropagation()}
                className="rounded-lg bg-white/90 px-3 py-1 text-[12px] font-medium text-stone-800 shadow-sm transition hover:bg-white"
              >
                {tt("生成类似")}
              </a>
            </span>
          )}
        </>
      }
    >
      <SquareThumb thumb={app.thumb} icon={app.icon ?? "✨"} color={color} alt={name} />
      <CardText
        name={name}
        tagline={app.tagline ? tt(app.tagline) : undefined}
        badge={
          app.badge ? (
            <span className="shrink-0 rounded bg-stone-100 px-1 text-[10px] text-stone-500">
              {tt(app.badge)}
            </span>
          ) : undefined
        }
      />
    </CardShell>
  );
}

/** 用户自建卡：无图 emoji 版式，与 app 卡混排；右上角笔 = 查看/编辑。 */
function CustomPromptCard({
  card,
  onPick,
  onEdit,
}: {
  card: PromptCard;
  onPick: (prompt: string) => void;
  onEdit: (card: PromptCard) => void;
}) {
  const tt = useUI();
  const color = brandColorFor(card.id || card.title);
  return (
    <CardShell
      expanded={false}
      onExpand={() => onPick(card.prompt)}
      onActivate={() => onPick(card.prompt)}
      extra={
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(card);
          }}
          title={tt("查看 / 编辑")}
          aria-label={tt("查看 / 编辑")}
          className="absolute right-1.5 top-1.5 rounded-md bg-white/80 p-1 text-stone-400 opacity-0 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-stone-600 group-hover:opacity-100"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      }
    >
      <SquareThumb icon={card.icon || "✨"} color={color} alt={card.title} />
      <CardText
        name={tt(card.title)}
        tagline={tt(card.desc || card.prompt)}
        badge={
          <span className="shrink-0 rounded bg-stone-100 px-1 text-[10px] text-stone-400">
            {tt("我的")}
          </span>
        }
      />
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// 网格本体
// ---------------------------------------------------------------------------

export interface HomeAppCardsProps {
  /** 本站 app 目录（`XXX_APPS`）。一个 app = 一张卡。 */
  apps: GoalApp[];
  /** 站点 id（自建卡按站隔离持久化）。 */
  siteId: string;
  accent?: string;
  /** 首页精选张数上限，默认 12。 */
  featuredLimit?: number;
  /** 点卡 / 点「prompt」：把代表 prompt 灌进首页输入框。 */
  onPick: (prompt: string) => void;
}

export function HomeAppCards({
  apps,
  siteId,
  accent = "#4f46e5",
  featuredLimit = HOME_APP_FEATURED_LIMIT,
  onPick,
}: HomeAppCardsProps) {
  const tt = useUI();
  const [group, setGroup] = useState<string>(HOME_APP_ALL_GROUP);
  const [custom, setCustom] = useState<PromptCard[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PromptCard | null>(null);
  const [previewing, setPreviewing] = useState<GoalApp | null>(null);
  // 触屏轻点展开的那张卡（§0.13）。集中持有有两个用处：同一时刻只展开一张，
  // 以及点到卡片以外的地方能收起——否则触屏上点开的卡会永远停在展开态（V1-verdict RR-2）。
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 点卡片之外的任何地方（空白、tab 条、弹窗）→ 收起。鼠标端有 :hover 兜底，
  // 这条只对没有 hover 的触屏有实际影响。
  useEffect(() => {
    if (!expandedId || typeof document === "undefined") return;
    const collapseOnOutside = (e: Event) => {
      const target = e.target as Element | null;
      if (!target?.closest?.("[data-home-app-card]")) setExpandedId(null);
    };
    document.addEventListener("pointerdown", collapseOnOutside);
    return () => document.removeEventListener("pointerdown", collapseOnOutside);
  }, [expandedId]);

  // 自建卡沿用 home-cards 的 localStorage 存取（老数据不得丢）。
  useEffect(() => {
    setCustom(loadCustomPromptCards(siteId));
  }, [siteId]);

  const groups = useMemo(() => homeAppGroups(apps), [apps]);
  const shown = useMemo(
    () => featuredHomeApps(apps, featuredLimit, group),
    [apps, featuredLimit, group],
  );
  // 「添加 prompt」弹窗的预制库仍是 home-cards 的内置集（它不再当首页卡片来源）。
  const presets = useMemo(() => promptCardsForSite(siteId), [siteId]);
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const c of custom) {
      if (c.category && !seen.includes(c.category)) seen.push(c.category);
    }
    return seen;
  }, [custom]);

  function persist(next: PromptCard[]) {
    setCustom(next);
    saveCustomPromptCards(siteId, next);
  }

  function saveAsMine(card: PromptCard) {
    if (!card.custom || !card.id.startsWith("custom-")) {
      persist([
        {
          ...card,
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          custom: true,
          category: card.category || tt("我的"),
        },
        ...custom,
      ]);
    } else {
      persist(custom.map((c) => (c.id === card.id ? { ...card, custom: true } : c)));
    }
  }

  const previewPrompt = previewing ? representativePrompt(previewing) : null;

  return (
    <section className="w-full" data-home-app-cards>
      {/* 分类 tab（按 app.group；无 group 的只在「全部」出现） */}
      <div className="flex flex-wrap items-center gap-1 border-b border-stone-200/70 pb-0">
        {[HOME_APP_ALL_GROUP, ...groups].map((g) => {
          const on = group === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => {
                setGroup(g);
                setExpandedId(null);
              }}
              className={`relative px-3 pb-2 pt-1 text-[13px] transition ${
                on ? "font-semibold text-stone-900" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {g === HOME_APP_ALL_GROUP ? tt("全部") : tt(g)}
              {on && (
                <span
                  className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full"
                  style={{ background: accent }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {custom.map((c) => (
          <CustomPromptCard key={c.id} card={c} onPick={onPick} onEdit={setEditing} />
        ))}

        {shown.map((app) => (
          <AppCard
            key={app.id}
            app={app}
            accent={accent}
            expanded={expandedId === app.id}
            onExpand={() => setExpandedId(app.id)}
            onPick={onPick}
            onPreview={setPreviewing}
          />
        ))}

        {/* 「添加 prompt」入口（自建卡从这里来，localStorage 老数据不动） */}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 bg-white/60 px-3 py-3 text-stone-400 transition hover:border-stone-400 hover:text-stone-600"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <span className="text-[13px] font-medium">{tt("添加 prompt")}</span>
        </button>

        {/* 网格末位：查看全部 → /workspace */}
        <a
          data-home-app-see-all
          href={HOME_APP_SEE_ALL_HREF}
          className="flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-xl border border-stone-200 bg-white/70 px-3 py-3 text-[13px] font-medium text-stone-600 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow"
        >
          {/* 只用 17 语已覆盖的 `查看全部`：副标题曾是一条未进词典的中文串（V1-verdict R1），
              i18n 词典是 W3 独占目录，故本侧改为不再产出未翻译文案。 */}
          <span>{tt("查看全部")} →</span>
        </a>
      </div>

      {previewing && (
        <ImageLightbox
          title={tt(previewing.name)}
          imageKey={appPreviewImageKey(previewing)}
          fallbackIcon={previewing.icon ?? "✨"}
          accent={accent}
          prompt={previewPrompt}
          onUsePrompt={(p) => {
            onPick(p);
            setPreviewing(null);
          }}
          fillHref={workspaceAppFillHref(previewing.id)}
          advancedHref={workspaceAppAdvancedHref(previewing.id)}
          onClose={() => setPreviewing(null)}
        />
      )}

      {adding && (
        <AddPromptModal
          accent={accent}
          presets={presets}
          existing={custom}
          categories={categories}
          onAdd={saveAsMine}
          onClose={() => setAdding(false)}
        />
      )}

      {editing && (
        <PromptCardModal
          card={editing}
          isNew={false}
          accent={accent}
          categories={categories}
          onUse={(text) => {
            onPick(text);
            setEditing(null);
          }}
          onSave={(card) => {
            saveAsMine(card);
            setEditing(null);
          }}
          onDelete={
            editing.custom
              ? () => {
                  persist(custom.filter((c) => c.id !== editing.id));
                  setEditing(null);
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
