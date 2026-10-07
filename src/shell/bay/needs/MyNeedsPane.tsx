"use client";

// 「我的需求」：我发出的需求列表。整行可点，打开这条需求。不自带返回栏。

import { useUI } from "../../../i18n/ui/useUI";
import { listMyDemands, type BayDemand } from "../../../lib/bay/demands";
import { openBay, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { categoryNameBySlug, useNeedCategories } from "./need-categories";
import { budgetText, demandStatusText, timeAgoText } from "./need-format";
import { BTN_SECONDARY, LoginPrompt, PaneBody, PaneLoading, PaneNotice, errorText, useNeedLoader } from "./need-ui";

const ROW =
  "block w-full border-b border-black/5 px-3 py-2.5 text-left hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 dark:border-white/10 dark:hover:bg-white/5";

export function MyNeedsPane({ target }: BayPaneProps) {
  if (target.kind !== "mine" || target.tab !== "needs") return null;
  return <MyNeedsBody />;
}

function MyNeedsBody() {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const list = useNeedLoader(() => listMyDemands({ status: "all", limit: 40 }), [signedIn]);

  if (!signedIn) {
    return (
      <PaneBody pane="my-needs">
        <LoginPrompt message={tt("登录后查看你发出的需求。")} />
      </PaneBody>
    );
  }
  if (list.loading && !list.data) {
    return (
      <PaneBody pane="my-needs">
        <PaneLoading />
      </PaneBody>
    );
  }
  if (!list.data) {
    return (
      <PaneBody pane="my-needs">
        <PaneNotice
          tone="error"
          action={
            <button type="button" className={BTN_SECONDARY} onClick={list.reload}>
              {tt("重试")}
            </button>
          }
        >
          {errorText(tt, list.error, tt("需求没读出来，请稍后再试。"))}
        </PaneNotice>
      </PaneBody>
    );
  }
  const items = list.data.items || [];
  return (
    <PaneBody pane="my-needs">
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 py-8 text-center text-[12px] text-stone-500">
          {tt("你还没有发出需求。")}
        </p>
      ) : (
        <ul data-bay-my-needs>
          {items.map((item) => (
            <MyNeedRow key={item.id} item={item} />
          ))}
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
            <span className="line-clamp-2 text-[14px] font-semibold text-stone-800">{item.title}</span>
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
