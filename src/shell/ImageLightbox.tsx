"use client";

// ============================================================================
// @oceanleo/ui — 首页 app 卡片「预览」大图 lightbox（合同 §0 第 7 条，2026-07-25）
// ----------------------------------------------------------------------------
// 点首页 app 卡片图上的「预览」→ 打开本 lightbox。内容固定四块：
//   ① 大图（assetPreviewUrl 拼 `<key>.webp`；无图回退 emoji tint，不留白）
//   ② app 名
//   ③ 代表 prompt 全文（长文自身滚动，弹窗外壳不滚）
//   ④ 三个按钮：「prompt」（灌进首页输入框）、「生成类似」（进操作台并预填 preset）、
//      「高级编辑」（进操作台并让右栏进该 app 默认产物类型的高级编辑器）
//
// 为什么不复用 `../ui` 的 <Modal>：Modal 走 createPortal(document.body)，首帧
// （SSR / 未 mount）什么都不渲染，而本组件要能在服务端与 node --test 里被静态渲染断言。
// 因此这里自带遮罩 + Esc 关闭 + 打开即聚焦，行为与 Modal 对齐。
// ============================================================================

import { useEffect, useRef, type ReactNode } from "react";
import { assetPreviewUrl } from "../lib/asset-thumb";
import { useUI } from "../i18n/ui/useUI";

export interface ImageLightboxProps {
  /** 标题（app 名）。 */
  title: string;
  /**
   * 素材 key（`"<category>/<slug>"`）或完整 http(s) URL。给 key 时用 assetPreviewUrl
   * 拼大图直链；不给则回退 `fallbackIcon` 的 tint 版式（不留白）。 */
  imageKey?: string;
  /** 无图时的回退图示（emoji / 单字）。 */
  fallbackIcon?: ReactNode;
  accent?: string;
  /** 代表 prompt 全文；为空 → 不渲染 prompt / 生成类似按钮（不得灌空串）。 */
  prompt?: string | null;
  /** 「prompt」按钮：把代表 prompt 灌进首页输入框。 */
  onUsePrompt?: (prompt: string) => void;
  /** 「生成类似」目标（W2 的 workspaceAppFillHref）。 */
  fillHref?: string;
  /** 「高级编辑」目标（W2 的 workspaceAppAdvancedHref）。 */
  advancedHref?: string;
  onClose: () => void;
}

export function ImageLightbox({
  title,
  imageKey,
  fallbackIcon,
  accent = "#4f46e5",
  prompt,
  onUsePrompt,
  fillHref,
  advancedHref,
  onClose,
}: ImageLightboxProps) {
  const tt = useUI();
  const closeRef = useRef<HTMLButtonElement>(null);
  const bigImage = imageKey ? assetPreviewUrl(imageKey) : "";
  const promptText = (prompt || "").trim();

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const actionClass =
    "rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition hover:opacity-90";

  return (
    <div
      data-image-lightbox
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-3">
          <h3 className="truncate text-[15px] font-semibold text-stone-900">{title}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={tt("关闭")}
            className="rounded-md px-2 py-1 text-[18px] leading-none text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div
            className="relative w-full overflow-hidden rounded-xl bg-stone-100"
            style={{ aspectRatio: "16 / 10" }}
          >
            {bigImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={bigImage}
                alt={title}
                className="h-full w-full object-cover"
              />
            ) : (
              <span
                className="grid h-full w-full place-items-center text-[48px]"
                style={{ background: `${accent}14`, color: accent }}
              >
                {fallbackIcon ?? "✨"}
              </span>
            )}
          </div>

          {/* 无代表 prompt 时整段不渲染：原先那句说明是未进 17 语词典的中文串（V1-verdict R1），
              而 i18n 词典是 W3 独占目录；此处「没有 prompt 段 + 只剩高级编辑按钮」本身已自解释。 */}
          {promptText ? (
            <>
              <p className="mt-4 text-[12px] font-medium text-stone-400">{tt("代表 prompt")}</p>
              <pre className="mt-1.5 max-h-[34vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3 font-sans text-[13px] leading-relaxed text-stone-700">
                {promptText}
              </pre>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 px-5 py-3">
          {promptText && onUsePrompt && (
            <button
              type="button"
              onClick={() => onUsePrompt(promptText)}
              className={`${actionClass} text-white`}
              style={{ background: accent }}
            >
              {tt("prompt")}
            </button>
          )}
          {promptText && fillHref && (
            <a href={fillHref} className={`${actionClass} border border-stone-200 text-stone-700 hover:bg-stone-50`}>
              {tt("生成类似")}
            </a>
          )}
          {advancedHref && (
            <a href={advancedHref} className={`${actionClass} border border-stone-200 text-stone-700 hover:bg-stone-50`}>
              {tt("高级编辑")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
