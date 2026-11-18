"use client";

import { useEffect, useRef, useState } from "react";
import { OrgApiError, listOrgTransfers, topupOrg, transferOrgCredit, orgApiCode, orgErrorCopy, type OrgDetail, type OrgSummary, type OrgTransfer, type OrgTransferBody, type OrgTransferDirection } from "../../lib/org-api";
import { formatMinor } from "../../lib/money";
import { useUI } from "../../i18n/ui/useUI";
import { limitInput } from "./OrgLimits";

export function transferAmount(text: string): number | undefined {
  const value = limitInput(text);
  return typeof value === "number" && value > 0 ? value : undefined;
}
export function ownedTransferTeams(orgs: OrgSummary[], currentId: string): OrgSummary[] {
  return orgs.filter((org) => org.id !== currentId && org.role === "owner");
}

export function OrgWallet({ org, orgs, onChanged, topupOpen = false, onTopupClose }: {
  org: OrgDetail; orgs: OrgSummary[]; onChanged: () => void | Promise<void>;
  topupOpen?: boolean; onTopupClose?: () => void;
}) {
  const tt = useUI();
  const [direction, setDirection] = useState<OrgTransferDirection>("personal_to_team");
  const [amount, setAmount] = useState("");
  const [toOrgId, setToOrgId] = useState("");
  const [history, setHistory] = useState<OrgTransfer[] | null>(null);
  const [transferable, setTransferable] = useState<number | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const attempt = useRef<OrgTransferBody | null>(null);
  const sending = useRef(false);
  const [retry, setRetry] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [payerNote, setPayerNote] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [topupMessage, setTopupMessage] = useState("");
  const [topupError, setTopupError] = useState("");
  const teams = ownedTransferTeams(orgs, org.id);
  const input = "rounded-lg border border-neutral-200 px-3 py-2 text-[13px]";
  const button = "rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] disabled:opacity-50";
  async function loadHistory() {
    try { const list = await listOrgTransfers(org.id); setHistory(list.transfers); setTransferable(list.personalTransferableMinor); setHistoryError(""); }
    catch (e) { setHistoryError(orgErrorCopy(orgApiCode(e), tt)); }
  }
  useEffect(() => {
    let cancelled = false;
    void listOrgTransfers(org.id).then((list) => { if (!cancelled) { setHistory(list.transfers); setTransferable(list.personalTransferableMinor); } }, (e) => { if (!cancelled) setHistoryError(orgErrorCopy(orgApiCode(e), tt)); });
    return () => { cancelled = true; };
  }, [org.id]);
  function overTransferable(minor: number) {
    return tt("最多只能转入 {amount}（充值来的钱），请减少金额。", { amount: formatMinor(minor, org.currency) });
  }
  async function move() {
    if (sending.current) return;
    setError(""); setSuccess("");
    let body = attempt.current;
    if (!body) {
      const amountMinor = transferAmount(amount);
      if (amountMinor === undefined) { setError(tt("请输入大于零的金额，最多两位小数。")); return; }
      if (direction !== "personal_to_team" && !org.overviewAvailable) { setError(orgErrorCopy("not_available", tt)); return; }
      if (direction !== "personal_to_team" && amountMinor > org.balanceMinor) { setError(tt("余额不足，请减少金额。")); return; }
      if (direction === "personal_to_team" && transferable !== null && amountMinor > transferable) { setError(overTransferable(transferable)); return; }
      if (direction === "team_to_team" && !teams.some((team) => team.id === toOrgId)) { setError(tt("请选择你负责的另一个团队。")); return; }
      body = { direction, amount_minor: amountMinor, request_id: crypto.randomUUID(), ...(direction === "team_to_team" ? { to_org_id: toOrgId } : {}) };
      attempt.current = body;
    }
    sending.current = true; setBusy(true);
    try {
      await transferOrgCredit(org.id, body);
      attempt.current = null; setRetry(false); setAmount("");
      setSuccess(tt("余额已转移"));
      await Promise.allSettled([Promise.resolve().then(onChanged), loadHistory()]);
    } catch (e) {
      const refused = e instanceof OrgApiError && e.status >= 400 && e.status < 500;
      if (refused) attempt.current = null;
      const cap = e instanceof OrgApiError && e.code === "only_paid_credit_transferable" ? e.facts.transferable_minor : undefined;
      if (cap !== undefined) setTransferable(cap);
      setRetry(!refused); setError(cap !== undefined ? overTransferable(cap) : orgErrorCopy(orgApiCode(e), tt));
    }
    finally { sending.current = false; setBusy(false); }
  }
  async function topup() {
    if (sending.current) return;
    setTopupError(""); setPaymentUrl(""); setTopupMessage("");
    const amountMinor = transferAmount(topupAmount);
    if (amountMinor === undefined || amountMinor > 2_000_000_000) { setTopupError(tt("请输入大于零的金额，最多两位小数。")); return; }
    if (amountMinor < org.minTopupMinor) { setTopupError(tt("最低起充 {amount}", { amount: formatMinor(org.minTopupMinor, org.currency) })); return; }
    sending.current = true; setBusy(true);
    try {
      const bank = org.currency.toUpperCase() === "CNY";
      const result = await topupOrg(org.id, bank ? "bank-transfer" : "stripe", { amountMinor, legalName: org.legalName, taxId: org.taxId, ...(bank ? { payerNote } : {}) });
      if (bank) {
        if (!result.topup?.id) throw new Error("missing topup");
        setTopupMessage(tt("已登记充值单 {id}，汇款备注请使用本单号。目前对公收款通道未开通，请等待平台确认收款安排；确认前团队余额不变。", { id: result.topup.id }));
      } else {
        const url = new URL(result.payment?.url || "");
        if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("invalid checkout");
        setPaymentUrl(url.href);
      }
    } catch (e) { setTopupError(orgErrorCopy(orgApiCode(e), tt)); }
    finally { sending.current = false; setBusy(false); }
  }
  return <section className="mt-4 space-y-3 rounded-xl border border-neutral-200 p-4" data-org-section="wallet">
    <h2 className="text-[13px] font-semibold">{tt("转移余额")}</h2>
    <form className="flex flex-wrap items-center gap-2" data-org-transfer-form="1" onSubmit={(e) => { e.preventDefault(); void move(); }}>
      <select className={input} aria-label={tt("转移方向")} data-org-transfer-direction="1" value={direction} disabled={busy || retry} onChange={(e) => setDirection(e.target.value as OrgTransferDirection)}>
        <option value="personal_to_team">{tt("个人钱包转入团队")}</option>
        <option value="team_to_personal">{tt("团队转回我的个人钱包")}</option>
        <option value="team_to_team">{tt("转给另一个团队")}</option>
      </select>
      {direction === "team_to_team" && <select className={input} aria-label={tt("收款团队")} data-org-transfer-target="1" value={toOrgId} disabled={busy || retry} onChange={(e) => setToOrgId(e.target.value)}>
        <option value="">{tt("请选择你负责的另一个团队。")}</option>
        {teams.map((team) => <option key={team.id} value={team.id}>{team.name} ({team.currency})</option>)}
      </select>}
      <label className="text-[12px]">{tt("金额")} ({org.currency}) <input className={input} inputMode="decimal" aria-label={tt("转移金额")} data-org-transfer-amount="1" value={amount} disabled={busy || retry} onChange={(e) => setAmount(e.target.value)} /></label>
      <button type="submit" className={button} disabled={busy} data-org-transfer-submit="1">{retry ? tt("重试") : tt("转移余额")}</button>
    </form>
    {direction === "personal_to_team" && <p className="text-[12px] text-neutral-500" data-org-transferable="1">
      {transferable !== null && <>{tt("最多可转入 {amount}。", { amount: formatMinor(transferable, org.currency) })} </>}
      {tt("赠送的额度会留在个人钱包里，不能转出；只能转出充值来的钱。")}
    </p>}
    {error && <p role="status" className="text-[12px] text-rose-700">{error}</p>}
    {success && <p role="status" className="text-[12px]">{success}</p>}
    <h3 className="text-[13px] font-medium">{tt("转移记录")}</h3>
    {historyError ? <p role="status" className="text-[12px] text-neutral-500">{historyError}</p> : history === null ? <p>…</p> : history.length === 0 ? <p className="text-[12px] text-neutral-500">{tt("还没有转移记录")}</p> : <ul className="space-y-2 text-[12px]" data-org-transfer-history="1">
      {history.map((row) => <li key={row.transfer_id}>
        {tt(row.direction === "personal_to_team" ? "个人钱包转入团队" : row.direction === "team_to_personal" ? "团队转回我的个人钱包" : "转移余额")} · {row.counterparty.kind === "personal" ? tt("个人钱包") : row.counterparty.name} · {row.incoming || row.direction === "personal_to_team" ? "+" : "−"}{formatMinor(row.amount_minor, row.currency)} · <time>{new Date(row.created_at).toLocaleString()}</time>
      </li>)}
    </ul>}
    {topupOpen && <form className="space-y-3 border-t border-neutral-200 pt-3" data-org-topup-form="1" onSubmit={(e) => { e.preventDefault(); void topup(); }}>
      <h3 className="text-[13px] font-medium">{tt("充值")}</h3>
      <label className="block text-[12px]">{tt("金额")} ({org.currency}) <input className={input} inputMode="decimal" aria-label={tt("充值金额")} data-org-topup-amount="1" value={topupAmount} disabled={busy} onChange={(e) => { setTopupAmount(e.target.value); setPaymentUrl(""); setTopupMessage(""); }} /></label>
      {org.currency.toUpperCase() === "CNY" && <label className="block text-[12px]">{tt("汇款备注")} <input className={input} aria-label={tt("汇款备注")} value={payerNote} maxLength={200} disabled={busy} onChange={(e) => { setPayerNote(e.target.value); setTopupMessage(""); }} /></label>}
      <div className="flex gap-2"><button type="submit" className={button} disabled={busy}>{tt("充值")}</button><button type="button" className={button} disabled={busy} onClick={onTopupClose}>{tt("取消")}</button></div>
      {paymentUrl && <a href={paymentUrl} className="text-[13px] underline">{tt("前往付款")}</a>}
      {topupMessage && <p role="status" className="text-[12px]">{topupMessage}</p>}
      {topupError && <p role="status" className="text-[12px] text-rose-700">{topupError}</p>}
    </form>}
  </section>;
}
