"use client";

// hCaptcha for OceanLeo login / OTP / password-reset. Official script only —
// no npm widget. Invisible execute(); if the script never loads we return null
// so login still works while the Supabase captcha switch is off.

import { currentDomainFamily, type DomainFamily } from "../../contracts/domain-family";

/** Public sitekey (not a secret). */
export const HCAPTCHA_SITEKEY = "f638949a-afa8-4142-8fbe-fb3abdeacf3a";

export const CAPTCHA_VERIFYING_MESSAGE = "正在进行安全验证…";
export const CAPTCHA_FAILED_MESSAGE = "安全验证没有通过，请重试";
export const CAPTCHA_LOAD_FAILED_MESSAGE = "安全验证组件加载失败，请刷新页面重试";

const GLOBAL_SCRIPT = "https://js.hcaptcha.com/1/api.js";
const CN_SCRIPT = "https://cn1.hcaptcha.com/1/api.js";
const CN_HOST = "https://cn1.hcaptcha.com";
const ONLOAD_CALLBACK = "__oceanleoHcaptchaOnload" as const;
const WIDGET_ELEMENT_ID = "oceanleo-hcaptcha";

export const captchaConfig = {
  loadTimeoutMs: 8000,
};

interface HCaptchaExecuteResult {
  response?: string;
  key?: string;
}

interface HCaptchaApi {
  render?(container: string | HTMLElement, params: Record<string, unknown>): string | number;
  execute?(
    widgetId?: string | number,
    opts?: { async: true },
  ): Promise<HCaptchaExecuteResult | string>;
  reset?(widgetId?: string | number): void;
}

declare global {
  interface Window {
    hcaptcha?: HCaptchaApi;
    __oceanleoHcaptchaOnload?: () => void;
  }
}

function inBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function isCaptchaConfigured(): boolean {
  return HCAPTCHA_SITEKEY.length > 0;
}

/** Script URL for a domain family. `cn` uses the mainland endpoint. */
export function hcaptchaScriptSrc(family: DomainFamily = "com"): string {
  const params = new URLSearchParams({ render: "explicit" });
  if (family === "cn") {
    params.set("apihost", CN_HOST);
    params.set("endpoint", CN_HOST);
    return `${CN_SCRIPT}?${params.toString()}`;
  }
  return `${GLOBAL_SCRIPT}?${params.toString()}`;
}

export function mapCaptchaError(raw?: string | null): string | undefined {
  if (raw == null) return undefined;
  const text = String(raw).trim();
  if (!text) return undefined;
  if (/captcha/i.test(text) || text.includes("安全验证")) return CAPTCHA_FAILED_MESSAGE;
  return text;
}

function hcaptchaApi(): HCaptchaApi | undefined {
  if (!inBrowser()) return undefined;
  return window.hcaptcha;
}

let loadPromise: Promise<void> | null = null;
let widgetId: string | number | undefined;
let tokenQueue: Promise<string | null> = Promise.resolve(null);

function loadScript(src: string): Promise<void> {
  if (hcaptchaApi()?.execute) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("hcaptcha-load-timeout"));
    }, captchaConfig.loadTimeoutMs);
    const finish = (err?: Error) => {
      window.clearTimeout(timeout);
      if (err) reject(err);
      else resolve();
    };
    window[ONLOAD_CALLBACK] = () => finish();
    const script = document.createElement("script");
    script.src = src.includes("?") ? `${src}&onload=${ONLOAD_CALLBACK}` : `${src}?onload=${ONLOAD_CALLBACK}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => finish(new Error("hcaptcha-load-error"));
    const parent = document.head || document.body;
    if (!parent) {
      finish(new Error("hcaptcha-load-error"));
      return;
    }
    parent.appendChild(script);
  }).then(() => {
    if (!hcaptchaApi()?.execute) throw new Error("hcaptcha-load-error");
  }).catch((err: unknown) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

function ensureWidget(api: HCaptchaApi): string | number | undefined {
  if (widgetId != null) return widgetId;
  let el = document.getElementById(WIDGET_ELEMENT_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = WIDGET_ELEMENT_ID;
    el.style.display = "none";
    (document.body || document.documentElement).appendChild(el);
  }
  if (typeof api.render === "function") {
    widgetId = api.render(el, {
      sitekey: HCAPTCHA_SITEKEY,
      size: "invisible",
    });
  }
  return widgetId;
}

async function obtainToken(): Promise<string | null> {
  if (!inBrowser() || !isCaptchaConfigured()) return null;
  try {
    await loadScript(hcaptchaScriptSrc(currentDomainFamily()));
    const api = hcaptchaApi();
    if (!api?.execute) {
      console.warn("[oceanleo-auth] hCaptcha API missing after load");
      return null;
    }
    const id = ensureWidget(api);
    const result = await api.execute(id, { async: true });
    const token = typeof result === "string" ? result : result?.response;
    try {
      api.reset?.(id);
    } catch {
      /* token already issued */
    }
    return token ? String(token) : null;
  } catch (err) {
    console.warn("[oceanleo-auth] hCaptcha unavailable", err);
    return null;
  }
}

/** Run the invisible challenge. Never throws; null means "send without token". */
export function getCaptchaToken(): Promise<string | null> {
  const run = tokenQueue.then(obtainToken, obtainToken);
  tokenQueue = run.then(
    () => null,
    () => null,
  );
  return run;
}
