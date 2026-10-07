"use client";

// 设置里「OceanLeo Bay」的资质审核：提交材料、看进度、被拒后申诉。按窄宽度排版。
// 医疗、法律、宠物医疗不出现。不收证件照片、身份证号。申诉不带正文。

import { useCallback, useEffect, useState } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import {
  BAY_VETTING_DOMAINS,
  BAY_VETTING_KIND_CHOICES,
  appealVettingDecision,
  canAppealDecision,
  fetchMyVetting,
  submitVetting,
  vettingExpiry,
  vettingSubmitProblem,
  type BayMyVetting,
  type BayVettingKind,
} from "../../../lib/bay/vetting";
import { INPUT_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerCard, SellerField, SellerNotice } from "./seller-ui";

const DOMAIN_LABEL: Record<string, string> = {
  tax: "税务",
  psych: "心理",
  edu_adult: "成人教育",
  career: "职业发展",
  research: "研究",
};

const KIND_LABEL: Record<BayVettingKind, string> = {
  practice_teaching: "教师资格",
  practice_medical: "医师执业信息",
  practice_legal: "律师执业信息",
  education: "学历验证报告",
};

const STATE_LABEL: Record<string, string> = {
  pending: "审核中",
  valid: "已通过",
  expired: "已过期",
  revoked: "已撤销",
};

const VERDICT_LABEL: Record<string, string> = {
  pass: "通过",
  reject: "未通过",
  manual: "人工复核中",
};

export function BayVettingSection() {
  const tt = useUI();
  const [mine, setMine] = useState<BayMyVetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [domain, setDomain] = useState<(typeof BAY_VETTING_DOMAINS)[number]>("tax");
  const [kind, setKind] = useState<BayVettingKind>("education");
  const [credentialNo, setCredentialNo] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void fetchMyVetting().then(
      (data) => {
        setMine(data);
        setLoading(false);
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : "");
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (busy) return;
    const problem = vettingSubmitProblem({ domain, kind, credential_no: credentialNo, source });
    if (problem === "id_number") {
      setError(tt("这里只收公开可查的执业或资格编号，不要填身份证号。"));
      return;
    }
    if (problem) {
      setError(tt("请把领域、种类、编号和查验来源都填上。"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitVetting({ domain, kind, credential_no: credentialNo, source });
      setCredentialNo("");
      setSource("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function appeal(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await appealVettingDecision(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section data-bay-vetting className="max-w-xl p-1 text-[13px] text-stone-500">{tt("正在加载…")}</section>;

  return (
    <section data-bay-vetting className="mx-auto w-full max-w-xl space-y-4">
      {error ? <SellerNotice tone="error">{tt(error)}</SellerNotice> : null}

      <SellerCard title={tt("提交核验")} hint={tt("只填公开可查的编号和查验来源。医疗、法律、宠物医疗这一期不开放。")}>
        <SellerField label={tt("领域")}>
          <select data-bay-field="domain" className={INPUT_CLASS} value={domain} onChange={(event) => setDomain(event.target.value as (typeof BAY_VETTING_DOMAINS)[number])}>
            {BAY_VETTING_DOMAINS.map((value) => (
              <option key={value} value={value}>
                {tt(DOMAIN_LABEL[value])}
              </option>
            ))}
          </select>
        </SellerField>
        <SellerField label={tt("凭证种类")}>
          <select data-bay-field="kind" className={INPUT_CLASS} value={kind} onChange={(event) => setKind(event.target.value as BayVettingKind)}>
            {BAY_VETTING_KIND_CHOICES.map((value) => (
              <option key={value} value={value}>
                {tt(KIND_LABEL[value])}
              </option>
            ))}
          </select>
        </SellerField>
        <SellerField label={tt("编号")}>
          <input data-bay-field="credential_no" className={INPUT_CLASS} value={credentialNo} maxLength={64} onChange={(event) => setCredentialNo(event.target.value)} />
        </SellerField>
        <SellerField label={tt("查验来源")} hint={tt("例如发证机关的公开查询入口")}>
          <input data-bay-field="source" className={INPUT_CLASS} value={source} maxLength={200} onChange={(event) => setSource(event.target.value)} />
        </SellerField>
        <button type="button" data-bay-submit-vetting disabled={busy} onClick={() => void submit()} className={PRIMARY_BUTTON}>
          {busy ? tt("提交中…") : tt("提交核验")}
        </button>
      </SellerCard>

      <SellerCard title={tt("进度")}>
        {(mine?.credentials.length || 0) === 0 ? <p className="text-[12.5px] text-stone-500">{tt("还没有提交过核验。")}</p> : null}
        <ul>
          {(mine?.credentials || []).map((row) => {
            const expiry = vettingExpiry(row.expires_at);
            return (
              <li key={row.id} data-bay-credential={row.id} className="border-b border-stone-100 py-2 text-[13px] text-stone-800">
                <span className="font-medium">{tt(DOMAIN_LABEL[row.domain] || row.domain)}</span>
                <span className="ml-2 text-stone-500">{tt(STATE_LABEL[row.state] || row.state)}</span>
                {expiry.kind === "future" ? <span className="ml-2 text-[12px] text-stone-500">{tt("{n} 天后到期", { n: expiry.days })}</span> : null}
                {expiry.kind === "today" ? <span className="ml-2 text-[12px] text-amber-700">{tt("今天到期")}</span> : null}
                {expiry.kind === "past" ? <span className="ml-2 text-[12px] text-rose-700">{tt("已过期 {n} 天", { n: expiry.days })}</span> : null}
              </li>
            );
          })}
        </ul>
      </SellerCard>

      {(mine?.decisions.length || 0) > 0 ? (
        <SellerCard title={tt("判定")}>
          <ul>
            {mine?.decisions.map((row) => (
              <li key={row.id} data-bay-decision={row.id} className="border-b border-stone-100 py-2 text-[13px] text-stone-800">
                <span className="font-medium">{tt(VERDICT_LABEL[row.verdict] || row.verdict)}</span>
                {row.reason_zh ? <span className="mt-0.5 block text-[12px] text-stone-500">{row.reason_zh}</span> : null}
                {canAppealDecision(row) ? (
                  <button type="button" data-bay-appeal={row.id} disabled={busy} onClick={() => void appeal(row.id)} className={`${SECONDARY_BUTTON} mt-2`}>
                    {tt("申诉")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </SellerCard>
      ) : null}
    </section>
  );
}
