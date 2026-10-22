// W08 · 来电浮层（合同 §3.9 导出名，签名不许改）。由 MessagesHost 全局挂载。
export { IncomingCallHost } from "./IncomingCallHost";

// LeoChat 整页的推送深链（`/leochat?c=<cid>&call=<call_id>`，合同 §3.3）。
export { consumeCallDeepLink, parseCallDeepLink } from "./deep-link";
