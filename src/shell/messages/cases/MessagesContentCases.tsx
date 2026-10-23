"use client";

// LeoChat 里的「内容处置」：针对本人内容的案件、反通知与申诉。
// 2026-10-23 leobay-projects 波：父 agent 先放占位，定下 props；W09 换成正式实现，W08 在 LeoChat 里挂它。
import type { ReactElement } from "react";

export interface MessagesContentCasesProps {
  /** 打开时直接展开这一件；不给则列出全部。 */
  caseId?: string | null;
  /** 窄屏/小窗里的返回。 */
  onBack?: () => void;
}

export function MessagesContentCases(_props: MessagesContentCasesProps): ReactElement {
  return <div data-messages-content-cases="" />;
}
