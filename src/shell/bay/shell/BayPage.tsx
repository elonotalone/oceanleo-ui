"use client";

// 各站 `/bay` 页的导出名（各站路由一直 import 这个名字）：就是 LeoBay 页。
import { LeoBayPage, type LeoBayPageProps } from "./LeoBayPage";

export type BayPageProps = LeoBayPageProps;

export function BayPage(props: BayPageProps) {
  return <LeoBayPage {...props} />;
}
