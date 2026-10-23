"use client";

// 「我的」→「我卖出的」：报价、人工服务、课程、网站与软件服务的订单合成一张列表，行右边标明类别。
import { useUI } from "../../../i18n/ui/useUI";
import { listSoldBayApps } from "../../../lib/bay/app-paid";
import { formatBayFen, listMyProposals } from "../../../lib/bay/demands";
import { hiddenKey, listBayMineHidden } from "../../../lib/bay/mine-hidden";
import { listSoldBayLessonOrders } from "../../../lib/bay/lessons";
import { listBayOrders, orderAmountText, orderStatusLabel } from "../../../lib/bay/orders";
import { proposalStatusText } from "../needs/need-format";
import { openBay, useBaySignedIn } from "../shell/bay-state";
import { useMineBundle, type MinePaneProps } from "./mine-bundle";
import {
  categoryOfListingKind,
  isMergedPaidOrder,
  joinMeta,
  mineEmptyText,
  orderIsSettled,
  paidContractIds,
  proposalIsSettled,
  purchaseIsSettled,
  purchaseStatusText,
  rowMatchesCategory,
  subscriptionIsSettled,
  subscriptionStatusText,
} from "./mine-category";
import { loadServiceCategories } from "./mine-load";
import { hideRowProps } from "./mine-hide";
import { MineTradeList, type MineTradeRow } from "./MineTradeList";

type SoldBundle = {
  proposals: Awaited<ReturnType<typeof listMyProposals>>["items"];
  orders: Awaited<ReturnType<typeof listBayOrders>>;
  lessons: Awaited<ReturnType<typeof listSoldBayLessonOrders>>["items"];
  apps: Awaited<ReturnType<typeof listSoldBayApps>>;
  serviceKinds: Awaited<ReturnType<typeof loadServiceCategories>>;
  hidden: Set<string>;
};

async function loadSold(): Promise<SoldBundle> {
  const [proposals, orders, lessons, apps, hidden] = await Promise.all([
    listMyProposals({ limit: 40 }).then(
      (body) => body.items || [],
      () => [] as SoldBundle["proposals"],
    ),
    listBayOrders({ role: "seller", limit: 200 }).then(
      (rows) => rows.filter((row) => row.my_role === "seller"),
      () => [] as SoldBundle["orders"],
    ),
    listSoldBayLessonOrders().then(
      (body) => body.items || [],
      () => [] as SoldBundle["lessons"],
    ),
    listSoldBayApps().then(
      (body) => ({ purchases: body.purchases || [], subscriptions: body.subscriptions || [] }),
      () => ({ purchases: [], subscriptions: [] }),
    ),
    listBayMineHidden(),
  ]);
  const paidIds = paidContractIds(lessons, apps.purchases);
  const tradeOrders = orders.filter((order) => !isMergedPaidOrder(order, paidIds));
  const serviceKinds = await loadServiceCategories(tradeOrders.map((order) => order.source_service_id || ""));
  return { proposals, orders: tradeOrders, lessons, apps, serviceKinds, hidden };
}

export function MySoldPane({ category = "all" }: MinePaneProps) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const bundle = useMineBundle(signedIn, loadSold, tt("列表没读出来，请稍后再试。"));
  const data = bundle.data;
  const rows: MineTradeRow[] = [];
  if (data) {
    for (const item of data.proposals) {
      if (data.hidden.has(hiddenKey("proposal", item.id))) continue;
      const kind = categoryOfListingKind(item.demand?.listing_kind);
      if (!rowMatchesCategory(category, kind)) continue;
      const demandId = item.demand?.id || item.demand_id;
      rows.push({
        id: `proposal:${item.id}`,
        title: item.demand?.title || tt("一条需求"),
        subtitle: joinMeta([proposalStatusText(tt, item.status), item.price_fen ? formatBayFen(item.price_fen, item.currency) : ""]),
        category: kind,
        ...hideRowProps(tt, bundle.reload, proposalIsSettled(item.status), "proposal", item.id),
        onOpen: () => {
          if (demandId) openBay({ kind: "demand", id: demandId });
        },
      });
    }
    for (const order of data.orders) {
      if (data.hidden.has(hiddenKey("order", order.id))) continue;
      const kind = categoryOfListingKind(data.serviceKinds[order.source_service_id || ""] || "service");
      if (!rowMatchesCategory(category, kind)) continue;
      rows.push({
        id: `order:${order.id}`,
        title: order.title || tt("订单"),
        subtitle: joinMeta([orderStatusLabel(tt, order.status), orderAmountText(tt, order)]),
        category: kind,
        orderId: order.id,
        ...hideRowProps(tt, bundle.reload, orderIsSettled(order.status), "order", order.id),
        onOpen: () => openBay({ kind: "order", id: order.id }),
      });
    }
    for (const row of data.lessons) {
      if (data.hidden.has(hiddenKey("lesson-order", row.id))) continue;
      if (!rowMatchesCategory(category, "lesson")) continue;
      rows.push({
        id: `lesson-order:${row.id}`,
        title: row.item_title || tt("未命名课程"),
        subtitle: joinMeta([tt(purchaseStatusText(row.status)), row.price_fen ? formatBayFen(row.price_fen) : tt("免费")]),
        category: "lesson",
        ...hideRowProps(tt, bundle.reload, purchaseIsSettled(row.status), "lesson-order", row.id),
        onOpen: () => openBay(row.item_kind === "bundle" ? { kind: "bundle", id: row.item_id } : { kind: "lesson", id: row.item_id }),
      });
    }
    for (const row of data.apps.purchases) {
      if (data.hidden.has(hiddenKey("app-order", row.id))) continue;
      if (!rowMatchesCategory(category, "app")) continue;
      rows.push({
        id: `app-order:${row.id}`,
        title: row.item_title || tt("未命名"),
        subtitle: joinMeta([tt(purchaseStatusText(row.status)), row.price_fen ? formatBayFen(row.price_fen) : tt("免费")]),
        category: "app",
        ...hideRowProps(tt, bundle.reload, purchaseIsSettled(row.status), "app-order", row.id),
        onOpen: () => openBay({ kind: "app", id: row.item_id }),
      });
    }
    for (const row of data.apps.subscriptions) {
      if (data.hidden.has(hiddenKey("app-sub", row.id))) continue;
      if (!rowMatchesCategory(category, "app")) continue;
      rows.push({
        id: `app-sub:${row.id}`,
        title: row.app_title || tt("未命名"),
        subtitle: joinMeta([tt(subscriptionStatusText(row.status)), row.price_fen ? formatBayFen(row.price_fen) : ""]),
        category: "app",
        ...hideRowProps(tt, bundle.reload, subscriptionIsSettled(row.status), "app-sub", row.id),
        onOpen: () => openBay({ kind: "app", id: row.app_id }),
      });
    }
  }
  return (
    <MineTradeList
      pane="mine-sold"
      rows={rows}
      loading={bundle.loading}
      error={bundle.error}
      onRetry={bundle.reload}
      emptyText={mineEmptyText("sold")}
    />
  );
}
