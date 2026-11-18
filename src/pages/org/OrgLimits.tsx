"use client";

import { useEffect, useState } from "react";
import { listMemberLimits, setMemberLimits, orgApiCode, orgErrorCopy, type OrgLimits as Limits, type OrgLimitWindow, type OrgMemberLimits, type OrgMemberRow } from "../../lib/org-api";
import { formatMinor } from "../../lib/money";
import { useUI } from "../../i18n/ui/useUI";

export const LIMIT_WINDOWS: readonly [OrgLimitWindow, string][] = [
  ["total_minor", "累计"], ["day_minor", "近 1 天"], ["five_day_minor", "近 5 天"], ["month_minor", "近 30 天"],
];

/** Decimal money input: blank is unlimited, zero prevents spend, invalid is rejected. */
export function limitInput(text: string): number | null | undefined {
  const value = text.trim();
  if (!value) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const amount = Math.round(Number(value) * 100);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

export function LimitReadout({ row, currency }: { row: OrgMemberLimits; currency: string }) {
  const tt = useUI();
  return <dl className="grid gap-2 sm:grid-cols-4" data-org-limits-readonly="1">
    {LIMIT_WINDOWS.map(([key, label]) => <div key={key}>
      <dt className="text-[12px] text-neutral-500">{tt(label)}</dt>
      <dd className="text-[13px] tabular-nums">{formatMinor(row.spent[key], currency)} / {row.limits[key] === null ? tt("不限") : formatMinor(row.limits[key]!, currency)}</dd>
    </div>)}
  </dl>;
}

function MemberLimits({ orgId, row, name, editable, currency, onSaved }: {
  orgId: string; row: OrgMemberLimits; name: string; editable: boolean; currency: string; onSaved: (row: OrgMemberLimits) => void;
}) {
  const tt = useUI();
  const [draft, setDraft] = useState(() => Object.fromEntries(LIMIT_WINDOWS.map(([key]) => [key, row.limits[key] === null ? "" : String(row.limits[key]! / 100)])) as Record<OrgLimitWindow, string>);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    const limits = Object.fromEntries(LIMIT_WINDOWS.map(([key]) => [key, limitInput(draft[key])])) as Limits;
    if (Object.values(limits).some((value) => value === undefined)) { setError(tt("请输入零或正数，最多两位小数；留空表示不限。")); return; }
    setBusy(true); setError("");
    try { onSaved(await setMemberLimits(orgId, row.userId, limits)); }
    catch (e) { setError(orgErrorCopy(orgApiCode(e), tt)); }
    finally { setBusy(false); }
  }
  return <form className="space-y-2 border-t border-neutral-100 py-3" data-org-limit-member={row.userId}
    onSubmit={(event) => { event.preventDefault(); if (!busy) void save(); }}>
    <p className="text-[13px] font-medium">{name}</p>
    {editable ? <div className="grid gap-2 sm:grid-cols-4">
      {LIMIT_WINDOWS.map(([key, label]) => <label key={key} className="grid gap-1 text-[12px]">
        <span>{tt(label)}</span>
        <input inputMode="decimal" value={draft[key]} placeholder={tt("不限")} aria-label={`${name} ${tt(label)}`}
          disabled={busy} data-org-limit-input={key}
          className="w-full rounded-lg border border-neutral-200 px-2 py-1.5"
          onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
        <span className="text-neutral-500">{tt("已花 {amount}", { amount: formatMinor(row.spent[key], currency) })}</span>
      </label>)}
    </div> : <LimitReadout row={row} currency={currency} />}
    {editable && <button type="submit" disabled={busy} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]">{tt("保存")}</button>}
    {error && <p role="status" className="text-[12px] text-rose-700">{error}</p>}
  </form>;
}

export function OrgLimits({ orgId, members, editable, currency }: { orgId: string; members: OrgMemberRow[]; editable: boolean; currency: string }) {
  const tt = useUI();
  const [rows, setRows] = useState<OrgMemberLimits[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setRows(null); setError("");
    void listMemberLimits(orgId).then((value) => { if (!cancelled) setRows(value); }, (e) => { if (!cancelled) setError(orgErrorCopy(orgApiCode(e), tt)); });
    return () => { cancelled = true; };
  }, [orgId]);
  return <section className="mt-4 rounded-xl border border-neutral-200 p-4" data-org-section="limits">
    <h2 className="text-[13px] font-semibold">{tt("成员花费与上限")}</h2>
    <p className="my-2 text-[12px] text-neutral-500">{tt("留空表示不限，0 表示不能花团队的钱。1 天、5 天和 30 天按最近时段计算。")}</p>
    {error ? <p role="status" className="text-[12px] text-neutral-500">{error}</p> : rows === null ? <p>…</p> : rows.filter((row) => members.some((member) => member.userId === row.userId)).map((row) => <MemberLimits key={`${orgId}:${row.userId}`} orgId={orgId} row={row} currency={currency} editable={editable}
      name={members.find((m) => m.userId === row.userId)?.email || row.userId}
      onSaved={(saved) => setRows((current) => current?.map((r) => r.userId === row.userId ? saved : r) || [])} />)}
  </section>;
}
