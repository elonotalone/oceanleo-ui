"use client";

// 「我的求助」：我发出的求助列表。整行可点，打开 Bay 里那条求助。不自带返回栏。

import { useUI } from "../../../i18n/ui/useUI";
import { formatFen } from "../../../api/talent-handoff";
import { listMyBayHandoffs, type BayHandoff } from "../../../lib/bay/handoffs";
import { openBay, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { categoryNameBySlug, useNeedCategories } from "./need-categories";
import { handoffStateText, timeAgoText } from "./need-format";
import { BTN_SECONDARY, LoginPrompt, PaneBody, PaneLoading, PaneNotice, errorText, useNeedLoader } from "./need-ui";

const ROW =
  "block w-full border-b border-black/5 px-3 py-2.5 text-left hover:bg-black/5 focus-visible:outline-none dark:border-white/10 dark:hover:bg-white/5";

export function MyHelpRequestsPane({ target }: BayPaneProps) {
  if (target.kind !== "mine" || target.tab !== "help") return null;
  return <MyHelpBody />;
}

function MyHelpBody() {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const list = useNeedLoader(() => listMyBayHandoffs({ limit: 40 }), [signedIn]);

  if (!signedIn) {
    return (
      <PaneBody pane="my-help">
        <LoginPrompt message={tt("登录后查看你发出的求助。")} />
      </PaneBody>
    );
  }
  if (list.loading && !list.data) {
    return (
      <PaneBody pane="my-help">
        <PaneLoading />
      </PaneBody>
    );
  }
  if (!list.data) {
    return (
      <PaneBody pane="my-help">
        <PaneNotice
          tone="error"
          action={
            <button type="button" className={BTN_SECONDARY} onClick={list.reload}>
              {tt("重试")}
            </button>
          }
        >
          {errorText(tt, list.error, tt("求助没读出来，请稍后再试。"))}
        </PaneNotice>
      </PaneBody>
    );
  }
  const items = list.data.items || [];
  return (
    <PaneBody pane="my-help">
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 py-8 text-center text-[12px] text-stone-500">
          {tt("你还没有发出求助。")}
        </p>
      ) : (
        <ul data-bay-my-help>
          {items.map((item) => (
            <MyHelpRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </PaneBody>
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
            <span className="line-clamp-2 block text-[14px] font-semibold text-stone-800">{item.brief}</span>
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
