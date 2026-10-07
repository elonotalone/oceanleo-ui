"use client";

// Bay 右栏：按当前目标渲染需求、供给、交易、订单、卖家几块的窗格；交易会话用 DealConversationView；
// 「我的」五个分区；设置交给共用设置窗。窄浮窗里顶上一条返回栏，返回滑回列表。
import type { ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { DealConversationView } from "../deal";
import { CallHumanPane, DemandPane, HelpRequestPane, PostNeedPane, ProposePane } from "../needs";
import { OrderPane } from "../orders";
import { ServiceEditorPane } from "../seller";
import { BaySettingsPane } from "../settings";
import { CheckoutPane, ConsultPane, ProfilePane, ServicePane } from "../supply";
import { BayGlyph, BayIcon } from "./bay-icons";
import { formatBayParam } from "./bay-links";
import { useBaySlideIn } from "./bay-motion";
import { bayBack, useBaySiteKey, useBayState, type BayLayout, type BayPaneProps, type BayTarget } from "./bay-state";
import { BayMine } from "./BayMine";
import { BayEmptyActions } from "./BayList";

const DETAIL_TITLES: Readonly<Record<Exclude<BayTarget["kind"], "feed" | "conversation">, string>> = {
  demand: "需求详情",
  service: "服务详情",
  help: "求助详情",
  consult: "答疑详情",
  profile: "用户主页",
  order: "订单详情",
  "post-need": "发需求",
  "call-human": "叫真人",
  propose: "报价",
  checkout: "下单",
  "service-editor": "发布服务",
  mine: "我的",
  settings: "设置",
};

function Pane(props: BayPaneProps): ReactNode {
  const { target } = props;
  switch (target.kind) {
    case "demand":
      return <DemandPane {...props} />;
    case "service":
      return <ServicePane {...props} />;
    case "help":
      return <HelpRequestPane {...props} />;
    case "consult":
      return <ConsultPane {...props} />;
    case "profile":
      return <ProfilePane {...props} />;
    case "order":
      return <OrderPane {...props} />;
    case "post-need":
      return <PostNeedPane {...props} />;
    case "call-human":
      return <CallHumanPane {...props} />;
    case "propose":
      return <ProposePane {...props} />;
    case "checkout":
      return <CheckoutPane {...props} />;
    case "service-editor":
      return <ServiceEditorPane {...props} />;
    case "mine":
      return <BayMine tab={target.tab} layout={props.layout} siteKey={props.siteKey} />;
    case "settings":
      return <BaySettingsPane {...props} />;
    default:
      return null;
  }
}

export function BayDetailBar({ title, onBack }: { title: string; onBack: () => void }) {
  const tt = useUI();
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-black/10 px-1.5 dark:border-white/10" data-bay-detail-bar>
      <button
        type="button"
        onClick={onBack}
        aria-label={tt("返回")}
        title={tt("返回")}
        className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
      >
        <BayGlyph name="back" className="h-4 w-4" />
        <span>{tt("返回")}</span>
      </button>
      <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
    </div>
  );
}

/** 宽布局里还没选内容时的右栏。 */
export function BayDetailEmpty() {
  const tt = useUI();
  return (
    <div className="m-auto flex max-w-xs flex-col items-center px-6 py-10 text-center" data-bay-detail-empty>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-300">
        <BayIcon className="h-6 w-6" />
      </span>
      <div className="mt-3 text-sm font-semibold">OceanLeo Bay</div>
      <p className="mt-1 text-xs leading-5 text-black/55 dark:text-white/55">
        {tt("在这里找人做事，或者接别人的需求。选一条看详情。")}
      </p>
      <BayEmptyActions />
    </div>
  );
}

export function BayDetail({ layout }: { layout: BayLayout }) {
  const tt = useUI();
  const { current } = useBayState();
  const siteKey = useBaySiteKey();
  const narrow = layout === "docked" || layout === "mobile";
  const slideRef = useBaySlideIn<HTMLDivElement>(narrow, "detail", formatBayParam(current));

  if (current.kind === "feed") return narrow ? null : <BayDetailEmpty />;
  if (current.kind === "conversation") {
    return (
      <div ref={slideRef} key={current.threadId} className="flex min-h-0 flex-1 flex-col" data-bay-detail="conversation">
        <DealConversationView threadId={current.threadId} layout={layout} onBack={bayBack} />
      </div>
    );
  }
  const title = current.kind === "service-editor" && current.serviceId ? tt("编辑服务") : tt(DETAIL_TITLES[current.kind]);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-bay-detail={current.kind}>
      <BayDetailBar title={title} onBack={bayBack} />
      <div ref={slideRef} key={formatBayParam(current)} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Pane target={current} layout={layout} siteKey={siteKey} />
      </div>
    </div>
  );
}
