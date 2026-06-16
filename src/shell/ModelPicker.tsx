"use client";

// ============================================================================
// @oceanleo/ui — 统一模型选择器（单一事实源）
// ----------------------------------------------------------------------------
// 布局（= 操作员 2026-06-16 指定）：
//   左：固定标签「模型选择」
//   右：各模态入口横排 —— 文本 / 图片 / 视频 / 3D / 音频（按各站 categories）。
//       每个模态是一个 chip：点开 → 下方弹出该模态的模型列表（风格与下拉一致）。
//       **不设默认模型**：未选时只显示模态名；选中后模态名后面跟所选模型名。
//   每个模态各自独立选择（修掉「不同模态只能选一个」的旧 bug）。
//
// 持久化：按「站点 × 用户」记住每个模态的选择（localStorage）。各 oceanleo 站
// 的 categories 可不同，选择互不干扰、各自记住。
//
// 数据来源：getSelectedModelsByCategory(cat)（用户在「账户 → API」页选好的该模态
// 模型；未登录/无选择时返回该模态兜底单项，仅用于「可选项」，不自动选中）。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSelectedModelsByCategory,
  type PreferredModel,
} from "../lib/auth/account";
import { getUserId } from "../lib/auth/client";
import { IconCategory, IconCheck, IconChevronDown } from "./icons";

export type ModelCategory = "text" | "image" | "video" | "threed" | "audio";

const CATEGORY_LABEL: Record<ModelCategory, string> = {
  text: "文本",
  image: "图片",
  video: "视频",
  threed: "3D",
  audio: "音频",
};

export interface ModelPickerProps {
  /** 本站需要的模态（按顺序展示）。如 image 站传 ["image"]，主站传全部。 */
  categories: ModelCategory[];
  /** 站点标识（用于「站点 × 用户」持久化 key）。强烈建议传，缺省用 "default"。 */
  siteId?: string;
  /** 某模态选中变化的回调：参数是 (模态, 选中的模型)。 */
  onChange?: (category: ModelCategory, model: PreferredModel) => void;
  /** 整体选择变化的回调：参数是 {模态: 模型} 的全量映射（已选的）。 */
  onSelectionChange?: (selection: Partial<Record<ModelCategory, PreferredModel>>) => void;
  /** API 管理页路由（默认 /api）。下拉底部「管理模型」跳转。 */
  apiHref?: string;
  className?: string;
}

const STORE_PREFIX = "oceanleo_model_pick_v2";

function storeKey(siteId: string, userId: string) {
  return `${STORE_PREFIX}:${siteId}:${userId}`;
}

function readStore(siteId: string, userId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storeKey(siteId, userId));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeStore(siteId: string, userId: string, sel: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storeKey(siteId, userId), JSON.stringify(sel));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function ModelPicker({
  categories,
  siteId = "default",
  onChange,
  onSelectionChange,
  apiHref = "/api",
  className = "",
}: ModelPickerProps) {
  // 每个模态的可选模型列表
  const [options, setOptions] = useState<Record<string, PreferredModel[]>>({});
  // 每个模态当前选中的复合 key（未选 = 不在表里）
  const [picked, setPicked] = useState<Record<string, string>>({});
  // 当前展开的模态（null = 都收起）
  const [openCat, setOpenCat] = useState<ModelCategory | null>(null);
  const [userId, setUserId] = useState<string>("anon");
  const rootRef = useRef<HTMLDivElement>(null);

  // 取用户 id（用于「站点 × 用户」持久化）。未登录用 "anon"。
  useEffect(() => {
    let alive = true;
    getUserId().then((id) => {
      if (alive) setUserId(id || "anon");
    });
    return () => {
      alive = false;
    };
  }, []);

  // 拉取每个模态的可选模型
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
      setOptions(next);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.join(",")]);

  // 载入持久化的选择（按 站点 × 用户）。注意：不设默认，未存过就保持未选。
  useEffect(() => {
    setPicked(readStore(siteId, userId));
  }, [siteId, userId]);

  const emitSelection = useCallback(
    (sel: Record<string, string>) => {
      if (!onSelectionChange) return;
      const out: Partial<Record<ModelCategory, PreferredModel>> = {};
      for (const c of categories) {
        const key = sel[c];
        const m = (options[c] || []).find((x) => x.key === key);
        if (m) out[c] = m;
      }
      onSelectionChange(out);
    },
    [categories, options, onSelectionChange],
  );

  // 选项就绪 / 选择变化时，向外广播一次全量已选映射
  useEffect(() => {
    emitSelection(picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, options]);

  // 点外面 / Esc 关闭
  useEffect(() => {
    if (!openCat) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenCat(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenCat(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openCat]);

  function pick(cat: ModelCategory, m: PreferredModel) {
    const next = { ...picked, [cat]: m.key };
    setPicked(next);
    writeStore(siteId, userId, next);
    onChange?.(cat, m);
    setOpenCat(null);
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 ${className}`} ref={rootRef}>
      <span className="text-[13px] font-medium text-neutral-500">模型选择</span>

      {categories.map((cat) => {
        const list = options[cat] || [];
        const sel = list.find((m) => m.key === picked[cat]) || null;
        const isOpen = openCat === cat;
        return (
          <div key={cat} className="relative">
            <button
              type="button"
              onClick={() => setOpenCat(isOpen ? null : cat)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] transition ${
                isOpen
                  ? "border-neutral-300 bg-neutral-50"
                  : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
              }`}
            >
              <span className="text-neutral-400">
                <IconCategory category={cat} className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium text-neutral-700">{CATEGORY_LABEL[cat]}</span>
              {sel ? (
                <span className="max-w-[160px] truncate text-neutral-900">· {sel.label}</span>
              ) : (
                <span className="text-neutral-400">未选</span>
              )}
              <span className={`text-neutral-400 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}>
                <IconChevronDown className="h-3.5 w-3.5" />
              </span>
            </button>

            {isOpen && (
              <div className="v-scale-in absolute left-0 top-full z-30 mt-1 max-h-[360px] w-72 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg">
                <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-2 text-[11px] font-medium text-neutral-400">
                  <IconCategory category={cat} className="h-3.5 w-3.5" />
                  {CATEGORY_LABEL[cat]}模型
                </div>
                {list.length === 0 ? (
                  <p className="px-3.5 py-6 text-center text-[12px] text-neutral-400">
                    暂无可选模型，去 API 页选择
                  </p>
                ) : (
                  list.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => pick(cat, m)}
                      className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition hover:bg-neutral-50 ${
                        m.key === picked[cat] ? "bg-neutral-50" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-neutral-900">{m.label}</p>
                        <p className="mt-0.5 text-[11px] text-neutral-500">{m.provider_label}</p>
                      </span>
                      {m.key === picked[cat] && (
                        <IconCheck className="h-4 w-4 shrink-0 text-neutral-900" />
                      )}
                    </button>
                  ))
                )}
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
      })}
    </div>
  );
}
