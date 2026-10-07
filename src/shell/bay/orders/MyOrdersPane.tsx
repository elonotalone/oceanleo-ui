"use client";

// 「我的」→「订单」：按每单身份分开看我买的 / 我卖的，四组是进行中 / 待我处理 / 已完成 / 已取消。
// 窗格不自带返回键、标题栏、滚动（外框约定第 12 条）。空态分别带去逛服务或去发布服务。

import { useEffect, useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { getUserId } from "../../../lib/auth/client";
import { BayApiError } from "../../../lib/bay/http";
import {
  listBayOrders,
  nextActionText,
  orderAmountText,
  type BayOrder,
  type BayOrderGroup,
  type BayOrderRole,
} from "../../../lib/bay/orders";
import { openBay, type BayPaneProps } from "../shell/bay-state";
import {
  countOrderGroups,
  defaultOrderGroup,
  defaultOrderRole,
  MY_ORDER_GROUPS,
  visibleMyOrders,
} from "./my-orders-model";
import { useBayPaymentsGate } from "./order-store";
import { ORDER_BUTTON, ORDER_INPUT, OrderLoadError, OrderLoading, OrderSignIn, OrderStatusChip } from "./order-ui";

function groupLabel(tt: (zh: string) => string, group: BayOrderGroup): string {
  switch (group) {
    case "todo":
      return tt("待我处理");
    case "active":
      return tt("进行中");
    case "done":
      return tt("已完成");
    case "cancelled":
      return tt("已取消");
  }
}

export function MyOrdersPane({ target: _target, layout: _layout }: BayPaneProps) {
  const tt = useUI();
  const gate = useBayPaymentsGate();
  const [viewer, setViewer] = useState<string | null | undefined>(undefined);
  const [items, setItems] = useState<BayOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<BayOrderRole>("buyer");
  const [group, setGroup] = useState<BayOrderGroup>("active");
  const [query, setQuery] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let live = true;
    void getUserId()
      .then((id) => {
        if (live) setViewer(id);
      })
      .catch(() => {
        if (live) setViewer(null);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!viewer) return;
    let live = true;
    setError(null);
    void listBayOrders({ role: "all", limit: 200 })
      .then((rows) => {
        if (!live) return;
        setItems(rows);
        const nextRole = defaultOrderRole(rows);
        setRole(nextRole);
        setGroup(defaultOrderGroup(countOrderGroups(rows.filter((row) => row.my_role === nextRole), gate)));
      })
      .catch((err: unknown) => {
        if (!live) return;
        setItems([]);
        setError(err instanceof BayApiError && err.status === 401 ? "login" : err instanceof Error ? err.message : "订单信息暂时取不到。");
      });
    return () => {
      live = false;
    };
    // 身份与分组只在重新取数时按默认值落一次；付款闸只影响分组展示，不重取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, reloadTick]);

  const mine = useMemo(() => (items ?? []).filter((row) => row.my_role === role), [items, role]);
  const counts = useMemo(() => countOrderGroups(mine, gate), [mine, gate]);
  const visible = useMemo(() => visibleMyOrders(items ?? [], { role, group, query, gate }), [items, role, group, query, gate]);

  if (viewer === undefined) return <OrderLoading pane="mine-orders" />;
  if (!viewer || error === "login") {
    return <OrderSignIn pane="mine-orders" text={tt("登录后才能查看我的订单。")} />;
  }
  if (items === null) return <OrderLoading pane="mine-orders" />;
  if (error && error !== "login") {
    return <OrderLoadError pane="mine-orders" message={error} onRetry={() => setReloadTick((n) => n + 1)} />;
  }

  const emptyAll = mine.length === 0;
  const emptyGroup = !emptyAll && visible.length === 0;

  return (
    <section data-bay-pane="mine-orders" data-role={role} data-group={group} className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-2">
        {(["buyer", "seller"] as const).map((next) => (
          <button
            key={next}
            type="button"
            data-bay-role={next}
            data-selected={role === next ? "true" : "false"}
            onClick={() => {
              setRole(next);
              setGroup(defaultOrderGroup(countOrderGroups((items ?? []).filter((row) => row.my_role === next), gate)));
            }}
            className={
              "rounded-full px-3 py-1 text-[12.5px] " +
              (role === next ? "bg-neutral-900 text-white" : "border border-neutral-200 text-neutral-700 hover:bg-neutral-50")
            }
          >
            {next === "buyer" ? tt("我买的") : tt("我卖的")}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MY_ORDER_GROUPS.map((key) => (
          <button
            key={key}
            type="button"
            data-bay-group={key}
            data-selected={group === key ? "true" : "false"}
            onClick={() => setGroup(key)}
            className={
              "rounded-full px-2.5 py-1 text-[12px] " +
              (group === key ? "bg-sky-700 text-white" : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50")
            }
          >
            {groupLabel(tt, key)}
            <span className="ms-1 opacity-80">{counts[key]}</span>
          </button>
        ))}
      </div>
      <input
        data-bay-order-search
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={tt("搜索标题或对方名字")}
        className={ORDER_INPUT}
      />
      {emptyAll ? (
        <div data-bay-empty="all" className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-[13px] text-neutral-600">
          <p>{role === "buyer" ? tt("你还没有买过单。") : tt("你还没有卖出过单。")}</p>
          <button
            type="button"
            data-bay-action={role === "buyer" ? "browse-services" : "publish-service"}
            onClick={() =>
              openBay(role === "buyer" ? { kind: "feed", filter: { kind: "service" } } : { kind: "service-editor" })
            }
            className={"mt-3 " + ORDER_BUTTON}
          >
            {role === "buyer" ? tt("去逛服务") : tt("去发布服务")}
          </button>
        </div>
      ) : emptyGroup ? (
        <p data-bay-empty="group" className="px-1 py-6 text-center text-[13px] text-neutral-500">
          {tt("这一组暂时没有订单。")}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
          {visible.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                data-bay-order-row={order.id}
                onClick={() => openBay({ kind: "order", id: order.id })}
                className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-neutral-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-neutral-900">{order.title || tt("订单")}</p>
                  <p className="mt-0.5 truncate text-[12px] text-neutral-500">{nextActionText(tt, order, gate)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <OrderStatusChip status={order.status} />
                  <span className="text-[12.5px] font-medium text-neutral-800">{orderAmountText(tt, order)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
