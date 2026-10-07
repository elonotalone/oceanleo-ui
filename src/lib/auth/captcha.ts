"use client";

// International login: Cloudflare Turnstile (official script, no npm widget).
// China (.cn): no widget and no token — phone/WeChat already gate the door,
// and the identity service is a single switch we must not flip.
// If the script never loads we return null so login still works while the
// Supabase captcha switch is off.

import { currentDomainFamily, type DomainFamily } from "../../contracts/domain-family";

/** Public sitekey (not a secret). Managed widget `oceanleo-login`, hostname oceanleo.com. */
export const TURNSTILE_SITEKEY = "0x4AAAAAAFK-cPFBHQyr7ke8";

export const CAPTCHA_VERIFYING_MESSAGE = "正在进行安全验证…";
export const CAPTCHA_FAILED_MESSAGE = "安全验证没有通过，请重试";
export const CAPTCHA_LOAD_FAILED_MESSAGE = "安全验证组件加载失败，请刷新页面重试";

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const ONLOAD_CALLBACK = "__oceanleoTurnstileOnload" as const;
const WIDGET_ATTR = "data-oceanleo-turnstile-id";

export const captchaConfig = {
  loadTimeoutMs: 8000,
};

interface TurnstileApi {
  render?(container: string | HTMLElement, params: Record<string, unknown>): string;
  reset?(widgetId: string): void;
  remove?(widgetId: string): void;
  execute?(widgetId: string, opts?: Record<string, unknown>): void;
  getResponse?(widgetId: string): string;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __oceanleoTurnstileOnload?: () => void;
  }
}

function inBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/** Visible check + token only outside China. */
export function captchaEnabledForFamily(family: DomainFamily = currentDomainFamily()): boolean {
  return family !== "cn" && TURNSTILE_SITEKEY.length > 0;
}

export function isCaptchaConfigured(): boolean {
  return captchaEnabledForFamily(currentDomainFamily());
}

export function turnstileScriptSrc(): string {
  const params = new URLSearchParams({ render: "explicit" });
  return `${TURNSTILE_SCRIPT}?${params.toString()}`;
}

export function mapCaptchaError(raw?: string | null): string | undefined {
  if (raw == null) return undefined;
  const text = String(raw).trim();
  if (!text) return undefined;
  if (/captcha/i.test(text) || text.includes("安全验证")) return CAPTCHA_FAILED_MESSAGE;
  return text;
}

function turnstileApi(): TurnstileApi | undefined {
  if (!inBrowser()) return undefined;
  return window.turnstile;
}

let loadPromise: Promise<void> | null = null;
let pendingVisibleToken: string | null = null;
let visibleWidgetId: string | undefined;
let visibleQueue: Promise<void> = Promise.resolve();

function loadScript(src: string): Promise<void> {
  if (turnstileApi()?.render) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("turnstile-load-timeout"));
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
    script.onerror = () => finish(new Error("turnstile-load-error"));
    const parent = document.head || document.body;
    if (!parent) {
      finish(new Error("turnstile-load-error"));
      return;
    }
    parent.appendChild(script);
  }).then(() => {
    if (!turnstileApi()?.render) throw new Error("turnstile-load-error");
  }).catch((err: unknown) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

export function peekCaptchaToken(): string | null {
  return pendingVisibleToken;
}

export function clearCaptchaToken(): void {
  pendingVisibleToken = null;
}

function widgetIdOn(container?: HTMLElement): string | undefined {
  const fromDom = container?.getAttribute?.(WIDGET_ATTR);
  if (fromDom) return fromDom;
  return visibleWidgetId;
}

function destroyVisibleWidget(api: TurnstileApi | undefined, container?: HTMLElement) {
  const id = widgetIdOn(container);
  if (id != null && api) {
    try {
      api.remove?.(id);
    } catch {
      /* already gone */
    }
    try {
      api.reset?.(id);
    } catch {
      /* already gone */
    }
  }
  visibleWidgetId = undefined;
  try {
    container?.removeAttribute?.(WIDGET_ATTR);
  } catch {
    /* detached */
  }
  try {
    container?.replaceChildren();
  } catch {
    /* detached */
  }
}

/**
 * Visible Turnstile on the international email first screen. One widget per
 * container: React Strict Mode / Fast Refresh remounts the same node.
 * Cleanup is synchronous so the effect can abort an in-flight load.
 */
export function mountCheckboxCaptcha(
  container: HTMLElement,
  onChange: (token: string | null) => void,
): () => void {
  const ac = new AbortController();
  const { signal } = ac;
  const job = visibleQueue.then(
    () => mountVisibleCaptchaNow(container, onChange, signal),
    () => mountVisibleCaptchaNow(container, onChange, signal),
  );
  visibleQueue = job.then(
    () => undefined,
    () => undefined,
  );
  return () => ac.abort();
}

async function mountVisibleCaptchaNow(
  container: HTMLElement,
  onChange: (token: string | null) => void,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted || !inBrowser() || !isCaptchaConfigured()) return;
  try {
    await loadScript(turnstileScriptSrc());
  } catch (err) {
    if (!signal.aborted) {
      console.warn("[oceanleo-auth] Turnstile unavailable", err);
      onChange(null);
    }
    return;
  }
  if (signal.aborted) return;
  const api = turnstileApi();
  if (!api?.render) {
    onChange(null);
    return;
  }
  const connected =
    typeof container.isConnected === "boolean" ? container.isConnected : true;
  if (!connected) {
    onChange(null);
    return;
  }
  destroyVisibleWidget(api, container);
  if (signal.aborted) return;
  const onAbort = () => {
    destroyVisibleWidget(turnstileApi(), container);
  };
  signal.addEventListener("abort", onAbort);
  const params: Record<string, unknown> = {
    sitekey: TURNSTILE_SITEKEY,
    theme: "light",
    size: "flexible",
    appearance: "always",
    callback: (token: string) => {
      pendingVisibleToken = token ? String(token) : null;
      onChange(pendingVisibleToken);
    },
    "expired-callback": () => {
      pendingVisibleToken = null;
      onChange(null);
    },
    "error-callback": () => {
      pendingVisibleToken = null;
      onChange(null);
    },
    "timeout-callback": () => {
      pendingVisibleToken = null;
      onChange(null);
    },
  };
  try {
    let id: string | undefined;
    try {
      id = api.render(container, params);
    } catch {
      destroyVisibleWidget(api, container);
      id = api.render(container, params);
    }
    visibleWidgetId = id;
    if (id) {
      try {
        container.setAttribute(WIDGET_ATTR, id);
      } catch {
        /* detached */
      }
    }
    if (signal.aborted) {
      destroyVisibleWidget(api, container);
      return;
    }
    if (pendingVisibleToken) onChange(pendingVisibleToken);
  } catch (err) {
    if (!signal.aborted) {
      console.warn("[oceanleo-auth] Turnstile render failed", err);
      onChange(null);
    }
  }
}

/** Visible-token first. Never throws; null means "send without token". China always null. */
export function getCaptchaToken(): Promise<string | null> {
  if (!captchaEnabledForFamily(currentDomainFamily())) {
    return Promise.resolve(null);
  }
  if (pendingVisibleToken) {
    const token = pendingVisibleToken;
    pendingVisibleToken = null;
    return Promise.resolve(token);
  }
  return Promise.resolve(null);
}
