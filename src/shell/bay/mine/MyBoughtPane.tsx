"use client";

// 「我的」→「我买到的」：我作为买家的订单。
import { MyOrdersPane } from "../orders/MyOrdersPane";
import type { BayPaneProps } from "../shell/bay-state";

export function MyBoughtPane(props: BayPaneProps) {
  return (
    <section data-bay-pane="mine-bought">
      <MyOrdersPane {...props} fixedRole="buyer" />
    </section>
  );
}
