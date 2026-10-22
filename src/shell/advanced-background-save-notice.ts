"use client";

import { createElement, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_LOCALE, isLocale } from "../i18n/config";
import { EAS_W14_MESSAGES } from "../i18n/ui/messages/eas-w14-copy";
import { noticeSnapshot, subscribe } from "./advanced-background-saver";

// Shown only for failures that retrying cannot fix. Transient failures are
// retried automatically and never surface here; there is no button.
const BLOCKED_KEY = "有 {n} 份修改暂时无法保存，草稿已保留";
const AUTH_KEY = "登录已过期，重新登录后会自动保存 {n} 份修改";

function currentLocale() {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
}

function noticeCopy(zh: string, vars?: Record<string, string | number>): string {
  const dict = EAS_W14_MESSAGES[currentLocale()] || {};
  const template = dict[zh] || zh;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match,
  );
}

function NoticeBody() {
  const view = useSyncExternalStore(subscribe, noticeSnapshot, noticeSnapshot);
  if (view.failed <= 0 && !view.saved) return null;
  return createElement(
    "div",
    {
      "data-advanced-background-save-notice": true,
      "data-saved": view.saved && view.failed <= 0 ? "true" : undefined,
      className:
        "pointer-events-auto fixed bottom-4 right-4 z-[200] flex max-w-sm items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-[13px] text-neutral-900 shadow-lg",
    },
    view.failed > 0
      ? createElement(
          "span",
          { key: "msg" },
          view.auth >= view.failed
            ? noticeCopy(AUTH_KEY, { n: view.failed })
            : noticeCopy(BLOCKED_KEY, { n: view.failed }),
        )
      : createElement("span", { key: "saved" }, noticeCopy("已保存")),
  );
}

let root: Root | null = null;
let host: HTMLElement | null = null;

export function ensureBackgroundSaveNoticeMounted(): void {
  if (typeof document === "undefined" || !document.body) return;
  if (root) return;
  host = document.createElement("div");
  host.dataset.advancedBackgroundSaveNoticeHost = "";
  document.body.append(host);
  root = createRoot(host);
  root.render(createElement(NoticeBody));
}

export function unmountBackgroundSaveNoticeForTests(): void {
  if (!root) return;
  root.unmount();
  root = null;
  host?.remove();
  host = null;
}
