"use client";

// LeoBay 的详情正文：按当前目标渲染需求、供给、订单、卖家几块的窗格；「我的」四个分区；设置交给共用设置窗。
// 返回键与标题在 `/bay` 页的页头那一行（见 LeoBayPage），这里只出正文，所以页面上不会出现两个返回键、两个标题。
// 交易会话不在这里：它在 LeoChat 小窗里开。
import type { ReactNode } from "react";
import { CallHumanPane, DemandPane, HelpRequestPane, PostNeedPane, ProposePane } from "../needs";
import { OrderPane } from "../orders";
import { ServiceEditorPane } from "../seller";
import { BaySettingsPane } from "../settings";
import { CheckoutPane, ConsultPane, ProfilePane, ServicePane } from "../supply";
import type { BayPaneProps, BayTarget } from "./bay-state";
import { BayMine } from "./BayMine";

const DETAIL_TITLES: Readonly<Record<Exclude<BayTarget["kind"], "feed">, string>> = {
  demand: "需求详情",
  service: "服务详情",
  help: "求助详情",
  consult: "答疑详情",
  profile: "主页",
  order: "订单详情",
  conversation: "交易会话",
  "post-need": "找人帮忙",
  "call-human": "找人帮忙",
  propose: "报价",
  checkout: "下单",
  "service-editor": "发布",
  mine: "我的",
  settings: "设置",
};

/** 当前目标在返回栏 / 页头里显示的标题（中文原文，调用方过 tt）；停在信息流时没有标题。 */
export function bayDetailTitleKey(target: BayTarget): string | null {
  if (target.kind === "feed") return null;
  if (target.kind === "service-editor" && target.serviceId) return "编辑";
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
