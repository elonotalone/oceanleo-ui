"use client";

// ensureBayTerms：发需求、下单、报价、发布服务之前调（W04、W05、W06、W08）。
//   已同意当前版本 → true；没同意 → 弹条款窗，同意后 true、关掉 false；
//   没登录 → requireBayLogin() 弹现有登录框，返回 false（登录后用户再点一次）。
// 弹窗挂在 document.body 的独立根里，不依赖调用方在哪棵树里，所以自己读 `<html lang>`、自己加载词典。
import { createRoot } from "react-dom/client";
import { localeDir, type Locale } from "../../../i18n/config";
import { UIMessageProvider } from "../../../i18n/ui/messages/context";
import type { UIMessageDictionary } from "../../../i18n/ui/messages/runtime";
import {
  bayTermsUpToDate,
  fetchBayTermsCurrent,
  fetchBayTermsStatus,
  type BayTermsStatus,
} from "../../../lib/bay/terms";
import { bayEnabledHere, requireBayLogin } from "../shell/bay-state";
import { BayTermsDialog, type BayTermsScope } from "./BayTermsDialog";
import { bayUiLocale } from "./terms-text";

let activeFlow: Promise<boolean> | null = null;
const acceptedListeners = new Set<() => void>();

/** 条款在任何地方被同意后通知；设置里的「规则与条款」、BayTermsGate 据此刷新。 */
export function subscribeBayTermsAccepted(listener: () => void): () => void {
  acceptedListeners.add(listener);
  return () => {
    acceptedListeners.delete(listener);
  };
}

export function notifyBayTermsAccepted(): void {
  for (const listener of Array.from(acceptedListeners)) listener();
}

async function dialogMessages(locale: Locale): Promise<UIMessageDictionary> {
  if (locale === "zh") return {};
  try {
    const { loadUiMessages } = await import("../../../i18n/ui/messages/load");
    return await loadUiMessages(locale);
  } catch {
    return {};
  }
}

async function openBayTermsDialog(scope: BayTermsScope, status: BayTermsStatus): Promise<boolean> {
  if (typeof document === "undefined" || !document.body) return false;
  const locale = bayUiLocale();
  const messages = await dialogMessages(locale);
  return new Promise<boolean>((resolve) => {
    const host = document.createElement("div");
    host.dataset.bayTermsHost = scope;
    host.setAttribute("dir", localeDir(locale));
    document.body.appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      if (accepted) notifyBayTermsAccepted();
      resolve(accepted);
      // 在弹窗自己的点击回调里同步卸载会撞上 React 正在进行的提交，挪到下一拍。
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    root.render(
      <UIMessageProvider messages={messages}>
        <BayTermsDialog
          scope={scope}
          initialStatus={status}
          locale={locale}
          onCancel={() => finish(false)}
          onAccepted={() => finish(true)}
        />
      </UIMessageProvider>,
    );
  });
}

async function runBayTermsFlow(scope: BayTermsScope): Promise<boolean> {
  if (!bayEnabledHere()) return false;
  let status = await fetchBayTermsStatus();
  if (status.status === 401) {
    requireBayLogin();
    return false;
  }
  if (bayTermsUpToDate(status)) return true;
  if (!status.current) {
    const fetched = await fetchBayTermsCurrent();
    status = { ...status, current: fetched.current, error: fetched.current ? null : fetched.error || status.error };
  }
  return openBayTermsDialog(scope, status);
}

/** 同一时刻只弹一个条款窗：并发的调用共用同一个结果。 */
export function ensureBayTerms(scope: BayTermsScope): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!activeFlow) {
    activeFlow = runBayTermsFlow(scope === "seller" ? "seller" : "buyer")
      .catch(() => false)
      .finally(() => {
        activeFlow = null;
      });
  }
  return activeFlow;
}
