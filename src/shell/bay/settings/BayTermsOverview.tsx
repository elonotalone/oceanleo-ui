"use client";

// 设置「规则与条款」：看自己同意过哪个版本、什么时候同意的，以及当前条款全文。
// 条款正文只有中文（网关不发译文）；节标题走词条。
import { useEffect } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { bayTermsUpToDate, fetchBayTermsCurrent, fetchBayTermsStatus } from "../../../lib/bay/terms";
import { requireBayLogin } from "../shell/bay-state";
import { subscribeBayTermsAccepted } from "./terms-flow";
import { BayTermsSections, formatBayTermsTime } from "./terms-text";
import { useBayLoad } from "./use-bay-load";

async function loadTerms() {
  const status = await fetchBayTermsStatus();
  if (status.status === 401) {
    const fetched = await fetchBayTermsCurrent();
    return { guest: true as const, status, current: fetched.current, error: fetched.error };
  }
  const current = status.current ?? (await fetchBayTermsCurrent()).current;
  return { guest: false as const, status: { ...status, current }, current, error: status.error };
}

export function BayTermsOverview() {
  const tt = useUI();
  const { data, error, loading, reload } = useBayLoad(loadTerms, []);

  useEffect(() => subscribeBayTermsAccepted(reload), [reload]);

  if (loading && !data) return <p className="py-6 text-[13px] text-neutral-500">{tt("正在加载…")}</p>;
  if (!data) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-[13px] text-rose-600">
          {tt(error || "条款加载失败，请稍后重试")}
        </p>
        <button type="button" onClick={reload} className="text-[13px] font-medium text-sky-600 hover:underline">
          {tt("重试")}
        </button>
      </div>
    );
  }

  const current = data.current;
  const accepted = !data.guest && bayTermsUpToDate(data.status);

  return (
    <div className="space-y-4" data-bay-settings-terms="">
      {data.guest ? (
        <div className="space-y-2">
          <p className="text-[13px] text-neutral-600 dark:text-neutral-300">{tt("登录后查看你的同意记录")}</p>
          <button
            type="button"
            onClick={() => requireBayLogin()}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            {tt("登录")}
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
          <h4 className="text-[13px] font-semibold">{tt("你同意过的条款")}</h4>
          {current ? (
            <p className="mt-1 text-[12px] text-neutral-500">{tt("当前版本 {version}", { version: current.version })}</p>
          ) : null}
          {accepted && data.status.acceptance ? (
            <p className="mt-2 text-[13px]">
              {tt("你已同意第 {n} 版", { n: data.status.acceptance.version })}
              {data.status.acceptance.accepted_at
                ? ` · ${tt("同意时间：{time}", { time: formatBayTermsTime(data.status.acceptance.accepted_at) })}`
                : ""}
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-neutral-600">{tt("你还没有同意过当前条款")}</p>
          )}
        </div>
      )}
      <p className="text-[12px] text-neutral-500">{tt("条款正文只有中文；节标题会随界面语言变化。")}</p>
      {current ? <BayTermsSections document={current} /> : null}
    </div>
  );
}
