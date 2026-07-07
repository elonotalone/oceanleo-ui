"use client";

// ============================================================================
// @oceanleo/ui — NavigatorGuide（功能页「使用指南」导航页，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v12.1（操作员 2026-07-04，对照七色米 AI「AI 商品海报」右侧教学页）：
//
//   每个功能 app 的**右栏（库）第一个标签 = 使用指南（navigator）**：
//     · 上方：文字（可含图片）教用户「这个功能是干什么的、怎么用」；
//     · 下方：几个**示例**卡片，点一下就把示例内容**填进左侧操作台/输入框**
//       （示例可带图片——因为左栏支持图片输入，如 image 站的参考图）。
//
//   右版面默认展开（SplitWorkspace internalOpen=true），首屏落在本指南上，用户
//   一眼看清操作方式，不必自己去翻库。
//
// 数据来源：`ConsoleFunction.guide`（各站传自己的教学文案 + 示例）。渲染与「填进
// 左栏」的动作由 OperatorConsole 统一接线（GuideFillContext）——各站零额外代码即获
// 得统一的 navigator 体验。示例点击 → OperatorConsole 把内容灌进当前功能的左栏。
// ============================================================================

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import { useGuideWorkflows } from "./guide-context";
import { timeAgo } from "../ui";
import { LibraryToolbar, LibraryChips } from "./LibraryLayout";

/** 一个示例「prompt」（可带图片，对应左栏图片输入）。 */
export interface GuideExample {
  /** 卡片标题（一句话点题）。 */
  label: string;
  /** 点击后灌进左栏输入框的文案（可含 `[占位]` 提示——进输入框后作为幽灵占位）。 */
  prompt: string;
  /**
   * 卡片正文（操作员 2026-07-05）：一句话概括这张示例是做什么的（展示用）。
   * 与 `prompt` 分离——卡片上只显示这句话，点击后填进左栏的是完整的 `prompt`。
   * 不给则回退显示 `prompt`（向后兼容）。
   */
  hint?: string;
  /** 可选：示例配图缩略图 URL（宗旨 v15：图示卡片顶部大图，AI 风格素材）。 */
  thumb?: string;
  /** 可选：右上角小角标文案（如「热」「新」），对照稿定式图示目录。 */
  badge?: string;
  /** 可选：点击时一并放进左栏的图片 URL（如参考图）。左栏支持图片输入的功能用。 */
  imageUrl?: string;
  /** 可选：卡片左侧 emoji / 图标（无 thumb 时的回退图示）。 */
  icon?: ReactNode;
  /**
   * 升级版 prompt（宗旨 v15 决策 C）：点这张卡时，除了把 prompt 灌进主输入字段，还把
   * 这里的参数一并 patch 进左侧操作台（如 image 的 ratio/genMode、word 的 style/words）。
   * 即「导航卡片不光填文字，还填/选左边各项参数」。
   */
  set?: Record<string, unknown>;
  /**
   * 可选：任意业务负载，随填充事件透传给左栏的 onGuideExample（如 image 站把 sceneId
   * 放这里，点示例即套用整套场景预设，而不只是填文本）。
   */
  data?: unknown;
}

/**
 * 导航区「一个板块」= 一组模板示例 + 板块标题（操作员 2026-07-05）。
 * 每个成品 app 的库→导航区固定放【三个板块】，每板块几张模板卡，点一张即把该模板
 * 灌进左侧操作台。板块让「专门针对海报的几份 prompt」有清晰的归类（如
 * 「行业模板 / 风格模板 / 快速起手」）。
 */
export interface GuideSection {
  /** 板块标题（如「行业模板」「风格方向」「快速起手」）。 */
  title: string;
  /** 该板块下的模板卡（点一张 → 填进左栏操作台）。 */
  examples: GuideExample[];
}

/** 一个功能页的「使用指南」内容配置。 */
export interface FunctionGuide {
  /** 顶部一句话标题（默认用功能名 + “使用指南”）。 */
  title?: string;
  /** 教学正文（支持多段；纯文本或自定义节点）。 */
  intro?: ReactNode;
  /** 可选：教学配图 URL（展示在正文上方，如效果对比图）。 */
  heroImage?: string;
  /**
   * 分板块的模板区（操作员 2026-07-05 强制：每个成品 app 库→导航固定三个板块）。
   * 给了 sections → 导航区按板块渲染（板块标题 + 该板块模板卡）。与旧 `examples`
   * 二选一：给 sections 时忽略 examples；两者都不给则无模板区。
   */
  sections?: GuideSection[];
  /** 示例列表（点一个 → 填进左栏）。旧扁平模式；`sections` 存在时忽略它。 */
  examples?: GuideExample[];
  /** 扁平示例区标题（仅旧 `examples` 模式用），默认「试试这些示例」。 */
  examplesLabel?: string;
}

export interface NavigatorGuideProps {
  guide: FunctionGuide;
  accent?: string;
  /** 点击某个示例 → 把它灌进左栏（由 OperatorConsole 提供实现）。 */
  onUseExample?: (ex: GuideExample) => void;
}

// 一个可渲染的导航条目（模板示例 / 我的工作流 统一成它）。
interface NavItem {
  key: string;
  label: string;
  hint?: string;
  /** 右侧副信息（如工作流的相对时间）。 */
  meta?: string;
  thumb?: string;
  icon?: ReactNode;
  badge?: string;
  /** 用于搜索匹配的原文（小写）。 */
  searchText: string;
  onClick: () => void;
  /** 我的工作流才有：删除。 */
  onDelete?: () => void;
}

/**
 * 功能页右栏「导航」= 库风格的模板/工作流浏览器（宗旨 v17 版式，操作员 2026-07-07）。
 * 与「素材库 / 文件库」三分区版式**几乎完全一致**（从上到下：搜索框 → 分类 chips →
 * 卡片网格/列表）。类别 chips：第一枚恒为「全部」（合并所有板块的模板），其后为
 * 「我的」（用户保存的工作流），再后是本成品的各模板板块。点一张卡片 → 把该模板/工作流
 * 灌进左侧操作台（prompt + 参数），不跳页。**不再显示 guide.intro 教学文案**（操作员
 * 2026-07-07：那段「在左侧操作台精调…」的文案删除）。
 */
export function NavigatorGuide({ guide, accent = "#4f46e5", onUseExample }: NavigatorGuideProps) {
  const tt = useUI();
  const wf = useGuideWorkflows();
  const workflows = wf?.workflows ?? [];

  // 模板板块（sections 优先；否则把扁平 examples 收成一个板块）。
  const sections = useMemo<GuideSection[]>(() => {
    const secs = (guide.sections ?? []).filter((s) => (s.examples?.length ?? 0) > 0);
    if (secs.length) return secs;
    const flat = guide.examples ?? [];
    return flat.length ? [{ title: guide.examplesLabel ?? "模板", examples: flat }] : [];
  }, [guide]);

  // 类别 chips（操作员 2026-07-07）：第一枚恒为「全部」（直接显示所有板块的模板卡），
  // 其后「我的」（保存的工作流），再后每个模板板块一枚。
  const categories = useMemo(
    () => [
      { id: "__all", label: "全部" },
      { id: "__mine", label: "我的" },
      ...sections.map((s, i) => ({ id: `s${i}`, label: s.title })),
    ],
    [sections],
  );

  const [cat, setCat] = useState<string>("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  // 默认落在「全部」（一进来即看到所有模板，与素材库/文件库首屏一致）。
  const activeCat = categories.some((c) => c.id === cat) ? cat : "__all";

  // 把某板块的示例映射成可渲染条目（带稳定 key）。
  const exampleItems = useCallback(
    (exs: GuideExample[], idx: number): NavItem[] =>
      exs.map((ex, i) => ({
        key: `${idx}-${i}`,
        label: ex.label,
        hint: ex.hint ?? ex.prompt,
        thumb: ex.thumb,
        icon: ex.icon ?? "✦",
        badge: ex.badge,
        searchText: `${ex.label} ${ex.hint ?? ""} ${ex.prompt}`.toLowerCase(),
        onClick: () => onUseExample?.(ex),
      })),
    [onUseExample],
  );

  const items = useMemo<NavItem[]>(() => {
    if (activeCat === "__mine") {
      return workflows.map((w) => ({
        key: w.id,
        label: w.label || tt("我的工作流"),
        hint: paramSummary(w.params, tt),
        meta: timeAgo(w.created_at, tt),
        icon: "📌",
        searchText: `${w.label} ${w.prompt}`.toLowerCase(),
        onClick: () => onUseExample?.({ label: w.label, prompt: w.prompt, set: w.params }),
        onDelete: () => void wf?.deleteWorkflow(w.id),
      }));
    }
    // 「全部」：把每个板块的示例平铺合并（保序）。
    if (activeCat === "__all") {
      return sections.flatMap((s, idx) => exampleItems(s.examples ?? [], idx));
    }
    const idx = Number(activeCat.slice(1)) || 0;
    return exampleItems(sections[idx]?.examples ?? [], idx);
  }, [activeCat, workflows, sections, onUseExample, wf, tt, exampleItems]);

  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((it) => it.searchText.includes(q)) : items;
  const mine = activeCat === "__mine";

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* 搜索框（右对齐、窄，与素材库/文件库同尺寸）+ 卡片/列表切换 */}
      <LibraryToolbar
        search={search}
        setSearch={setSearch}
        view={view}
        setView={setView}
        placeholder={tt("搜索模板 / 工作流")}
        tt={tt}
      />

      {/* 类别 chips（第一枚恒为「全部」；与素材库/文件库共用 LibraryChips 版式） */}
      <LibraryChips
        chips={categories}
        active={activeCat}
        onChange={setCat}
        accent={accent}
        tt={tt}
      />

      {/* 内容：卡片网格 / 列表 */}
      {filtered.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center">
          <svg className="h-10 w-10 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 9h18M8 4v5" strokeLinecap="round" />
          </svg>
          <p className="text-[13px] text-neutral-400">
            {mine
              ? q
                ? tt("未找到匹配的工作流")
                : tt("还没有保存的工作流")
              : q
                ? tt("未找到匹配的模板")
                : tt("这个类别下暂无模板")}
          </p>
          {mine && !q && (
            <p className="max-w-xs text-[12px] leading-relaxed text-neutral-400">
              {tt("在左侧「操作台」填好输入后，点标题栏的「保存工作流」，就会收藏到这里，随时一键复用。")}
            </p>
          )}
        </div>
      ) : view === "list" ? (
        <div className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200">
          {filtered.map((it) => (
            <NavRow key={it.key} it={it} accent={accent} tt={tt} />
          ))}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          {filtered.map((it) => (
            <NavCard key={it.key} it={it} accent={accent} tt={tt} />
          ))}
        </div>
      )}
    </div>
  );
}

type TT = (s: string, vars?: Record<string, string | number>) => string;

/** 把工作流参数（style/words/ratio…）拼成一句概览（跳过对象/空值）。 */
function paramSummary(params: Record<string, unknown>, tt: TT): string {
  const parts = Object.values(params || {})
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map((v) => (typeof v === "number" ? String(v) : tt(String(v))));
  return parts.join(" · ");
}

/** 卡片缩略图（有 thumb 用图；否则 emoji tint 图示）。 */
function NavThumb({ it, accent, size }: { it: NavItem; accent: string; size: "grid" | "list" }) {
  if (it.thumb) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={it.thumb}
        alt=""
        loading="lazy"
        className={
          size === "grid"
            ? "h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            : "h-full w-full rounded-lg object-cover"
        }
      />
    );
  }
  return (
    <span
      className={`flex h-full w-full items-center justify-center ${size === "grid" ? "text-3xl" : "text-lg"}`}
      style={{ color: accent }}
    >
      {it.icon ?? "✦"}
    </span>
  );
}

function DeleteButton({ onDelete, tt, floating }: { onDelete: () => void; tt: TT; floating?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      aria-label={tt("删除")}
      className={
        floating
          ? "absolute right-2 top-2 rounded-lg bg-white/85 p-1.5 text-neutral-400 opacity-0 backdrop-blur transition-all duration-150 hover:text-rose-500 active:scale-90 group-hover:opacity-100"
          : "shrink-0 rounded-lg p-1.5 text-neutral-300 opacity-0 transition-all duration-150 hover:text-rose-500 active:scale-90 group-hover:opacity-100"
      }
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function NavCard({ it, accent, tt }: { it: NavItem; accent: string; tt: TT }) {
  const second = [it.hint ? tt(it.hint) : "", it.meta].filter(Boolean).join(" · ");
  return (
    <div className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md">
      <button type="button" onClick={it.onClick} className="w-full text-left">
        <span className="relative block w-full overflow-hidden" style={{ aspectRatio: "16 / 10", background: tintColor(accent) }}>
          <NavThumb it={it} accent={accent} size="grid" />
          {it.badge && (
            <span className="absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm" style={{ background: accent }}>
              {tt(it.badge)}
            </span>
          )}
          <span className="pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/25 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
            <span className="rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-medium" style={{ color: accent }}>
              {tt("填入 →")}
            </span>
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
          <span className="truncate text-[13px] font-medium text-neutral-800">{tt(it.label)}</span>
          {second && <span className="line-clamp-1 text-[11px] leading-relaxed text-neutral-500">{second}</span>}
        </span>
      </button>
      {it.onDelete && <DeleteButton onDelete={it.onDelete} tt={tt} floating />}
    </div>
  );
}

function NavRow({ it, accent, tt }: { it: NavItem; accent: string; tt: TT }) {
  const second = [it.hint ? tt(it.hint) : "", it.meta].filter(Boolean).join(" · ");
  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 transition hover:bg-neutral-50">
      <button type="button" onClick={it.onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg"
          style={{ background: tintColor(accent) }}
        >
          <NavThumb it={it} accent={accent} size="list" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-neutral-800">{tt(it.label)}</span>
          {second && <span className="block truncate text-[11px] text-neutral-500">{second}</span>}
        </span>
      </button>
      {it.onDelete && <DeleteButton onDelete={it.onDelete} tt={tt} />}
    </div>
  );
}

function tintColor(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return "rgba(79,70,229,0.12)";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},0.12)`;
}
