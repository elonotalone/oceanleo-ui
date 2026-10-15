"use client";

// 「我的」→「我买到的」：服务单、课程单、作品单合成一张列表，行右边标明类别。
import { useUI } from "../../../i18n/ui/useUI";
import { listBoughtBayApps } from "../../../lib/bay/app-paid";
import { formatBayFen } from "../../../lib/bay/demands";
import { hiddenKey, listBayMineHidden } from "../../../lib/bay/mine-hidden";
import { listBoughtBayLessonOrders } from "../../../lib/bay/lessons";
import { listBayOrders, orderAmountText, orderStatusLabel } from "../../../lib/bay/orders";
import { openBay, useBaySignedIn } from "../shell/bay-state";
import { useMineBundle, type MinePaneProps } from "./mine-bundle";
import {
  categoryOfListingKind,
  isMergedPaidOrder,
  joinMeta,
  mineEmptyText,
  orderIsSettled,
  paidContractIds,
  purchaseIsSettled,
  purchaseStatusText,
  rowMatchesCategory,
  subscriptionIsSettled,
  subscriptionStatusText,
} from "./mine-category";
import { loadServiceCategories } from "./mine-load";
import { hideRowProps } from "./mine-hide";
import { MineTradeList, type MineTradeRow } from "./MineTradeList";

type BoughtBundle = {
  orders: Awaited<ReturnType<typeof listBayOrders>>;
  lessons: Awaited<ReturnType<typeof listBoughtBayLessonOrders>>["items"];
  apps: Awaited<ReturnType<typeof listBoughtBayApps>>;
  serviceKinds: Awaited<ReturnType<typeof loadServiceCategories>>;
  hidden: Set<string>;
};

async function loadBought(): Promise<BoughtBundle> {
  const [orders, lessons, apps, hidden] = await Promise.all([
    listBayOrders({ role: "buyer", limit: 200 }).then(
      (rows) => rows.filter((row) => row.my_role === "buyer"),
      () => [] as BoughtBundle["orders"],
    ),
    listBoughtBayLessonOrders().then(
      (body) => body.items || [],
      () => [] as BoughtBundle["lessons"],
    ),
    listBoughtBayApps().then(
      (body) => ({
        purchases: body.purchases || [],
        subscriptions: body.subscriptions || [],
        trials: body.trials || [],
        apps: body.apps || [],
      }),
      () => ({ purchases: [], subscriptions: [], trials: [], apps: [] }),
    ),
    listBayMineHidden(),
  ]);
  const paidIds = paidContractIds(lessons, apps.purchases);
  const tradeOrders = orders.filter((order) => !isMergedPaidOrder(order, paidIds));
  const serviceKinds = await loadServiceCategories(tradeOrders.map((order) => order.source_service_id || ""));
  return { orders: tradeOrders, lessons, apps, serviceKinds, hidden };
}

export function MyBoughtPane({ category = "all" }: MinePaneProps) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const bundle = useMineBundle(signedIn, loadBought, tt("列表没读出来，请稍后再试。"));
  const data = bundle.data;
  const rows: MineTradeRow[] = [];
  if (data) {
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
        title: row.item_title || tt("未命名作品"),
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
        title: row.app_title || tt("未命名作品"),
        subtitle: joinMeta([tt(subscriptionStatusText(row.status)), row.price_fen ? formatBayFen(row.price_fen) : ""]),
        category: "app",
        ...hideRowProps(tt, bundle.reload, subscriptionIsSettled(row.status), "app-sub", row.id),
        onOpen: () => openBay({ kind: "app", id: row.app_id }),
      });
    }
  }
  return (
    <MineTradeList
      pane="mine-bought"
      rows={rows}
      loading={bundle.loading}
      error={bundle.error}
      onRetry={bundle.reload}
      emptyText={mineEmptyText("bought")}
    />
  );
}
