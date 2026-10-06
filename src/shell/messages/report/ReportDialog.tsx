"use client";

// 举报消息 / 人 / 群（可同时拉黑）。契约 §4.7、§9.11。
// 平台只看被举报的内容和举报人自己看得到的前后几条消息；没被举报的聊天平台看不到。
// 对话框自己 portal 到 body 并盖过消息浮层（z-[1100]）：共用的 Modal 是 z-[1000]，会被浮层压在下面。

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../../i18n/ui/useUI";
import type { UITranslate } from "../../../i18n/ui/useUI";
import {
  REPORT_NOTE_LIMIT,
  REPORT_REASONS,
  classifyReportError,
  submitReport,
  type ReportFailure,
  type ReportInput,
  type ReportReason,
  type ReportResult,
} from "../../../lib/im/reports-api";

export interface ReportDialogProps {
  target: { kind: "message" | "user" | "conversation"; id: string; label?: string };
  onClose: () => void;
  /** 举报「人」时在哪个会话里遇到的（可选；用来取上下文）。 */
  conversationId?: string | null;
}

export function reasonLabel(tt: UITranslate, reason: ReportReason): string {
  switch (reason) {
    case "spam":
      return tt("垃圾信息或广告");
    case "harassment":
      return tt("骚扰、辱骂或威胁");
    case "fraud":
      return tt("欺诈或诱导站外交易");
    case "illegal":
      return tt("违法或侵权内容");
    default:
      return tt("其他");
  }
}

export function failureMessage(tt: UITranslate, failure: ReportFailure): string {
  switch (failure) {
    case "quota":
      return tt("今天提交的举报已达上限，请明天再试。");
    case "not_found":
      return tt("找不到举报的对象，它可能已被删除。");
    case "invalid":
      return tt("举报内容不符合要求，请检查后再试。");
    case "too_long":
      return tt("补充说明太长了，请精简一些。");
    case "network":
      return tt("网络不通，请稍后再试。");
    case "unauthorized":
      return tt("请先登录。");
    default:
      return tt("没提交成功，请稍后再试。");
  }
}

function titleOf(tt: UITranslate, kind: ReportDialogProps["target"]["kind"]): string {
  if (kind === "message") return tt("举报这条消息");
  if (kind === "user") return tt("举报这个人");
  return tt("举报这个会话");
}

export interface ReportFormProps extends ReportDialogProps {
  /** 测试注入；默认走网关。 */
  submit?: (input: ReportInput) => Promise<ReportResult>;
  initialReason?: ReportReason | null;
}

/** 表单本体：不依赖 DOM portal，服务端渲染与单测直接可用。 */
export function ReportForm({ target, onClose, conversationId, submit = submitReport, initialReason = null }: ReportFormProps) {
  const tt = useUI();
  const titleId = useId();
  const [reason, setReason] = useState<ReportReason | null>(initialReason);
  const [note, setNote] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ReportResult | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const canBlock = target.kind !== "conversation";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submit({
        target: { kind: target.kind, id: target.id },
        reason,
        note,
        alsoBlock: canBlock && alsoBlock,
        conversationId: conversationId ?? null,
      });
      if (alive.current) setDone(result);
    } catch (e) {
      if (alive.current) setError(failureMessage(tt, classifyReportError(e)));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  if (done) {
    return (
      <div data-report-done role="status" aria-labelledby={titleId} className="flex flex-col gap-3">
        <h2 id={titleId} className="text-[16px] font-semibold text-neutral-900">
          {tt("我们收到了你的举报")}
        </h2>
        <p className="text-[13px] leading-relaxed text-neutral-600">
          {tt("平台只会查看被举报的这部分内容，以及你能看到的前后几条消息，用来判断上下文。你们其他没被举报的聊天，平台看不到。")}
        </p>
        {done.blocked && (
          <p data-report-blocked className="text-[13px] text-neutral-600">
            {tt("对方已被你拉黑。")}
          </p>
        )}
        <p className="text-[13px] text-neutral-600">{tt("处理有结果时，会通过通知告诉你。")}</p>
        <div className="flex justify-end">
          <button
            type="button"
            data-action="close"
            onClick={onClose}
            className="rounded-lg bg-neutral-900 px-4 py-1.5 text-[13px] text-white hover:bg-neutral-800"
          >
            {tt("完成")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} data-report-form aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-[16px] font-semibold text-neutral-900">
        {titleOf(tt, target.kind)}
      </h2>
      {target.label ? (
        <p data-report-target className="truncate rounded-lg bg-neutral-50 px-3 py-2 text-[13px] text-neutral-700">
          {target.label}
        </p>
      ) : null}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1 text-[13px] font-medium text-neutral-800">{tt("举报原因")}</legend>
        {REPORT_REASONS.map((value) => (
          <label key={value} className="flex cursor-pointer items-center gap-2 text-[13px] text-neutral-800">
            <input
              type="radio"
              name="report-reason"
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
              data-report-reason={value}
            />
            <span>{reasonLabel(tt, value)}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-[13px] font-medium text-neutral-800">
        {tt("补充说明（选填）")}
        <textarea
          value={note}
          maxLength={REPORT_NOTE_LIMIT}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          data-report-note
          className="resize-none rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] font-normal text-neutral-800"
        />
      </label>
      {canBlock && (
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-neutral-800">
          <input
            type="checkbox"
            checked={alsoBlock}
            onChange={(event) => setAlsoBlock(event.target.checked)}
            data-report-block
          />
          <span>{tt("同时拉黑对方")}</span>
        </label>
      )}
      <p data-report-privacy className="text-[12px] leading-relaxed text-neutral-500">
        {tt("平台只会查看被举报的内容和你能看到的前后几条消息，不会查看你们其他的聊天。")}
      </p>
      {error && (
        <p role="alert" data-report-error className="text-[12px] text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          data-action="cancel"
          onClick={onClose}
          className="rounded-lg border border-neutral-200 px-4 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50"
        >
          {tt("取消")}
        </button>
        <button
          type="submit"
          data-action="submit"
          disabled={!reason || busy}
          className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? tt("提交中…") : tt("提交举报")}
        </button>
      </div>
    </form>
  );
}

export function ReportDialog(props: ReportDialogProps) {
  const { onClose } = props;
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.isComposing) {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [mounted, onClose]);

  if (!mounted) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      data-report-dialog
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 text-black shadow-2xl">
        <ReportForm {...props} />
      </div>
    </div>,
    document.body,
  );
}
