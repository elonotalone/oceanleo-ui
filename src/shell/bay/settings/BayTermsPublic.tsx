"use client";

// 条款页（门户 /legal/marketplace）上公开展示的 LeoBay 使用规则（网关当前版本）。
// 2026-10-23 leobay-projects 波：父 agent 先放占位，定下 props；W07 换成正式实现。
import type { ReactElement } from "react";

export interface BayTermsPublicProps {
  className?: string;
}

export function BayTermsPublic(_props: BayTermsPublicProps): ReactElement {
  return <div data-bay-terms-public="" />;
}
