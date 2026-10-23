"use client";

// 一件案件：收起时一行（对象种类 · 来源、标题、状态），展开后是详情（状态解释、通知人 / 作品说明 / 涉及地址、原因、
// 平台说明、已提交的反通知 / 申诉）和能做的那张表单。通知人的联系方式后端根本不给，这里也不会有。
import { useId, type ReactElement } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import {
  canAppeal,
  canCounterNotice,
  formatCaseTime,
  needsAction,
  type OwnerCase,
} from "../../../lib/moderation/case-model";
import { AppealForm, CounterNoticeForm } from "./case-forms";
import { kindLabel, reasonLabel, sourceLabel, statusLabel, statusNote } from "./case-labels";

export interface CaseCardProps {
  row: OwnerCase;
  open: boolean;
  onToggle: () => void;
  /** 提交成功后：把服务端回的案件换进列表并重取。 */
  onDone: (updated: OwnerCase | null) => void | Promise<void>;
}

type Tone = "bad" | "warn" | "ok" | "neutral";

function toneOf(row: OwnerCase): Tone {
  switch (row.status) {
    case "taken_down":
      return "bad";
    case "awaiting_counter":
      return "warn";
    case "restored":
    case "dismissed":
      return "ok";
    case "executed":
      return "neutral";
    default:
      return row.hidden ? "bad" : "neutral";
  }
}

const DOT_CLASS: Record<Tone, string> = {
  bad: "bg-rose-500",
  warn: "bg-amber-500",
  ok: "bg-emerald-500",
  neutral: "bg-neutral-400",
};

function Chevron({ open }: { open: boolean }): ReactElement {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`mt-1 shrink-0 text-neutral-400 transition-transform duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${open ? "rotate-180" : ""}`}
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

export function CaseCard({ row, open, onToggle, onDone }: CaseCardProps): ReactElement {
  const tt = useUI();
  const locale = useLocale();
  const panelId = useId();
  const actionable = needsAction(row);
  // 第一行：种类 · 来源 · 提出日期（后端给了 created_at 才有日期；缺哪项就少哪项）
  const meta = [kindLabel(tt, row.target_kind), sourceLabel(tt, row.source), formatCaseTime(row.created_at, locale)]
    .filter(Boolean)
    .join(" · ");
  const title = row.title || tt("未命名内容");
  const note = open ? statusNote(tt, row, locale) : "";
  const reason = open ? reasonLabel(tt, row.reason) : "";
  const urls = row.notice.location_urls;
  const counterAt = formatCaseTime(row.counter_notice_at, locale);
  const appealAt = formatCaseTime(row.appeal_at, locale);

  return (
    <article
      data-case-id={row.id}
      data-case-status={row.status}
      data-case-open={open ? "true" : "false"}
      className="rounded-xl border border-neutral-200 bg-white"
    >
      <button
        type="button"
        data-case-toggle
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span data-case-meta className="block truncate text-[12px] text-neutral-400">
            {meta}
          </span>
          <span className="mt-0.5 block truncate text-[14px] font-semibold text-neutral-900">{title}</span>
          <span className="mt-1 flex items-center gap-1.5 text-[12.5px] text-neutral-600">
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASS[toneOf(row)]}`} />
            <span data-case-status-label>{statusLabel(tt, row)}</span>
          </span>
        </span>
        {actionable ? (
          <span
            data-case-needs-action
            className="mt-0.5 shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
          >
            {tt("需要你处理")}
          </span>
        ) : null}
        <Chevron open={open} />
      </button>
      {open ? (
        <div id={panelId} data-case-panel className="space-y-3 border-t border-neutral-100 px-4 py-3">
          {note ? <p className="text-[13px] leading-5 text-neutral-700">{note}</p> : null}
          {row.notice.claimant_name || row.notice.work_description || urls.length > 0 ? (
            <div className="space-y-1 break-words text-[13px] leading-5 text-neutral-700">
              {row.notice.claimant_name ? (
                <p>
                  {tt("通知人：")}
                  {row.notice.claimant_name}
                </p>
              ) : null}
              {row.notice.work_description ? (
                <p className="whitespace-pre-wrap">
                  {tt("作品说明：")}
                  {row.notice.work_description}
                </p>
              ) : null}
              {urls.length > 0 ? (
                <div>
                  <p>{tt("涉及地址：")}</p>
                  <ul className="mt-0.5 space-y-0.5 break-all text-neutral-600">
                    {urls.map((url) => (
                      <li key={url}>{url}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          {reason || row.decision_note ? (
            <div className="space-y-1 break-words text-[13px] leading-5 text-neutral-700">
              {reason ? <p data-case-reason>{tt("原因：{reason}", { reason })}</p> : null}
              {row.decision_note ? <p data-case-decision>{tt("平台说明：{note}", { note: row.decision_note })}</p> : null}
            </div>
          ) : null}
          {counterAt ? (
            <p
              role="status"
              data-case-submitted="counter"
              className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] leading-5 text-emerald-900"
            >
              {tt("你已于 {date} 提交反通知。", { date: counterAt })}
            </p>
          ) : null}
          {appealAt ? (
            <p
              role="status"
              data-case-submitted="appeal"
              className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] leading-5 text-emerald-900"
            >
              {tt("你已于 {date} 提交申诉，平台复核后会更新这里的状态。", { date: appealAt })}
            </p>
          ) : null}
          {canCounterNotice(row) ? <CounterNoticeForm caseId={row.id} onDone={onDone} /> : null}
          {canAppeal(row) ? <AppealForm caseId={row.id} onDone={onDone} /> : null}
        </div>
      ) : null}
    </article>
  );
}
