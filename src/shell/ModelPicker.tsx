"use client";

// ============================================================================
// @oceanleo/ui — 统一模型选择器（单一事实源）
// ----------------------------------------------------------------------------
// 这是「右上模型选择」的唯一实现。全家桶任何站都用它，行为一致：
//   - 按 `categories` 拉取用户在「账户 → API」页选好的多类目模型
//     （text 文本 / image 图片 / video 视频 / threed 3D / audio 语音）
//   - 多类目时分组显示（带类目标题图标），单类目时平铺
//   - 选中项通过 onChange 回调驱动各站本次生成调用
//   - 未登录 / 无选择 / 拉取失败 → 回落到该类目兜底模型（来自 account.ts）
//
// 之前的 bug：主站只取 text 一类（getSelectedTextModels 写死 g.id==="text"），
// 子站则根本没有模型选择器。本组件用 getSelectedModelsByCategory(cat) 按需取
// 任意类目，一举解决「只有 LLM」与「子站没有模型选择」两个问题。
// ============================================================================

import { useEffect, useRef, useState } from "react";
import {
  getSelectedModelsByCategory,
  type PreferredModel,
} from "../lib/auth/account";
import { IconCategory, IconCheck, IconChevronDown } from "./icons";

export type ModelCategory = "text" | "image" | "video" | "threed" | "audio";

const CATEGORY_LABEL: Record<ModelCategory, string> = {
  text: "文本",
  image: "图片",
  video: "视频",
  threed: "3D",
  audio: "语音",
};

export interface ModelPickerProps {
  /** 本站需要的模型类目（按顺序展示）。如 image 站传 ["image"]，主站传全部。 */
  categories: ModelCategory[];
  /** 受控：当前选中的复合 key "<provider>:<model>"。不传则内部自管。 */
  value?: string;
  /** 选中变化回调，参数是完整的 PreferredModel，方便各站直接拿去调网关。 */
  onChange?: (model: PreferredModel) => void;
  /** API 管理页路由（默认 /api）。点击下拉底部「管理模型」跳转。 */
  apiHref?: string;
  className?: string;
}

export function ModelPicker({
  categories,
  value,
  onChange,
  apiHref = "/api",
  className = "",
}: ModelPickerProps) {
  // grouped[catId] = 该类目下用户已选模型
  const [grouped, setGrouped] = useState<Record<string, PreferredModel[]>>({});
  const [open, setOpen] = useState(false);
  const [innerKey, setInnerKey] = useState<string | undefined>(value);
  const ref = useRef<HTMLDivElement>(null);

  const selectedKey = value ?? innerKey;

  // 拉取每个类目的已选模型
  useEffect(() => {
    let alive = true;
    Promise.all(
      categories.map((c) =>
        getSelectedModelsByCategory(c).then((list) => [c, list] as const),
      ),
    ).then((pairs) => {
      if (!alive) return;
      const next: Record<string, PreferredModel[]> = {};
      for (const [c, list] of pairs) next[c] = list;
      setGrouped(next);
      // 默认选中第一个类目的第一个模型
      const first = pairs.flatMap(([, list]) => list)[0];
      if (first && selectedKey == null) {
        setInnerKey(first.key);
        onChange?.(first);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.join(",")]);

  // 外部 value 变化时同步
  useEffect(() => {
    if (value != null) setInnerKey(value);
  }, [value]);

  // 点外面 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const allModels = categories.flatMap((c) => grouped[c] || []);
  const active = allModels.find((m) => m.key === selectedKey) || allModels[0];
  const multiCat = categories.length > 1;

  function pick(m: PreferredModel) {
    setInnerKey(m.key);
    onChange?.(m);
    setOpen(false);
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-neutral-800 transition hover:bg-neutral-100"
      >
        {active?.label || "选择模型"}
        <span className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
          <IconChevronDown />
        </span>
      </button>
      {open && (
        <div className="v-scale-in absolute left-0 top-full z-30 mt-1 max-h-[360px] w-72 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg">
          {categories.map((cat) => {
            const list = grouped[cat] || [];
            if (list.length === 0) return null;
            return (
              <div key={cat}>
                {multiCat && (
                  <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-2 text-[11px] font-medium text-neutral-400">
                    <IconCategory category={cat} className="h-3.5 w-3.5" />
                    {CATEGORY_LABEL[cat]}
                  </div>
                )}
                {list.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => pick(m)}
                    className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition hover:bg-neutral-50 ${
                      m.key === selectedKey ? "bg-neutral-50" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-neutral-900">{m.label}</p>
                      <p className="mt-0.5 text-[11px] text-neutral-500">{m.provider_label}</p>
                    </span>
                    {m.key === selectedKey && (
                      <IconCheck className="h-4 w-4 shrink-0 text-neutral-900" />
                    )}
                  </button>
                ))}
              </div>
            );
          })}
          <a
            href={apiHref}
            className="mt-1 block border-t border-neutral-100 px-3.5 py-2.5 text-[12px] text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-800"
          >
            + 在「API」页管理模型
          </a>
        </div>
      )}
    </div>
  );
}
