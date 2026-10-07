"use client";

// 各站 `/bay` 页：就是 LeoChat 整页停在 LeoBay 栏。保留这个导出是为了各站现有的 /bay 路由不用改。
import { LeoChatPage } from "../../leochat/LeoChatPage";

export interface BayPageProps {
  siteKey: string;
  /** 站点主色：选中的类目用它填色。不传用黑色。 */
  accent?: string;
}

export function BayPage({ siteKey, accent }: BayPageProps) {
  return <LeoChatPage siteKey={siteKey} accent={accent} initialTab="bay" />;
}
