/**
 * 家族嵌入编辑器（website / design / video）的开发槽覆盖。
 *
 * 生产宿主永远走 `workbench-routes.ts` 按当前家族拼出的正式域
 * （`https://website.oceanleo.com` 等），query / cookie / env 一律不看。
 * 只有 LeoDev 槽 `p-<32hex>.dev.oceanleo.com` 才读覆盖，且目标只许是：
 *   · 另一个 LeoDev 槽（`p-<32hex>.dev.oceanleo.com`）
 *   · 写死的 Hosted 编辑器 origin（`hosted-editor-origins.ts` 六条全串）
 *
 * 不按 `*.oceanleo.app` / `*.dev.oceanleo.com` 后缀推断：用户站、
 * `p*--base.oceanleo.app`、`evil.dev.oceanleo.com` 都进不来。
 *
 * UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md §8.3
 */

import { isHostedEditorOrigin } from "./hosted-editor-origins";
import {
  TRUSTED_EMBED_EDITOR_SANDBOX,
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
  isTrustedEmbedEditorBase,
} from "./editor-sandbox-origin";

/** 与 `workbench-routes.ts` / `editor-sandbox-origin.ts` 三条嵌入路径逐字相同。 */
export const FAMILY_EMBED_PATHS = {
  website: "/embed/site-editor",
  design: "/embed/editor",
  video: "/canvas-board",
} as const;

export type FamilyEmbedSubsite = keyof typeof FAMILY_EMBED_PATHS;

export const FAMILY_EMBED_ORIGIN_QUERY = "embed_origin";
export const FAMILY_EMBED_ORIGIN_QUERY_BY_SUBSITE = {
  website: "website_embed_origin",
  design: "design_embed_origin",
  video: "video_embed_origin",
} as const;
export const FAMILY_EMBED_ORIGIN_COOKIE = "embed_origin";
export const FAMILY_EMBED_ORIGIN_ENV = "NEXT_PUBLIC_FAMILY_EMBED_ORIGIN";

const LEO_DEV_HOST = /^p-[0-9a-f]{32}\.dev\.oceanleo\.com$/;
const FAMILY_EMBED_PATH_SET = new Set<string>(Object.values(FAMILY_EMBED_PATHS));

export interface FamilyEmbedOverrideInput {
  host: string;
  search?: string;
  cookieHeader?: string;
  envValue?: string;
}

export function normalizeEmbedHost(host: string | null | undefined): string {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .split(":")[0];
}

/** 与 `lib/auth/config.ts` 的 `isLeoDevPreviewHost` 同一条正则。 */
export function isFamilyEmbedOverrideHost(
  host: string | null | undefined,
): boolean {
  return LEO_DEV_HOST.test(normalizeEmbedHost(host));
}

function parseHttpsOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    if (url.port && url.port !== "443") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function hostnameOfOrigin(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}

/**
 * 覆盖目标是否可被 LeoDev 宿主接受。
 * `*.oceanleo.app` 只认 Hosted 编辑器全串，不认用户站 / UGC 预览。
 */
export function isAllowedFamilyEmbedOverrideOrigin(origin: string): boolean {
  const parsed = parseHttpsOrigin(origin);
  if (!parsed || parsed !== origin) return false;
  if (isHostedEditorOrigin(parsed)) return true;
  return isFamilyEmbedOverrideHost(hostnameOfOrigin(parsed));
}

function readCookieValue(cookieHeader: string, name: string): string {
  if (!cookieHeader || !name) return "";
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const cut = trimmed.indexOf("=");
    if (cut <= 0) continue;
    if (trimmed.slice(0, cut) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(cut + 1));
    } catch {
      return "";
    }
  }
  return "";
}

function familyEmbedSubsiteFromPath(
  pathname: string,
): FamilyEmbedSubsite | "" {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const [subsite, expected] of Object.entries(FAMILY_EMBED_PATHS)) {
    if (expected === path) return subsite as FamilyEmbedSubsite;
  }
  return "";
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) return candidate;
  }
  return "";
}

function overrideRawForBase(
  defaultBase: string,
  input: FamilyEmbedOverrideInput,
): string {
  if (!isFamilyEmbedOverrideHost(input.host)) return "";
  let pathname = "";
  try {
    pathname = new URL(defaultBase).pathname;
  } catch {
    return "";
  }
  const subsite = familyEmbedSubsiteFromPath(pathname);
  const params = new URLSearchParams(
    String(input.search || "").replace(/^\?/, ""),
  );
  const perSubsite = subsite
    ? params.get(FAMILY_EMBED_ORIGIN_QUERY_BY_SUBSITE[subsite]) || ""
    : "";
  return firstNonEmpty(
    perSubsite,
    params.get(FAMILY_EMBED_ORIGIN_QUERY) || "",
    readCookieValue(input.cookieHeader || "", FAMILY_EMBED_ORIGIN_COOKIE),
    input.envValue,
  );
}

function normalizedFamilyEmbedBase(base: string): string {
  try {
    const url = new URL(base);
    if (url.search || url.hash || url.username || url.password) return "";
    if (url.protocol !== "https:") return "";
    if (url.port && url.port !== "443") return "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

/** LeoDev 槽上的三条家族嵌入路径，才给第一方同源沙箱。 */
export function isLeoDevFamilyEmbedBase(base: string): boolean {
  const normalized = normalizedFamilyEmbedBase(base);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    if (!isFamilyEmbedOverrideHost(url.hostname)) return false;
    return FAMILY_EMBED_PATH_SET.has(url.pathname);
  } catch {
    return false;
  }
}

export function applyFamilyEmbedOriginOverride(
  defaultBase: string,
  input: FamilyEmbedOverrideInput,
): string {
  const fallback = defaultBase;
  const raw = overrideRawForBase(defaultBase, input);
  if (!raw) return fallback;
  const origin = parseHttpsOrigin(raw);
  if (!origin || !isAllowedFamilyEmbedOverrideOrigin(origin)) return fallback;
  try {
    const url = new URL(defaultBase);
    if (url.search || url.hash || url.username || url.password) return fallback;
    const path = url.pathname.replace(/\/+$/, "");
    if (!FAMILY_EMBED_PATH_SET.has(path)) return fallback;
    return `${origin}${path}`;
  } catch {
    return fallback;
  }
}

export function canLoadFamilyEmbedBase(base: string, host: string): boolean {
  if (isTrustedEmbedEditorBase(base)) return true;
  return isFamilyEmbedOverrideHost(host) && isLeoDevFamilyEmbedBase(base);
}

export function familyEmbedFrameSandbox(base: string, host: string): string {
  if (isTrustedEmbedEditorBase(base)) return embedEditorFrameSandbox(base);
  if (isFamilyEmbedOverrideHost(host) && isLeoDevFamilyEmbedBase(base)) {
    return TRUSTED_EMBED_EDITOR_SANDBOX;
  }
  return UNTRUSTED_FRAME_SANDBOX;
}

export function familyEmbedOverrideInputFromWindow(): FamilyEmbedOverrideInput {
  return {
    host: window.location.host,
    search: window.location.search,
    cookieHeader: document.cookie,
    envValue: process.env.NEXT_PUBLIC_FAMILY_EMBED_ORIGIN,
  };
}
