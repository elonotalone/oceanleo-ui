"use client";

// 反通知表单（版权、商标、肖像类）与申诉表单（违法、平台规则类）。
// 从门户旧面板 `content-cases-panel.tsx` 的 CounterForm / AppealForm 搬来：字段、必填、提交路径不变，
// 加了：逐项标红、说明文字、提交失败按类别给话、`submit` 可注入（测试不用起网关）。
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  EMAIL_LIMIT,
  EMPTY_COUNTER_DRAFT,
  SIGNATURE_LIMIT,
  STATEMENT_LIMIT,
  appealBody,
  appealMissing,
  counterNoticeBody,
  counterNoticeMissing,
  type AppealBody,
  type CounterNoticeBody,
  type CounterNoticeField,
  type OwnerCase,
} from "../../../lib/moderation/case-model";
import { classifyModerationError, submitAppeal, submitCounterNotice } from "../../../lib/moderation/client";
import { failureMessage } from "./case-labels";

const FIELD_CLASS =
  "mt-1 block w-full rounded-lg border bg-white px-2.5 py-1.5 text-[13px] font-normal text-neutral-800";
const FIELD_OK = "border-neutral-200";
const FIELD_BAD = "border-red-300";
const SUBMIT_CLASS =
  "rounded-lg bg-neutral-900 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-40";

export interface CaseFormProps<Body> {
  caseId: string;
  /** 提交成功：带上服务端回的更新后案件（认不出时 null）；调用方负责换进列表并重取。 */
  onDone: (updated: OwnerCase | null) => void | Promise<void>;
  /** 测试注入；默认走网关。 */
  submit?: (caseId: string, body: Body) => Promise<OwnerCase | null>;
}

/** 表单卸载后（提交成功会让它退场）不再写状态。 */
function useAlive() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}

export function CounterNoticeForm({ caseId, onDone, submit = submitCounterNotice }: CaseFormProps<CounterNoticeBody>) {
  const tt = useUI();
  const alive = useAlive();
  const [draft, setDraft] = useState<CounterNoticeBody>(EMPTY_COUNTER_DRAFT);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const missing = attempted ? counterNoticeMissing(draft) : [];
  const bad = (field: CounterNoticeField) => missing.includes(field);
  // 没填完整的提示随输入实时消失；网关 / 网络的失败话单独存。
  const shown = missing.length > 0 ? tt("请填完整反通知：陈述、联系邮箱、两条声明、签名") : error;
  const set = <K extends CounterNoticeField>(field: K, value: CounterNoticeBody[K]) =>
    setDraft((prev) => ({ ...prev, [field]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (counterNoticeMissing(draft).length > 0) {
      setAttempted(true);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await submit(caseId, counterNoticeBody(draft));
      await onDone(updated);
    } catch (err: unknown) {
      if (alive.current) setError(failureMessage(tt, classifyModerationError(err), "counter"));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <form
      noValidate
      data-case-form="counter"
      onSubmit={onSubmit}
      className="space-y-3 border-t border-neutral-100 pt-4"
    >
      <p className="text-[13px] font-medium text-neutral-800">{tt("提交反通知")}</p>
      <p className="text-[12px] leading-5 text-neutral-500">
        {tt("提交后内容进入「反通知中」。15 个自然日内平台没有进一步维持下架，内容会自动恢复。")}
      </p>
      <label className="block text-[13px] text-neutral-800">
        {tt("陈述")}
        <textarea
          name="statement"
          rows={3}
          maxLength={STATEMENT_LIMIT}
          aria-invalid={bad("statement")}
          className={`${FIELD_CLASS} resize-y ${bad("statement") ? FIELD_BAD : FIELD_OK}`}
          value={draft.statement}
          onChange={(event) => set("statement", event.target.value)}
        />
      </label>
      <label className="block text-[13px] text-neutral-800">
        {tt("联系邮箱")}
        <input
          name="contact_email"
          type="email"
          autoComplete="email"
          maxLength={EMAIL_LIMIT}
          aria-invalid={bad("contact_email")}
          className={`${FIELD_CLASS} ${bad("contact_email") ? FIELD_BAD : FIELD_OK}`}
          value={draft.contact_email}
          onChange={(event) => set("contact_email", event.target.value)}
        />
      </label>
      <label className="flex items-start gap-2 text-[13px] text-neutral-800">
        <input
          name="good_faith"
          type="checkbox"
          className="mt-1"
          aria-invalid={bad("good_faith")}
          checked={draft.good_faith}
          onChange={(event) => set("good_faith", event.target.checked)}
        />
        <span className={bad("good_faith") ? "text-red-600" : undefined}>{tt("我善意相信这次下架不成立。")}</span>
      </label>
      <label className="flex items-start gap-2 text-[13px] text-neutral-800">
        <input
          name="consent_jurisdiction"
          type="checkbox"
          className="mt-1"
          aria-invalid={bad("consent_jurisdiction")}
          checked={draft.consent_jurisdiction}
          onChange={(event) => set("consent_jurisdiction", event.target.checked)}
        />
        <span className={bad("consent_jurisdiction") ? "text-red-600" : undefined}>
          {tt("我同意由本平台所在地处理与本次反通知有关的争议。")}
        </span>
      </label>
      <label className="block text-[13px] text-neutral-800">
        {tt("签名")}
        <input
          name="signature"
          maxLength={SIGNATURE_LIMIT}
          aria-invalid={bad("signature")}
          className={`${FIELD_CLASS} ${bad("signature") ? FIELD_BAD : FIELD_OK}`}
          value={draft.signature}
          onChange={(event) => set("signature", event.target.value)}
        />
      </label>
      {shown ? (
        <p role="alert" data-case-error className="text-[12.5px] text-red-600">
          {shown}
        </p>
      ) : null}
      <button type="submit" disabled={busy} data-case-submit className={SUBMIT_CLASS}>
        {busy ? tt("提交中…") : tt("提交反通知")}
      </button>
    </form>
  );
}

export function AppealForm({ caseId, onDone, submit = submitAppeal }: CaseFormProps<AppealBody>) {
  const tt = useUI();
  const alive = useAlive();
  const [statement, setStatement] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bad = attempted && appealMissing({ statement }).length > 0;
  const shown = bad ? tt("请填写申诉陈述") : error;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (appealMissing({ statement }).length > 0) {
      setAttempted(true);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await submit(caseId, appealBody({ statement }));
      await onDone(updated);
    } catch (err: unknown) {
      if (alive.current) setError(failureMessage(tt, classifyModerationError(err), "appeal"));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <form
      noValidate
      data-case-form="appeal"
      onSubmit={onSubmit}
      className="space-y-3 border-t border-neutral-100 pt-4"
    >
      <p className="text-[13px] font-medium text-neutral-800">{tt("提交申诉")}</p>
      <p className="text-[12px] leading-5 text-neutral-500">{tt("写清为什么你认为这次处置不对，平台会重新复核。")}</p>
      <label className="block text-[13px] text-neutral-800">
        {tt("陈述")}
        <textarea
          name="statement"
          rows={3}
          maxLength={STATEMENT_LIMIT}
          aria-invalid={bad}
          className={`${FIELD_CLASS} resize-y ${bad ? FIELD_BAD : FIELD_OK}`}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
        />
      </label>
      {shown ? (
        <p role="alert" data-case-error className="text-[12.5px] text-red-600">
          {shown}
        </p>
      ) : null}
      <button type="submit" disabled={busy} data-case-submit className={SUBMIT_CLASS}>
        {busy ? tt("提交中…") : tt("提交申诉")}
      </button>
    </form>
  );
}
