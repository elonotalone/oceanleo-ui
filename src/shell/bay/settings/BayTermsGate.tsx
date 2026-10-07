"use client";

// 没同意当前条款时，先显示条款和「同意」；同意之后才渲染 children。
import { useEffect, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { acceptBayTerms, bayTermsUpToDate, fetchBayTermsCurrent, fetchBayTermsStatus, type BayTermsStatus } from "../../../lib/bay/terms";
import { bayEnabledHere, requireBayLogin } from "../shell/bay-state";
import { subscribeBayTermsAccepted } from "./terms-flow";
import { BayTermsSections } from "./terms-text";

export function BayTermsGate({ scope, children }: { scope: "buyer" | "seller"; children?: ReactNode }): ReactNode {
  const tt = useUI();
  const [status, setStatus] = useState<BayTermsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!bayEnabledHere()) return;
    let next = await fetchBayTermsStatus();
    if (next.status === 401) {
      requireBayLogin();
      setStatus(next);
      return;
    }
    if (!next.current) {
      const fetched = await fetchBayTermsCurrent();
      next = { ...next, current: fetched.current, error: fetched.current ? null : fetched.error || next.error };
    }
    setStatus(next);
    setError(next.current ? null : next.error);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => subscribeBayTermsAccepted(() => void refresh()), []);

  if (!bayEnabledHere()) return null;
  if (status && bayTermsUpToDate(status)) return children ?? null;
  if (!status) return <p className="py-4 text-[13px] text-neutral-500">{tt("正在加载…")}</p>;

  const current = status.current;
  return (
    <div className="space-y-4" data-bay-terms-gate={scope}>
      <div>
        <h3 className="text-[14px] font-semibold">{tt("继续之前，请先同意使用条款")}</h3>
        <p className="mt-1 text-[12px] text-neutral-500">
          {scope === "seller"
            ? tt("报价、发布服务、接单都以这份条款为准，同意一次即可。")
            : tt("发需求、下单、接受报价都以这份条款为准，同意一次即可。")}
        </p>
      </div>
      {current ? <BayTermsSections document={current} /> : <p className="text-[13px] text-rose-600">{tt(error || "条款加载失败，请稍后重试")}</p>}
      {error && current ? <p className="text-[12px] text-rose-600">{tt(error)}</p> : null}
      <div className="flex gap-2">
        {current ? (
          <button
            type="button"
            data-bay-terms-gate-accept=""
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                const result = await acceptBayTerms(current.version);
                setBusy(false);
                if (result.accepted) {
                  setStatus(result);
                  return;
                }
                if (result.current) setStatus(result);
                setError(result.error || "没能记下你的同意，请稍后重试");
              })();
            }}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {busy ? tt("正在记录…") : tt("同意并继续")}
          </button>
        ) : (
          <button type="button" onClick={() => void refresh()} className="rounded-xl border border-neutral-300 px-4 py-2 text-[13px]">
            {tt("重试")}
          </button>
        )}
      </div>
    </div>
  );
}
