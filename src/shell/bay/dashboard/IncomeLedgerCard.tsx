"use client";

// 数据面板里的「收入流水」：账本里逐笔的收入记录，可看单笔对账单、可导出 CSV。
// 只读。金额是记账，不是可动用的钱：收款通道没开放时，卡片上的说明会写明。
// 收入的数字只认面板上面那一套（已完成订单）；这里不再算第二个「累计收入」。
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  BAY_LEDGER_EVENT_LABELS,
  bayLedgerCsv,
  bayMoneyNotice,
  downloadBayLedgerCsv,
  fetchBayLedger,
  fetchBayStatement,
  type BayLedgerEntry,
  type BayStatement,
} from "../../../lib/bay/money";
import { LedgerList, StatementPanel } from "../settings/money-ui";
import { errorText } from "../supply/use-bay-resource";

const PAGE_SIZE = 20;
const EXPORT_PAGE_SIZE = 100;
/** 导出最多翻这么多页（每页 100 条），再多的账本分次导。 */
const EXPORT_MAX_PAGES = 50;

const GHOST_BUTTON =
  "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60";

interface LedgerState {
  items: BayLedgerEntry[];
  page: number;
  hasMore: boolean;
}

/** `sellerReady` 为 null = 收款状态还没取到：先不写那句关于「钱什么时候能动」的说明。 */
export function IncomeLedgerCard({ locale, sellerReady }: { locale: string; sellerReady: boolean | null }): ReactElement {
  const tt = useUI();
  const [state, setState] = useState<LedgerState | null>(null);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [statement, setStatement] = useState<BayStatement | null>(null);
  const [statementFailed, setStatementFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const statementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    setState(null);
    setError("");
    fetchBayLedger({ direction: "in", limit: PAGE_SIZE, page: 1 }).then(
      (page) => {
        if (active) setState({ items: page.items, page: 1, hasMore: page.has_more });
      },
      (reason: unknown) => {
        if (active) setError(errorText(reason) || "加载失败，请稍后再试。");
      },
    );
    return () => {
      active = false;
    };
  }, [nonce]);

  useEffect(() => {
    if (statement) statementRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [statement]);

  async function loadMore() {
    if (!state || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const next = await fetchBayLedger({ direction: "in", limit: PAGE_SIZE, page: state.page + 1 });
      setState((prev) => {
        if (!prev) return prev;
        // 翻页期间账本头部可能又多了几条，后一页会带出前一页已有的行；按 id 去重。
        const seen = new Set(prev.items.map((row) => row.id));
        return {
          items: [...prev.items, ...next.items.filter((row) => !seen.has(row.id))],
          page: prev.page + 1,
          hasMore: next.has_more,
        };
      });
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function openStatement(contractId: string) {
    setStatementFailed(false);
    try {
      const next = await fetchBayStatement(contractId);
      if (next) setStatement(next);
      else setStatementFailed(true);
    } catch {
      setStatementFailed(true);
    }
  }

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    setExportFailed(false);
    try {
      const rows: BayLedgerEntry[] = [];
      for (let page = 1; page <= EXPORT_MAX_PAGES; page += 1) {
        const part = await fetchBayLedger({ direction: "in", limit: EXPORT_PAGE_SIZE, page });
        rows.push(...part.items);
        if (!part.has_more) break;
      }
      downloadBayLedgerCsv(
        bayLedgerCsv(rows, {
          headers: [tt("时间"), tt("对方"), tt("订单"), tt("事件"), tt("收支"), tt("金额"), tt("已记录"), tt("备注")],
          event: (event) => tt(BAY_LEDGER_EVENT_LABELS[event]),
          direction: (direction) => (direction === "in" ? tt("收入") : tt("支出")),
          recorded: tt("已记录"),
        }),
        "bay-income.csv",
      );
    } catch {
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  }

  const items = state?.items ?? [];
  return (
    <section data-bay-dashboard-ledger="" className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-neutral-900">{tt("收入流水")}</h3>
          {sellerReady === null ? null : (
            <p className="mt-1 text-[12px] leading-5 text-neutral-500" data-bay-ledger-notice="">
              {tt(bayMoneyNotice(sellerReady))}
            </p>
          )}
          <p className="mt-1 text-[12px] leading-5 text-neutral-500">{tt("流水只是逐笔记录，收入数字以上面的为准。")}</p>
        </div>
        {items.length ? (
          <button type="button" data-bay-action="export-ledger" disabled={exporting} onClick={() => void exportCsv()} className={GHOST_BUTTON}>
            {exporting ? tt("正在处理…") : tt("导出 CSV")}
          </button>
        ) : null}
      </div>

      {exportFailed ? (
        <p role="alert" className="mt-2 text-[12px] text-rose-600">
          {tt("加载失败，请稍后再试。")}
        </p>
      ) : null}

      <div className="mt-3">
        {statement ? (
          <div ref={statementRef} className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <StatementPanel statement={statement} locale={locale} onClose={() => setStatement(null)} />
          </div>
        ) : null}
        {statementFailed ? (
          <p role="alert" className="mb-2 text-[12px] text-rose-600">
            {tt("加载失败，请稍后再试。")}
          </p>
        ) : null}

        {error ? (
          <div data-bay-ledger-error="" className="space-y-2">
            <p role="alert" className="text-[13px] text-rose-600">
              {tt(error)}
            </p>
            <button type="button" onClick={() => setNonce((value) => value + 1)} className={GHOST_BUTTON}>
              {tt("重试")}
            </button>
          </div>
        ) : !state ? (
          <p className="py-6 text-center text-[12px] text-neutral-500">{tt("正在加载…")}</p>
        ) : (
          <>
            <LedgerList items={items} locale={locale} empty={tt("还没有流水")} onStatement={(id) => void openStatement(id)} />
            {state.hasMore ? (
              <div className="mt-3 flex items-center gap-3">
                <button type="button" data-bay-action="ledger-more" disabled={loadingMore} onClick={() => void loadMore()} className={GHOST_BUTTON}>
                  {loadingMore ? tt("正在处理…") : tt("加载更多")}
                </button>
                {moreFailed ? (
                  <span role="alert" className="text-[12px] text-rose-600">
                    {tt("加载失败，请稍后再试。")}
                  </span>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
