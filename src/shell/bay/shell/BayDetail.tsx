"use client";

// Bay 的详情：按当前目标渲染需求、供给、交易、订单、卖家几块的窗格；交易会话用 DealConversationView；
// 「我的」五个分区；设置交给共用设置窗。
// 浮窗里（BayDetail）顶上一条返回栏，返回滑回列表。/bay 页的返回键与标题在页头那一行（见 BayPage），
// 页面只取这里的正文（BayDetailPane），所以页面上不会出现两个返回键、两个标题。
import type { ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { DealConversationView } from "../deal";
import { CallHumanPane, DemandPane, HelpRequestPane, PostNeedPane, ProposePane } from "../needs";
import { OrderPane } from "../orders";
import { ServiceEditorPane } from "../seller";
import { BaySettingsPane } from "../settings";
import { CheckoutPane, ConsultPane, ProfilePane, ServicePane } from "../supply";
import { BayGlyph } from "./bay-icons";
import { formatBayParam } from "./bay-links";
import { useBaySlideIn } from "./bay-motion";
import { bayBack, useBaySiteKey, useBayState, type BayLayout, type BayPaneProps, type BayTarget } from "./bay-state";
import { BayMine } from "./BayMine";

const DETAIL_TITLES: Readonly<Record<Exclude<BayTarget["kind"], "feed">, string>> = {
  demand: "需求详情",
  service: "服务详情",
  help: "求助详情",
  consult: "答疑详情",
  profile: "用户主页",
  order: "订单详情",
  conversation: "交易会话",
  "post-need": "发需求",
  "call-human": "叫真人",
  propose: "报价",
  checkout: "下单",
  "service-editor": "发布服务",
  mine: "我的",
  settings: "设置",
};

/** 当前目标在返回栏 / 页头里显示的标题（中文原文，调用方过 tt）；停在信息流时没有标题。 */
export function bayDetailTitleKey(target: BayTarget): string | null {
  if (target.kind === "feed") return null;
  if (target.kind === "service-editor" && target.serviceId) return "编辑服务";
  return DETAIL_TITLES[target.kind];
}

/** 当前目标的正文（不含返回栏、标题和滚动容器）；交易会话与信息流不走这里。 */
export function BayDetailPane(props: BayPaneProps): ReactNode {
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

/** 浮窗详情顶上的返回栏：返回键与浮窗的关闭键同一种外形，标题与浮窗标题同一档字号。 */
export function BayDetailBar({ title, onBack }: { title: string; onBack: () => void }) {
  const tt = useUI();
  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-black/5 px-2 dark:border-white/10" data-bay-detail-bar>
      <button type="button" onClick={onBack} aria-label={tt("返回")} title={tt("返回")} data-im-chrome-btn>
        <BayGlyph name="back" className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">{title}</div>
    </div>
  );
}

/** 浮窗右栏（窄浮窗里是滑进来的那一屏）。停在信息流时不渲染。 */
export function BayDetail({ layout }: { layout: BayLayout }) {
  const tt = useUI();
  const { current } = useBayState();
  const siteKey = useBaySiteKey();
  const narrow = layout === "docked" || layout === "mobile";
  const slideRef = useBaySlideIn<HTMLDivElement>(narrow, "detail", formatBayParam(current));

  if (current.kind === "feed") return null;
  if (current.kind === "conversation") {
    return (
      <div ref={slideRef} key={current.threadId} className="flex min-h-0 flex-1 flex-col" data-bay-detail="conversation">
        <DealConversationView threadId={current.threadId} layout={layout} onBack={bayBack} />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-bay-detail={current.kind}>
      <BayDetailBar title={tt(bayDetailTitleKey(current) ?? "")} onBack={bayBack} />
      <div ref={slideRef} key={formatBayParam(current)} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <BayDetailPane target={current} layout={layout} siteKey={siteKey} />
      </div>
    </div>
  );
}
