// 「先聊聊」「联系发布者」「和报价人聊」「发消息」「求助会话」的统一入口：没登录先登录；按主题找或建会话，
// 然后在 Bay 里打开。失败时抛出带中文原文的错误，调用方用 `tt(error.message)` 显示。

import { findOrCreateDealThread, type DealSubject } from "../../../lib/bay/threads";
import { openBay, requireBayLogin } from "../shell/bay-state";

export async function openTradeThread(subject: DealSubject): Promise<void> {
  if (!requireBayLogin()) return;
  const threadId = await findOrCreateDealThread(subject);
  openBay({ kind: "conversation", threadId });
}
