"use client";

// 「我的报价」：调用 GET /v1/talent/proposals/mine。整行可点，打开对应需求。不自带返回栏。

import { useUI } from "../../../i18n/ui/useUI";
import { listMyProposals, type BayProposal } from "../../../lib/bay/demands";
import { openBay, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { categoryNameBySlug, useNeedCategories } from "./need-categories";
import { budgetText, demandStatusText, proposalStatusText, timeAgoText } from "./need-format";
import { BTN_SECONDARY, LoginPrompt, PaneBody, PaneLoading, PaneNotice, errorText, useNeedLoader } from "./need-ui";

const ROW =
  "block w-full border-b border-black/5 px-3 py-2.5 text-left hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 dark:border-white/10 dark:hover:bg-white/5";

export function MyProposalsPane({ target }: BayPaneProps) {
  if (target.kind !== "mine" || target.tab !== "proposals") return null;
  return <MyProposalsBody />;
}

function MyProposalsBody() {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const list = useNeedLoader(() => listMyProposals({ limit: 40 }), [signedIn]);

  if (!signedIn) {
    return (
      <PaneBody pane="my-proposals">
        <LoginPrompt message={tt("登录后查看你发出的报价。")} />
      </PaneBody>
    );
  }
  if (list.loading && !list.data) {
    return (
      <PaneBody pane="my-proposals">
        <PaneLoading />
      </PaneBody>
    );
  }
  if (!list.data) {
    return (
      <PaneBody pane="my-proposals">
        <PaneNotice
          tone="error"
          action={
            <button type="button" className={BTN_SECONDARY} onClick={list.reload}>
              {tt("重试")}
            </button>
          }
        >
          {errorText(tt, list.error, tt("报价没读出来，请稍后再试。"))}
        </PaneNotice>
      </PaneBody>
    );
  }
  const items = list.data.items || [];
  return (
    <PaneBody pane="my-proposals">
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 py-8 text-center text-[12px] text-stone-500">
          {tt("你还没有发出报价。")}
        </p>
      ) : (
        <ul data-bay-my-proposals>
          {items.map((item) => (
            <MyProposalRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </PaneBody>
  );
}

function MyProposalRow({ item }: { item: BayProposal }) {
  const tt = useUI();
  const { response } = useNeedCategories();
  const demand = item.demand;
  const category = categoryNameBySlug(tt, demand?.category, response);
  const demandId = demand?.id || item.demand_id;
  return (
    <li>
      <button
        type="button"
        className={ROW}
        onClick={() => demandId && openBay({ kind: "demand", id: demandId })}
        data-bay-my-proposal-row={item.id}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="line-clamp-2 block text-[14px] font-semibold text-stone-800">
              {demand?.title || tt("一条需求")}
            </span>
            <span className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-stone-500">
              <span>{proposalStatusText(tt, item.status)}</span>
              {demand?.status ? <span>{demandStatusText(tt, demand.status)}</span> : null}
              {category ? <span>{category}</span> : null}
              {item.created_at ? <span>{timeAgoText(tt, item.created_at)}</span> : null}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[13px] font-semibold text-stone-800">
              {budgetText(tt, item.price_fen, item.price_fen, item.currency)}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}
