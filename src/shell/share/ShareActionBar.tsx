"use client";

// ============================================================================
// @oceanleo/ui — 选段模式的底部操作条
// ----------------------------------------------------------------------------
// 进入选段模式后，**输入框整块**换成这一条（对标 Kimi）；`取消` 退回普通模式。
// 它是临时页面模式的一部分，不是常驻工具栏——普通模式下这个组件根本不渲染。
// ============================================================================

import type { ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { ShareModeState } from "./useShareMode";

function Spinner() {
  return <span className="v-spinner" aria-hidden="true" />;
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
  busy,
  primary,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 ${
        primary
          ? "bg-stone-900 text-white hover:bg-stone-800"
          : "border border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
      }`}
    >
      {busy ? <Spinner /> : icon}
      <span>{label}</span>
    </button>
  );
}

const iconClass = "h-4 w-4 shrink-0";

export function ShareActionBar({ share }: { share: ShareModeState }) {
  const tt = useUI();
  const empty = share.selectedCount === 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[12px] text-stone-500">
          {empty
            ? tt("勾选要分享的消息")
            : tt("已选 {count} 条", { count: share.selectedCount })}
        </span>
        {share.notice && (
          <span
            role="status"
            className={`truncate text-[12px] ${
              share.notice.tone === "ok" ? "text-emerald-600" : "text-rose-500"
            }`}
          >
            {share.notice.text}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white/90 p-2 shadow-sm">
        <ActionButton
          label={share.allSelected ? tt("取消全选") : tt("全选")}
          onClick={share.toggleAll}
          icon={
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <ActionButton
          label={tt("复制文本")}
          onClick={() => void share.copyText()}
          disabled={empty}
          busy={share.busy === "copyText"}
          icon={
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5a2 2 0 012-2h10" strokeLinecap="round" />
            </svg>
          }
        />
        <ActionButton
          label={tt("复制链接")}
          onClick={() => void share.copyLink()}
          disabled={empty}
          busy={share.busy === "copyLink"}
          icon={
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 13a5 5 0 007.5.5l2-2a5 5 0 00-7-7l-1 1" strokeLinecap="round" />
              <path d="M14 11a5 5 0 00-7.5-.5l-2 2a5 5 0 007 7l1-1" strokeLinecap="round" />
            </svg>
          }
        />
        <ActionButton
          label={tt("生成长图")}
          onClick={() => void share.generateImage()}
          disabled={empty}
          busy={share.busy === "image"}
          primary
          icon={
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5-9 9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <ActionButton
          label={tt("生成文档")}
          onClick={() => void share.generateDocument()}
          disabled={empty}
          busy={share.busy === "document"}
          icon={
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
              <path d="M14 3v4h4M9 13h6M9 17h4" strokeLinecap="round" />
            </svg>
          }
        />
        <span className="ml-auto" />
        <ActionButton
          label={tt("取消")}
          onClick={share.exit}
          icon={
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

/** 消息左侧的圆形勾选框（只在选段模式下出现）。 */
export function ShareCheckbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition active:scale-90 ${
        checked
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-300 bg-white text-transparent hover:border-stone-400"
      }`}
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M5 12l4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** 顶部「分享」入口图标：点它整页进入选段模式。 */
export function ShareEntryButton({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  const tt = useUI();
  return (
    <button
      type="button"
      onClick={onClick}
      title={tt("分享")}
      aria-label={tt("分享")}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-stone-600 transition hover:bg-stone-50 active:scale-95 ${className}`}
    >
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round" />
      </svg>
      <span>{tt("分享")}</span>
    </button>
  );
}
