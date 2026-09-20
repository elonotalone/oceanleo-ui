"use client";

// ============================================================================
// @oceanleo/ui — MCP Apps 宿主侧桥接（W14，2026-09-20）
// ----------------------------------------------------------------------------
// 这层不碰 DOM，只管四件事：
//   1. 能力协商的宿主声明（`hostCapabilities()`）；
//   2. 从网关拿「此人可用、且带 `_meta.ui.resourceUri` 的工具」（`listAppTools`）；
//   3. `resources/read` 取 `ui://` HTML，**同一 (连接, uri) 只取一次**（Promise 级缓存：
//      并发两次也只打一枪），MIME 不是 `text/html;profile=mcp-app` 就当没有界面；
//   4. 把界面的 `tools/call` 代理回网关（`callAppTool`）；错误与超时统一收口。
//
// 降级是**默认路径而不是异常路径**：网关今天还没有这几个端点（journal 11:33），
// `listAppTools()` 拿到 404 / 网络错就返回 `[]`，`ComposerAppsBar` 因此一个字节
// 都不渲染；`readAppResource()` 拿不到就返回 `null`，`AppFrame` 因此显示纯文本。
// 任何一条路都不抛到界面上、不弹窗、不白屏。
//
// 传输层可注入（`McpAppsTransport`）：测试打替身；生产用 `gatewayTransport()`——
// 基址与 token 取法复用 `../../lib/auth/config` 与 `../../lib/auth/client`，
// 与 `org-api.ts` 同一口径，不另起一套会话模型。
// ============================================================================

import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import {
  type AppTool,
  type AppUiMeta,
  MAX_APP_HTML_BYTES,
  MCP_APP_RESOURCE_MIME,
  MCP_APPS_CAPABILITY_KEY,
  MCP_APPS_SANDBOX_ORIGINS,
  appToolsFrom,
  isUiResourceUri,
  isValidAppSandboxOrigin,
  recordValue,
} from "./protocol";

/**
 * 网关路径（**建议路径**，后端归 W08 / 父 agent；三条今天都不存在，宿主按它们打，
 * 404 一律当零可用）。改这里必须同时改 delivery 里写给后端的契约。
 */
export const MCP_APPS_GATEWAY_PATHS = Object.freeze({
  /** GET → `{ tools: [...] }`，每行带 `connector_id`、`name`、`title?`、`description?`、`_meta.ui`。 */
  TOOLS: "/v1/mcp/apps/tools",
  /** POST `{ connector_id, uri }` → `{ contents: [{ uri, mimeType, text, _meta? }] }`。 */
  RESOURCES_READ: "/v1/mcp/apps/resources/read",
  /** POST `{ connector_id, name, arguments }` → MCP `CallToolResult`。 */
  TOOLS_CALL: "/v1/mcp/apps/tools/call",
} as const);

export const DEFAULT_APP_TIMEOUT_MS = 15_000;

export interface McpAppsTransport {
  listTools(): Promise<unknown>;
  readResource(connectorId: string, uri: string): Promise<unknown>;
  callTool(connectorId: string, name: string, args: Record<string, unknown>): Promise<unknown>;
}

/** `resources/read` 归一化后的结果。`html` 已过 MIME 与体积检查。 */
export interface AppResource {
  uri: string;
  html: string;
  csp?: AppUiMeta["csp"];
}

export type AppRenderMode = "frame" | "text";

export interface McpAppsHostOptions {
  transport?: McpAppsTransport;
  timeoutMs?: number;
  /** 承载面白名单注入点（测试用；生产恒为 `MCP_APPS_SANDBOX_ORIGINS`）。 */
  allowedOrigins?: readonly string[];
}

export interface McpAppsHost {
  /** `ui/initialize` 应答里的 hostCapabilities。 */
  hostCapabilities(): Record<string, unknown>;
  /** 此人可用、带界面的工具。任何失败 → `[]`。 */
  listAppTools(): Promise<AppTool[]>;
  /** 取 `ui://` HTML；同一 (连接, uri) 只取一次。任何失败 / 不是 mcp-app MIME → `null`。 */
  readAppResource(tool: Pick<AppTool, "connectorId" | "ui">): Promise<AppResource | null>;
  /** 代理 `tools/call` 回网关。失败抛 `Error`（由 AppFrame 转成 JSON-RPC error 回给界面）。 */
  callAppTool(connectorId: string, name: string, args: Record<string, unknown>): Promise<unknown>;
  /** 这条工具此刻该用 iframe 还是纯文本。 */
  renderModeFor(resource: AppResource | null, sandboxOrigin?: string): AppRenderMode;
  /** 承载面 origin（白名单第一项；空表 = `""` = 恒纯文本）。 */
  sandboxOrigin(): string;
  /** 缓存里有多少条资源（测试判「只取一次」用）。 */
  cachedResourceCount(): number;
  clearCache(): void;
}

class AppTimeoutError extends Error {
  constructor(what: string) {
    super(`${what} timed out`);
    this.name = "AppTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return new Promise<T>((resolve, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new AppTimeoutError(what)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        rejectPromise(error);
      },
    );
  });
}

/** 网关回来的 `tools` 可能包在 `{ tools }` / `{ items }` 里，也可能就是数组。 */
function toolRowsOf(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload;
  const record = recordValue(payload);
  if (!record) return [];
  if (Array.isArray(record.tools)) return record.tools;
  if (Array.isArray(record.items)) return record.items;
  return [];
}

/**
 * `resources/read` 的结果 → `AppResource | null`。只认第一条 `contents`，且它的
 * `mimeType` 必须**恰是** `text/html;profile=mcp-app`（不做前缀放宽：`text/html`
 * 不带 profile 的资源不是 MCP App，按规范该退化为纯文本）。
 */
export function appResourceFrom(payload: unknown, expectedUri: string): AppResource | null {
  const record = recordValue(payload);
  const contents = record ? record.contents : undefined;
  if (!Array.isArray(contents) || contents.length === 0) return null;
  const first = recordValue(contents[0]);
  if (!first) return null;
  const mime = typeof first.mimeType === "string" ? first.mimeType.trim().toLowerCase() : "";
  if (mime !== MCP_APP_RESOURCE_MIME) return null;
  const uri = typeof first.uri === "string" && isUiResourceUri(first.uri) ? first.uri : expectedUri;
  if (uri !== expectedUri) return null;
  const html = first.text;
  if (typeof html !== "string" || !html || html.length > MAX_APP_HTML_BYTES) return null;
  const meta = recordValue(first._meta);
  const ui = recordValue(meta?.ui);
  const cspRecord = recordValue(ui?.csp);
  const csp = cspRecord
    ? {
        connectDomains: stringList(cspRecord.connectDomains),
        resourceDomains: stringList(cspRecord.resourceDomains),
      }
    : undefined;
  return { uri, html, csp };
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string").slice(0, 32);
}

/** 生产传输层：打网关，带 Bearer。`fetch` 可注入（测试）。 */
export function gatewayTransport(deps: {
  fetch?: typeof fetch;
  baseUrl?: string;
  token?: () => Promise<string | null>;
} = {}): McpAppsTransport {
  const baseUrl = deps.baseUrl ?? GATEWAY_BASE;
  const token = deps.token ?? accessToken;
  const doFetch = deps.fetch ?? (typeof fetch === "function" ? fetch : undefined);

  async function request(path: string, init?: { method?: string; body?: unknown }): Promise<unknown> {
    if (!doFetch) throw new Error("fetch unavailable");
    const bearer = await token();
    // 没登录就不打：MCP 连接是按人的，网关对匿名请求只会回 401。这也让没配
    // Supabase 的环境（测试台、静态构建）一次网络请求都不发。
    if (!bearer) throw new Error("signed_out");
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${bearer}`,
    };
    if (init?.body !== undefined) headers["content-type"] = "application/json";
    const res = await doFetch(`${baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "omit",
    });
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    return res.json();
  }

  return {
    listTools: () => request(MCP_APPS_GATEWAY_PATHS.TOOLS),
    readResource: (connectorId, uri) =>
      request(MCP_APPS_GATEWAY_PATHS.RESOURCES_READ, {
        method: "POST",
        body: { connector_id: connectorId, uri },
      }),
    callTool: (connectorId, name, args) =>
      request(MCP_APPS_GATEWAY_PATHS.TOOLS_CALL, {
        method: "POST",
        body: { connector_id: connectorId, name, arguments: args },
      }),
  };
}

export function createMcpAppsHost(options: McpAppsHostOptions = {}): McpAppsHost {
  const transport = options.transport ?? gatewayTransport();
  const timeoutMs = options.timeoutMs ?? DEFAULT_APP_TIMEOUT_MS;
  const allowed = options.allowedOrigins ?? MCP_APPS_SANDBOX_ORIGINS;
  const cache = new Map<string, Promise<AppResource | null>>();

  const cacheKey = (connectorId: string, uri: string) => `${connectorId}\n${uri}`;

  return {
    hostCapabilities() {
      return { [MCP_APPS_CAPABILITY_KEY]: {} };
    },

    async listAppTools() {
      try {
        const payload = await withTimeout(transport.listTools(), timeoutMs, "tools/list");
        return appToolsFrom(toolRowsOf(payload));
      } catch {
        return [];
      }
    },

    readAppResource(tool) {
      const uri = tool.ui.resourceUri;
      if (!isUiResourceUri(uri) || !tool.connectorId) return Promise.resolve(null);
      const key = cacheKey(tool.connectorId, uri);
      const hit = cache.get(key);
      if (hit) return hit;
      const pending = withTimeout(
        transport.readResource(tool.connectorId, uri),
        timeoutMs,
        "resources/read",
      )
        .then((payload) => {
          const resource = appResourceFrom(payload, uri);
          // 工具行上的 csp 是主声明；资源体里的只在工具行没给时补位。
          if (resource && !resource.csp && tool.ui.csp) resource.csp = tool.ui.csp;
          return resource;
        })
        .catch(() => {
          // 失败不留在缓存里：下一次点开再试一次，而不是把「网关抖了一下」记成永久没界面。
          cache.delete(key);
          return null;
        });
      cache.set(key, pending);
      return pending;
    },

    callAppTool(connectorId, name, args) {
      if (!connectorId || !name) return Promise.reject(new Error("bad tool ref"));
      return withTimeout(transport.callTool(connectorId, name, args ?? {}), timeoutMs, "tools/call");
    },

    renderModeFor(resource, sandboxOrigin = allowed[0] ?? "") {
      if (!resource) return "text";
      return isValidAppSandboxOrigin(sandboxOrigin, allowed) ? "frame" : "text";
    },

    sandboxOrigin() {
      return allowed[0] ?? "";
    },

    cachedResourceCount() {
      return cache.size;
    },

    clearCache() {
      cache.clear();
    },
  };
}
