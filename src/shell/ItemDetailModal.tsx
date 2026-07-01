"use client";

// ============================================================================
// @oceanleo/ui — 卡片详情弹窗 ItemDetailModal（doctrine v11，2026-06-26）
// ----------------------------------------------------------------------------
// 操作员要求（WorkBuddy 截图 506c2cd6）：playground 里点一张卡片，应当**先弹一个
// 详情弹窗**展示这个 app/agent/组织/工作流的介绍、擅长领域、示例 prompt，再由用户点
// 「召唤 / 试玩」进入内嵌功能区 / 编辑器，而不是直接跳进去。
//
// 版式照 WorkBuddy：
//   头部：大图标 + 名字 + 标签（分类/类型）+ 副标题；右上角 ✕。
//   能力介绍：capabilities / tagline。
//   擅长领域：tags chips（可选）。
//   试试这样问我：examples 卡片（点了 → onLaunch(example) 带着这句直接进入）。
//   底部：整宽深色「召唤」按钮 → onLaunch()。
// 复用 ui/Modal（与节点 prompt 弹窗同一遮罩体系）。
// ============================================================================

import { Modal } from "../ui";
import { useUI } from "../i18n/ui/useUI";

export interface ItemDetailModalProps {
  open: boolean;
  onClose: () => void;
  name: string;
  icon?: React.ReactNode;
  tagline?: string;
  /** 能力介绍正文。 */
  capabilities?: string;
  /** 头部标签（分类、类型……）。 */
  tags?: string[];
  /** 擅长领域 chips。 */
  strengths?: string[];
  /** 「试试这样问我」示例：点了带着这句进入。 */
  examples?: string[];
  /** 召唤按钮文案，如「召唤」「试玩」「打开」。 */
  launchLabel?: string;
  /** 副标题第二个标签来源（如站名）。 */
  source?: string;
  accent?: string;
  /** 进入功能区 / 编辑器。带 example 时表示用户点了某条示例 prompt。 */
  onLaunch: (example?: string) => void;
}

export function ItemDetailModal({
  open,
  onClose,
  name,
  icon,
  tagline,
  capabilities,
  tags = [],
  strengths = [],
  examples = [],
  launchLabel,
  source,
  accent = "#0ea5e9",
  onLaunch,
}: ItemDetailModalProps) {
  const tt = useUI();
  if (!open) return null;
  const launch = launchLabel ?? tt("召唤");
  const allTags = [...(source ? [source] : []), ...tags].filter(Boolean);
  return (
    <Modal onClose={onClose} className="max-w-xl">
      {/* 头部 */}
      <div className="flex items-start gap-3.5 px-6 pt-6">
        <span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl text-white shadow-sm"
          style={{ background: accent }}
        >
          {icon || "✦"}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="truncate text-[20px] font-bold text-stone-900">{name}</h2>
          {allTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {allTags.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
          title={tt("关闭")}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="space-y-5 px-6 py-5">
        {(capabilities || tagline) && (
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-stone-700">{tt("能力介绍")}</p>
            <p className="text-[13px] leading-relaxed text-stone-600">
              {capabilities || tagline}
            </p>
          </div>
        )}

        {strengths.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-stone-700">{tt("擅长领域")}</p>
            <div className="flex flex-wrap gap-2">
              {strengths.map((s) => (
                <span
                  key={s}
                  className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-600"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {examples.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-stone-700">{tt("试试这样问我")}</p>
            <div className="space-y-2">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => onLaunch(ex)}
                  className="group flex w-full items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/60 px-3.5 py-3 text-left text-[13px] leading-relaxed text-stone-600 transition hover:border-stone-300 hover:bg-white"
                >
                  <span className="min-w-0 flex-1">{ex}</span>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部召唤键（整宽深色，照 WorkBuddy） */}
      <div className="border-t border-stone-100 px-6 py-4">
        <button
          type="button"
          onClick={() => onLaunch()}
          className="w-full rounded-xl bg-stone-900 px-4 py-3 text-[14px] font-semibold text-white shadow-sm transition hover:bg-stone-800 active:scale-[0.99]"
        >
          {launch} {name}
        </button>
      </div>
    </Modal>
  );
}
