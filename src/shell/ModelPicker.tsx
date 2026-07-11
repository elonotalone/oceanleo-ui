"use client";

// ============================================================================
// @oceanleo/ui — 全家桶全局模型组合切换器
// ----------------------------------------------------------------------------
// Lite / Pro / Max 是平台只读组合；用户可在「AI 模型」页创建多个具名自定义组合。
// 每个用户只有一个全局活跃组合，任一站右上角切换后，所有 OceanLeo 站都按同一组合
// 运行。组合内每项能力的模型从上到下依次兜底。
// ============================================================================

import { useEffect, useRef, useState } from "react";
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

export interface ModelGroupPickerProps {
  /** AI 模型管理页。 */
  apiHref?: string;
  className?: string;
  align?: "left" | "right";
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

export function ModelGroupPicker({
  apiHref = "/api",
  className = "",
  align = "right",
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

  useEffect(() => {
    let alive = true;
    void getModelGroups().then((result) => {
      if (!alive) return;
      if (result.ok && result.data) {
        setPayload(result.data);
        setError("");
      } else if (result.status !== 401) {
        setError(result.error || tt("模型组合加载失败"));
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
  }, [tt]);

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
      setError(result.error || tt("切换模型组合失败"));
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition ${
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
          className={`shrink-0 text-neutral-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <IconChevronDown className="h-3.5 w-3.5" />
        </span>
      </button>

      {open && (
        <div
          className={`v-scale-in absolute top-full z-50 mt-1.5 w-[min(22rem,88vw)] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="border-b border-neutral-100 px-3.5 py-3">
            <p className="text-[12px] font-semibold text-neutral-800">
              {tt("全站模型组合")}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">
              {tt("所有 OceanLeo 网站共用；组合内模型从上到下依次兜底。")}
            </p>
          </div>
          <div className="max-h-[360px] overflow-y-auto py-1.5">
            {groups.map((group) => {
              const selected = group.key === activeKey;
              const busy = group.key === saving;
              return (
                <button
                  key={group.key}
                  type="button"
                  disabled={!payload || !!saving}
                  onClick={() => void activate(group)}
                  className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition ${
                    selected ? "bg-neutral-50" : "hover:bg-neutral-50/70"
                  } disabled:cursor-default disabled:opacity-60`}
                >
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${
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
                    <span className="block truncate text-[13px] font-medium text-neutral-900">
                      {busy ? tt("切换中…") : group.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-neutral-400">
                      {group.kind === "preset"
                        ? tt("平台只读组合")
                        : tt("我的自定义组合")}
                    </span>
                  </span>
                  {selected && (
                    <IconCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                  )}
                </button>
              );
            })}
          </div>
          {error && (
            <p className="border-t border-rose-100 bg-rose-50 px-3.5 py-2 text-[11px] text-rose-600">
              {tt(error)}
            </p>
          )}
          {!payload && !loading && !error && (
            <p className="border-t border-neutral-100 px-3.5 py-2 text-[11px] text-neutral-400">
              {tt("登录后可切换并使用自定义模型组合。")}
            </p>
          )}
          <a
            href={apiHref}
            className="block border-t border-neutral-100 px-3.5 py-2.5 text-[12px] font-medium text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900"
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
