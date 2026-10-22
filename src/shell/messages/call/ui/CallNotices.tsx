"use client";

// 小窗与放大视图共用的提示行：连接状态（正在连接 / 正在重连 / 已结束 / 出错）、
// 「XX 在共享屏幕 · 查看」、「你正在共享屏幕 · 停止共享」、独处倒计时条（可取消）。
import { useUI, type UITranslate } from "../../../../i18n/ui/useUI";
import { callActions, type CallSnapshot } from "../engine";
import { runCallAction } from "./CallControls";
import { IconScreenShare } from "./icons";
import { aloneProgress, aloneSecondsLeft } from "./layout";

/** 引擎 / 网关的错误码 → 一句人话（合同 §3.2 错误码 + 引擎自己的几种）。认不得的码用引擎给的原话兜底。 */
export function callErrorText(tt: UITranslate, error: { code: string; message: string } | null, maxParticipants: number): string {
  if (!error) return "";
  switch (error.code) {
    case "not_member":
      return tt("你不在这个会话里，无法加入通话。");
    case "talent_not_supported":
      return tt("交易会话不支持通话。");
    case "call_full":
      return tt("通话人数已满（最多 {n} 人）。", { n: maxParticipants });
    case "call_unavailable":
      return tt("这通通话已经结束。");
    case "artc_not_configured":
      return tt("通话服务暂未开通，请稍后再试。");
    case "removed_from_conversation":
    case "call_kicked":
      return tt("你已不在这个会话里，通话已断开。");
    case "rate_limited":
      return tt("操作太频繁，请稍后再试。");
    case "artc_unsupported":
    case "artc_browser_unsupported":
      return tt("当前浏览器不支持通话，请换用最新版 Chrome、Edge 或 Safari。");
    case "alone_timeout":
      return tt("只剩你一个人，已自动离开通话。");
    case "network":
      return tt("网络连接中断，请检查网络后再试。");
    default:
      return error.message || tt("通话出了点问题，请稍后再试。");
  }
}

/** 阶段对应的一句状态；已连上且没出错时没有状态行。 */
export function phaseStatusText(tt: UITranslate, call: Pick<CallSnapshot, "phase" | "error" | "limits">): string {
  switch (call.phase) {
    case "joining":
      return tt("正在连接…");
    case "reconnecting":
      return tt("正在重连…");
    case "leaving":
      return tt("正在离开…");
    case "ended":
      return call.error ? callErrorText(tt, call.error, call.limits.maxParticipants) : tt("通话已结束");
    case "error":
      return callErrorText(tt, call.error, call.limits.maxParticipants) || tt("通话出了点问题，请稍后再试。");
    default:
      return call.error ? callErrorText(tt, call.error, call.limits.maxParticipants) : "";
  }
}

export function CallStatusLine({ call }: { call: Pick<CallSnapshot, "phase" | "error" | "limits"> }) {
  const tt = useUI();
  const text = phaseStatusText(tt, call);
  if (!text) return null;
  const warn = call.phase === "reconnecting" || call.phase === "error" || (call.phase !== "joining" && call.phase !== "leaving" && Boolean(call.error));
  return (
    <p
      role="status"
      data-call-status={call.phase}
      className={`rounded-lg px-2.5 py-1.5 text-[12px] leading-5 ${
        warn
          ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          : "bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-neutral-200"
      }`}
    >
      {text}
    </p>
  );
}

/** 别人在共享屏幕：「XX 在共享屏幕 · 查看」（小窗里出；点「查看」放大）。 */
export function ShareNotice({ name, onView }: { name: string; onView(): void }) {
  const tt = useUI();
  return (
    <div data-call-share-notice className="flex items-center gap-2 rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[12px] text-neutral-800 dark:bg-white/10 dark:text-neutral-100">
      <IconScreenShare size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {tt("{name} 在共享屏幕", { name })}
        <span aria-hidden="true"> · </span>
      </span>
      <button
        type="button"
        onClick={() => onView()}
        className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-sky-700 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300 dark:hover:bg-white/10"
      >
        {tt("查看")}
      </button>
    </div>
  );
}

/** 自己在共享：「你正在共享屏幕 · 停止共享」。 */
export function SelfShareNotice() {
  const tt = useUI();
  return (
    <div data-call-self-share className="flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
      <IconScreenShare size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{tt("你正在共享屏幕")}</span>
      <button
        type="button"
        onClick={() => runCallAction(() => callActions.setScreenShare(false))}
        className="shrink-0 rounded-md px-1.5 py-0.5 font-medium hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-white/10"
      >
        {tt("停止共享")}
      </button>
    </div>
  );
}

/**
 * 只剩自己 10 分钟后的 60 秒倒计时（合同 §1 A9）：到点引擎自动离开；「继续通话」= cancelAloneTimer。
 * 读屏只播一次整句（倒数的数字每秒变，不让它每秒念一遍）。
 */
export function AloneCountdown({ deadline, now }: { deadline: number | null; now: number }) {
  const tt = useUI();
  const seconds = aloneSecondsLeft(deadline, now);
  if (seconds === null) return null;
  return (
    <div data-call-alone={seconds} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[12px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      <p role="status" className="sr-only">
        {tt("只剩你一个人，通话即将自动结束。")}
      </p>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="min-w-0 flex-1">
          {tt("只剩你一个人，{seconds} 秒后自动离开", { seconds })}
        </span>
        <button
          type="button"
          data-call-alone-cancel
          onClick={() => callActions.cancelAloneTimer()}
          className="shrink-0 rounded-md bg-white px-2 py-1 font-medium text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:bg-white/10 dark:text-amber-200 dark:hover:bg-white/15"
        >
          {tt("继续通话")}
        </button>
      </div>
      <div aria-hidden="true" className="mt-1.5 h-1 overflow-hidden rounded-full bg-amber-100 dark:bg-white/10">
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${aloneProgress(seconds)}%` }} />
      </div>
    </div>
  );
}
