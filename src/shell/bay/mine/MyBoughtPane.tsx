"use client";

// 「我的」→「我买到的」：人工服务、课程、网站与软件服务的订单合成一张列表，行右边标明付款金额与类别。
// 有订单（合同）的行多一个「查看对账单」，点开在这一行下面展开那一单的对账单（只读）。
import { useUI } from "../../../i18n/ui/useUI";
import { listBoughtBayApps } from "../../../lib/bay/app-paid";
import { hiddenKey, listBayMineHidden } from "../../../lib/bay/mine-hidden";
import { listBoughtBayLessonOrders } from "../../../lib/bay/lessons";
import { formatBayFen } from "../../../lib/bay/money";
import { listBayOrders, orderStatusLabel } from "../../../lib/bay/orders";
import { useLedgerCurrency } from "../../../lib/money";
import { useBayMoneyLocale } from "../settings/money-ui";
import { openBay, useBaySignedIn } from "../shell/bay-state";
import { useMineBundle, type MinePaneProps } from "./mine-bundle";
import {
  categoryOfListingKind,
  isMergedPaidOrder,
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
  const locale = useBayMoneyLocale();
  const ledger = useLedgerCurrency();
  const bundle = useMineBundle(signedIn, loadBought, tt("列表没读出来，请稍后再试。"));
  const data = bundle.data;
  const rows: MineTradeRow[] = [];
  // 每一行都写付款金额：0 写「免费」，订单没定价写「面议」；课程 / 网站与软件服务的单子没有币种字段，用账本币种。
  const paid = (fen: number | null | undefined, currency?: string | null): string => {
    const value = Number(fen);
    if (fen === null || fen === undefined || !Number.isFinite(value)) return tt("面议");
    if (value <= 0) return tt("免费");
    return formatBayFen(value, currency || ledger, locale);
  };
  if (data) {
    for (const order of data.orders) {
      if (data.hidden.has(hiddenKey("order", order.id))) continue;
      const kind = categoryOfListingKind(data.serviceKinds[order.source_service_id || ""] || "service");
      if (!rowMatchesCategory(category, kind)) continue;
      rows.push({
        id: `order:${order.id}`,
        title: order.title || tt("订单"),
        subtitle: orderStatusLabel(tt, order.status),
        amount: paid(order.total_fen, order.currency),
        statementContractId: order.id,
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
        subtitle: tt(purchaseStatusText(row.status)),
        amount: paid(row.price_fen),
        statementContractId: row.contract_id || undefined,
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
        subtitle: tt(purchaseStatusText(row.status)),
        amount: paid(row.price_fen),
        statementContractId: row.contract_id || undefined,
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
        subtitle: tt(subscriptionStatusText(row.status)),
        amount: paid(row.price_fen),
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
