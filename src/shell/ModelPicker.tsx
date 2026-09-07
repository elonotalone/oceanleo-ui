"use client";

// ============================================================================
// @oceanleo/ui — 全家桶全局模型组合切换器
// ----------------------------------------------------------------------------
// Lite / Pro / Max 是平台维护的预设组合；用户可在「AI 模型」页创建多个具名自定义组合。
// 每个用户只有一个全局活跃组合，任一站右上角切换后，所有 OceanLeo 站都按同一组合
// 运行。组合内每项能力的模型从上到下依次兜底。
// ============================================================================

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  getModelGroups,
  MODEL_GROUP_CHANGED_EVENT,
  setActiveModelGroup,
  type ModelGroup,
  type ModelGroupsPayload,
  type PreferredModel,
} from "../lib/auth/account";
import { IconCheck, IconChevronDown } from "./icons";
import { useUI } from "../i18n/ui/useUI";
import { useWorkbenchOpen } from "./workbench-open-store";

export type ModelCategory = "text" | "image" | "video" | "threed" | "audio";

const FALLBACK_GROUPS: ModelGroup[] = (["lite", "pro", "max"] as const).map(
  (tier) => ({
    key: `preset:${tier}`,
    id: tier,
    kind: "preset",
    name: tier[0].toUpperCase() + tier.slice(1),
    editable: false,
    selection: {},
  }),
);

/** 弹层最高多少；再多就在条目区里滚。 */
export const POPOVER_MAX_HEIGHT = 360;
/** 弹层与视口边缘至少留这么多。 */
export const POPOVER_VIEWPORT_GUTTER = 8;
/** 低于这个高度的空间视为「放不下」，转去另一侧。 */
export const POPOVER_MIN_HEIGHT = 200;

/**
 * 决定弹层往哪侧弹、最多多高。纯函数，便于单测。
 * - 首选侧空间够（≥ POPOVER_MIN_HEIGHT）就用首选侧；
 * - 不够就看另一侧够不够；
 * - 两侧都不够取空间大的一侧；
 * - 高度 = min(POPOVER_MAX_HEIGHT, 该侧空间 - gutter)，但不低于一个可用下限。
 */
export function resolvePopoverLayout({
  preferred,
  spaceAbove,
  spaceBelow,
}: {
  preferred: "top" | "bottom";
  spaceAbove: number;
  spaceBelow: number;
}): { side: "top" | "bottom"; maxHeight: number } {
  const usable = (space: number) =>
    Math.max(0, space - POPOVER_VIEWPORT_GUTTER);
  const above = usable(spaceAbove);
  const below = usable(spaceBelow);
  const preferredSpace = preferred === "top" ? above : below;
  const otherSide: "top" | "bottom" = preferred === "top" ? "bottom" : "top";
  const otherSpace = preferred === "top" ? below : above;
  let side: "top" | "bottom";
  if (preferredSpace >= POPOVER_MIN_HEIGHT) side = preferred;
  else if (otherSpace >= POPOVER_MIN_HEIGHT) side = otherSide;
  else side = preferredSpace >= otherSpace ? preferred : otherSide;
  const space = side === "top" ? above : below;
  const maxHeight = Math.max(120, Math.min(POPOVER_MAX_HEIGHT, space));
  return { side, maxHeight };
}

export interface ModelGroupPickerProps {
  /** AI 模型管理页。 */
  apiHref?: string;
  className?: string;
  align?: "left" | "right";
  /** 紧凑模式：放入输入框右下角等狭小空间 */
  compact?: boolean;
  /** 弹出方向，默认 bottom（向下）；输入框内传 top（向上） */
  placement?: "top" | "bottom";
}

/**
 * Legacy shape retained for source compatibility. Model/category callbacks are
 * intentionally ignored: the runtime now resolves one server-side global group.
 */
export interface ModelPickerProps extends ModelGroupPickerProps {
  categories?: ModelCategory[];
  siteId?: string;
  variant?: "bar" | "popover";
  onChange?: (category: ModelCategory, model: PreferredModel) => void;
  onSelectionChange?: (
    selection: Partial<Record<ModelCategory, PreferredModel>>,
  ) => void;
}

export function ModelGroupPicker(props: ModelGroupPickerProps) {
  // 紧凑模式（挂在输入框内等）不受 workbenchOpen 隐藏影响；顶部独立条在面板打开时收起。
  const workbenchOpen = useWorkbenchOpen();
  if (!props.compact && workbenchOpen) return null;
  return <ModelGroupPickerBody {...props} />;
}

function ModelGroupPickerBody({
  apiHref = "/api",
  className = "",
  align = "right",
  compact = false,
  placement = "bottom",
}: ModelGroupPickerProps) {
  const tt = useUI();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ModelGroupsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const groups = payload?.groups?.length ? payload.groups : FALLBACK_GROUPS;
  const activeKey = payload?.active_group_key || "preset:pro";
  const active =
    groups.find((group) => group.key === activeKey)
    || groups.find((group) => group.key === "preset:pro")
    || groups[0];

  // 依赖里刻意没有 `tt`：模型组合与语言无关，换语言不该重新拉一次 `getModelGroups()`，
  // 也不该把 `MODEL_GROUP_CHANGED_EVENT` 监听拆了重挂。错误串只存中文原文（词典 key），
  // 渲染处本来就是 `tt(error)`，翻译在那里发生。
  useEffect(() => {
    let alive = true;
    void getModelGroups().then((result) => {
      if (!alive) return;
      if (result.ok && result.data) {
        setPayload(result.data);
        setError("");
      } else if (result.status !== 401) {
        setError(result.error || "模型组合加载失败");
      }
      setLoading(false);
    });
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<ModelGroupsPayload>).detail;
      if (detail?.groups) {
        setPayload(detail);
        setError("");
      }
    };
    window.addEventListener(MODEL_GROUP_CHANGED_EVENT, onChanged);
    return () => {
      alive = false;
      window.removeEventListener(MODEL_GROUP_CHANGED_EVENT, onChanged);
    };
  }, []);

  // 弹层实际落在哪一侧、最多能多高——按打开那一刻触发键到视口上下边的空间算。
  // 操作员 2026-09-07 图 b32891f2：主站首页输入框在页面上部，写死「向上弹」就飞出
  // 页面顶端、被浏览器切掉，Lite/Pro/Max 只剩下半截。现在：哪侧空间够就往哪侧弹；
  // 两侧都不够时取大的一侧，并把整块弹层的高度钉在那段空间内，条目区自己滚动。
  const [layout, setLayout] = useState<{ side: "top" | "bottom"; maxHeight: number }>({
    side: placement,
    maxHeight: POPOVER_MAX_HEIGHT,
  });
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      const viewportHeight =
        typeof window !== "undefined" ? window.innerHeight : 0;
      if (!rect || !viewportHeight) return;
      setLayout(
        resolvePopoverLayout({
          preferred: placement,
          spaceAbove: rect.top,
          spaceBelow: viewportHeight - rect.bottom,
        }),
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function activate(group: ModelGroup) {
    if (!payload || saving || group.key === activeKey) {
      if (group.key === activeKey) setOpen(false);
      return;
    }
    setSaving(group.key);
    setError("");
    const result = await setActiveModelGroup(group.key);
    setSaving("");
    if (result.ok && result.data) {
      setPayload(result.data);
      setOpen(false);
    } else {
      setError(result.error || "切换模型组合失败");
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[12px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:scale-95 ${
            open
              ? "border-neutral-300 bg-neutral-100 text-neutral-900"
              : "border-neutral-200/90 bg-stone-50/80 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-900"
          }`}
          title={active?.name ? `${tt("模型组合")} · ${active.name}` : tt("模型组合")}
        >
          <svg
            className="h-3 w-3 shrink-0 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M5 7h14M5 12h14M5 17h14" strokeLinecap="round" />
            <circle cx="8" cy="7" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="11" cy="17" r="1.5" fill="currentColor" stroke="none" />
          </svg>
          <span className="max-w-[70px] truncate">
            {loading ? "…" : active?.name || "Pro"}
          </span>
          <span
            className={`shrink-0 text-neutral-400 transition-transform duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] ${
              open ? "rotate-180" : ""
            }`}
          >
            <IconChevronDown className="h-3 w-3" />
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
            open
              ? "border-neutral-300 bg-neutral-50 text-neutral-900"
              : "border-neutral-200 bg-white/90 text-neutral-700 hover:border-neutral-300 hover:bg-white"
          }`}
          title={tt("选择全站通用的模型组合")}
        >
          <svg
            className="h-3.5 w-3.5 shrink-0 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M5 7h14M5 12h14M5 17h14" strokeLinecap="round" />
            <circle cx="8" cy="7" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="11" cy="17" r="1.5" fill="currentColor" stroke="none" />
          </svg>
          <span className="shrink-0 text-neutral-500">{tt("模型组合")}</span>
          <span className="truncate text-neutral-900">
            {loading ? "…" : active?.name || "Pro"}
          </span>
          <span
            className={`shrink-0 text-neutral-400 transition-transform duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] ${
              open ? "rotate-180" : ""
            }`}
          >
            <IconChevronDown className="h-3.5 w-3.5" />
          </span>
        </button>
      )}

      {open && (
        <div
          data-model-picker-popover
          data-side={layout.side}
          role="listbox"
          aria-label={tt("全站模型组合")}
          style={{ maxHeight: layout.maxHeight }}
          className={`v-scale-in absolute z-50 flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl ${
            compact ? "w-[min(15rem,88vw)]" : "w-[min(22rem,88vw)]"
          } ${
            layout.side === "top" ? "bottom-full mb-2" : "top-full mt-1.5"
          } ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div
            className={`shrink-0 border-b border-neutral-100 ${
              compact ? "px-3 py-2" : "px-3.5 py-3"
            }`}
          >
            <p
              className={`font-semibold text-neutral-800 ${
                compact ? "text-[11px]" : "text-[12px]"
              }`}
            >
              {tt("全站模型组合")}
            </p>
            {!compact && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">
                {tt("所有 OceanLeo 网站共用；组合内模型从上到下依次兜底。")}
              </p>
            )}
          </div>
          {/* 条目区：弹层高度被钉在视口内时，这里自己滚，滚动条可见。 */}
          <div
            data-model-picker-list
            className={`min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] ${
              compact ? "py-1" : "py-1.5"
            }`}
          >
            {groups.map((group) => {
              const selected = group.key === activeKey;
              const busy = group.key === saving;
              return (
                <button
                  key={group.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={!payload || !!saving}
                  onClick={() => void activate(group)}
                  className={`flex w-full items-center text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
                    compact ? "gap-2 px-3 py-1.5" : "gap-3 px-3.5 py-2.5"
                  } ${
                    selected ? "bg-neutral-50" : "hover:bg-neutral-50/70"
                  } disabled:cursor-default disabled:opacity-60`}
                >
                  <span
                    className={`grid shrink-0 place-items-center rounded-lg font-bold ${
                      compact ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-[11px]"
                    } ${
                      group.kind === "preset"
                        ? "bg-neutral-900 text-white"
                        : "bg-indigo-50 text-indigo-600"
                    }`}
                  >
                    {group.kind === "preset"
                      ? group.name.slice(0, 1)
                      : "自"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate font-medium text-neutral-900 ${
                        compact ? "text-[12px]" : "text-[13px]"
                      }`}
                    >
                      {busy ? tt("切换中…") : group.name}
                    </span>
                    {group.kind === "custom" && (
                      <span
                        className={`block text-neutral-400 ${
                          compact ? "text-[10px]" : "mt-0.5 text-[11px]"
                        }`}
                      >
                        {tt("我的自定义组合")}
                      </span>
                    )}
                  </span>
                  {selected && (
                    <IconCheck
                      className={`shrink-0 text-emerald-600 ${
                        compact ? "h-3.5 w-3.5" : "h-4 w-4"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {error && (
            <p className="shrink-0 border-t border-rose-100 bg-rose-50 px-3.5 py-2 text-[11px] text-rose-600">
              {tt(error)}
            </p>
          )}
          {!payload && !loading && !error && (
            <p className="shrink-0 border-t border-neutral-100 px-3.5 py-2 text-[11px] text-neutral-400">
              {tt("登录后可切换并使用自定义模型组合。")}
            </p>
          )}
          <a
            href={apiHref}
            className={`block shrink-0 border-t border-neutral-100 font-medium text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 hover:text-neutral-900 ${
              compact ? "px-3 py-2 text-[11px]" : "px-3.5 py-2.5 text-[12px]"
            }`}
          >
            {tt("管理模型组合 →")}
          </a>
        </div>
      )}
    </div>
  );
}

/** Backward-compatible export; semantics are now global group selection. */
export function ModelPicker({
  categories: _categories,
  siteId: _siteId,
  variant: _variant,
  onChange: _onChange,
  onSelectionChange: _onSelectionChange,
  ...props
}: ModelPickerProps) {
  void _categories;
  void _siteId;
  void _variant;
  void _onChange;
  void _onSelectionChange;
  return <ModelGroupPicker {...props} />;
}
