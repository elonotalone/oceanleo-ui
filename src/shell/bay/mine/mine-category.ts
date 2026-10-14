// 「我的」类别选择条的纯逻辑（不带组件，便于测试）。类别的名字与标签见 PublishedCategoryTag.tsx。
import type { PublishedCategory } from "./PublishedCategoryTag";

export type MineCategory = "all" | PublishedCategory;

/** 「我卖出的 / 我买到的」里订单能装进的类别：成品文件、人工服务、其他（订单按来源服务归类）。作品与课程有各自的一段。 */
export function ordersShownFor(category: MineCategory): boolean {
  return category === "all" || category === "digital" || category === "service" || category === "other";
}
