"use client";

// 「我发出的」：我发出的需求和求助按时间排在一起。整行可点。不自带返回栏。

import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { formatFen } from "../../../api/talent-handoff";
import { listMyDemands, type BayDemand } from "../../../lib/bay/demands";
import { listMyBayHandoffs, type BayHandoff } from "../../../lib/bay/handoffs";
import { feedKindBadgeClass } from "../shell/feed-card-ui";
import { openBay, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { categoryNameBySlug, useNeedCategories } from "./need-categories";
import { budgetText, demandStatusText, handoffStateText, timeAgoText } from "./need-format";
import { BTN_SECONDARY, LoginPrompt, PaneBody, PaneLoading, PaneNotice, errorText } from "./need-ui";

const ROW =
  "block w-full border-b border-black/5 px-3 py-2.5 text-left hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 dark:border-white/10 dark:hover:bg-white/5";

type PostedRow =
  | { kind: "demand"; id: string; at: number; demand: BayDemand }
  | { kind: "help"; id: string; at: number; help: BayHandoff };

function createdAtMs(value: string | undefined): number {
  const at = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(at) ? at : 0;
}

export function MyNeedsPane({ target }: BayPaneProps) {
  if (target.kind !== "mine" || target.tab !== "needs") return null;
  return <MyNeedsBody />;
}

function MyNeedsBody() {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const [tick, setTick] = useState(0);
  const [demands, setDemands] = useState<BayDemand[] | null>(null);
  const [helps, setHelps] = useState<BayHandoff[] | null>(null);
  const [demandError, setDemandError] = useState<unknown>(null);
  const [helpError, setHelpError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    setLoading(true);
    setDemandError(null);
    setHelpError(null);
    void Promise.allSettled([listMyDemands({ status: "all", limit: 40 }), listMyBayHandoffs({ limit: 40 })]).then(
      ([demandResult, helpResult]) => {
        if (!alive) return;
        if (demandResult.status === "fulfilled") {
          setDemands(demandResult.value.items || []);
        } else {
          setDemands(null);
          setDemandError(demandResult.reason);
        }
        if (helpResult.status === "fulfilled") {
          setHelps(helpResult.value.items || []);
        } else {
          setHelps(null);
          setHelpError(helpResult.reason);
        }
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [signedIn, tick]);

  if (!signedIn) {
    return (
      <PaneBody pane="my-needs">
        <LoginPrompt message={tt("登录后查看你发出的需求。")} />
      </PaneBody>
    );
  }
  if (loading && demands === null && helps === null) {
    return (
      <PaneBody pane="my-needs">
        <PaneLoading />
      </PaneBody>
    );
  }
  if (demands === null && helps === null) {
    return (
      <PaneBody pane="my-needs">
        <PaneNotice
          tone="error"
          action={
            <button type="button" className={BTN_SECONDARY} onClick={() => setTick((value) => value + 1)}>
              {tt("重试")}
            </button>
          }
        >
          {errorText(tt, demandError || helpError, tt("需求没读出来，请稍后再试。"))}
        </PaneNotice>
      </PaneBody>
    );
  }

  const rows: PostedRow[] = [
    ...(demands || []).map((demand) => ({
      kind: "demand" as const,
      id: demand.id,
      at: createdAtMs(demand.created_at),
      demand,
    })),
    ...(helps || []).map((help) => ({
      kind: "help" as const,
      id: help.id,
      at: createdAtMs(help.created_at),
      help,
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <PaneBody pane="my-needs">
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 py-8 text-center text-[12px] text-stone-500">
          {tt("你还没有找过人帮忙。")}
        </p>
      ) : (
        <ul data-bay-my-needs>
          {rows.map((row) =>
            row.kind === "demand" ? (
              <MyNeedRow key={`demand:${row.id}`} item={row.demand} />
            ) : (
              <MyHelpRow key={`help:${row.id}`} item={row.help} />
            ),
          )}
        </ul>
      )}
    </PaneBody>
  );
}

function MyNeedRow({ item }: { item: BayDemand }) {
  const tt = useUI();
  const { response } = useNeedCategories();
  const category = categoryNameBySlug(tt, item.category, response);
  return (
    <li>
      <button type="button" className={ROW} onClick={() => openBay({ kind: "demand", id: item.id })} data-bay-my-need-row={item.id}>
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className={feedKindBadgeClass("demand")}>{tt("需求")}</span>
              <span className="min-w-0 truncate text-[14px] font-semibold text-stone-800">{item.title}</span>
            </span>
            <span className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-stone-500">
              <span>{demandStatusText(tt, item.status)}</span>
              {category ? <span>{category}</span> : null}
              <span>{tt("{n} 份报价", { n: Math.max(0, Number(item.proposal_count) || 0) })}</span>
              {item.created_at ? <span>{timeAgoText(tt, item.created_at)}</span> : null}
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-semibold text-stone-800">
            {budgetText(tt, item.budget_min_fen, item.budget_max_fen, item.currency)}
          </span>
        </span>
      </button>
    </li>
  );
}

function MyHelpRow({ item }: { item: BayHandoff }) {
  const tt = useUI();
  const { response } = useNeedCategories();
  const category = categoryNameBySlug(tt, item.category, response);
  return (
    <li>
      <button type="button" className={ROW} onClick={() => openBay({ kind: "help", id: item.id })} data-bay-my-help-row={item.id}>
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className={feedKindBadgeClass("help")}>{tt("求助")}</span>
              <span className="min-w-0 truncate text-[14px] font-semibold text-stone-800">{item.brief}</span>
            </span>
            <span className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-stone-500">
              <span>{handoffStateText(tt, item.state)}</span>
              {category ? <span>{category}</span> : null}
              {item.created_at ? <span>{timeAgoText(tt, item.created_at)}</span> : null}
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-semibold text-stone-800">
            {item.budget_fen > 0 ? formatFen(item.budget_fen, item.currency) : tt("预算面议")}
          </span>
        </span>
      </button>
    </li>
  );
}
