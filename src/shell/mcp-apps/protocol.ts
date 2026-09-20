// ============================================================================
// oceanleo.mcp-apps.v1 —— MCP Apps 宿主协议（W14，2026-09-20）
// ----------------------------------------------------------------------------
// MCP Apps（2026-01-26 稳定扩展）：MCP 服务器把一个工具和一段 `ui://` HTML 绑在
// 一起，宿主在对话里用沙箱 iframe 渲染，界面里的按钮再回调工具。双向通信是
// `ui/*` JSON-RPC over postMessage。本文件只定义**宿主这一侧**认什么、拒什么。
//
// 与 `editor-protocol.ts` 的关系：形状照抄（三段闸门 source / origin / 白名单），
// 但**不 import 它的实现**——两套协议各自演进。信任边界的判定函数
// （`isUntrustedContentHostname` 等）来自 `editor-sandbox-origin.ts`，那是全家桶
// 唯一的事实源，不另抄。
//
// ── 安全前提（`_COMMON.md §3.10`，本任务的最高优先级）─────────────────────
//  1. 第三方 MCP 服务器给的 HTML 是**不可信内容**，只能在 `oceanleo.app` 域的
//     iframe 里跑，永远不在 `oceanleo.com` 上执行。
//  2. `allow-scripts` 与 `allow-same-origin` 不得同时出现。
//  3. postMessage 双向校验 origin，`targetOrigin` 不得为 `*`。
//
// ── 一条浏览器语义决定了整个形状 ────────────────────────────────────────────
// iframe 的 `sandbox` 里没有 `allow-same-origin`，这个 frame 的 origin 就是
// **opaque**：宿主收到它的消息时 `event.origin === "null"`；而宿主用任何具体的
// `targetOrigin`（比如 `https://x.oceanleo.app`）`postMessage` 给它，浏览器都会
// 静默丢弃——opaque origin 不与任何 origin 同源。所以「不给 same-origin」+
// 「targetOrigin 不为 *」+「宿主要往 frame 里投消息」三件事在单层
// `window.postMessage` 上不可能同时成立。
//
// 解法：**frame 先手**。frame 加载后向宿主发一条 hello，随消息带一个
// `MessagePort`（`event.ports[0]`）；宿主对 hello 过三段闸门后收下端口，之后
// 宿主→frame 的每一条消息都走 `port.postMessage(msg)`。端口是点对点的，绑定在
// 发出它的那份文档上，没有 targetOrigin 这个概念，frame 导航走了端口就死——
// 比 `*` 严格得多。frame→宿主也走同一个端口。宿主**从不**对 frame 调
// `window.postMessage`。
// ============================================================================

import {
  UNTRUSTED_FRAME_SANDBOX,
  isUntrustedContentHostname,
  sandboxGrantsScriptedSameOrigin,
  sandboxTokens,
} from "../editor-sandbox-origin";
import { isCurrentFamilyFirstPartyHost } from "../../contracts/domain-family";

export const MCP_APPS_PROTOCOL = "oceanleo.mcp-apps.v1";

/** 能力协商键（MCP Apps 规范）。宿主在 `ui/initialize` 的结果里回它。 */
export const MCP_APPS_CAPABILITY_KEY = "io.modelcontextprotocol/ui";

/** `ui://` 资源的 MIME。`resources/read` 回来的不是它就当没有界面，退化为纯文本。 */
export const MCP_APP_RESOURCE_MIME = "text/html;profile=mcp-app";

export const UI_RESOURCE_SCHEME = "ui://";

// ── `ui/*` 方法名（宿主认的全部；改这里必须同时改测试里的全集清单）───────────
export const UI_METHODS = Object.freeze({
  /** app → host（request）：能力协商。宿主回 `{ protocolVersion, hostCapabilities }`。 */
  INITIALIZE: "ui/initialize",
  /** app → host（notification）：初始化完成，宿主随后推 tool-input / tool-result。 */
  INITIALIZED: "ui/notifications/initialized",
  /** host → app（notification）：这次工具调用的入参。 */
  TOOL_INPUT: "ui/notifications/tool-input",
  /** host → app（notification）：这次工具调用的结果。 */
  TOOL_RESULT: "ui/notifications/tool-result",
  /** app → host（request）：界面按钮回调工具。宿主代理回网关，不在浏览器里直连 MCP 服务器。 */
  TOOLS_CALL: "tools/call",
  /** app → host（request）：往对话里追加一句话。 */
  MESSAGE: "ui/message",
  /** app → host（request）：更新模型上下文（界面里发生的、模型该知道的状态）。 */
  UPDATE_MODEL_CONTEXT: "ui/update-model-context",
  /** app → host（notification）：界面想要的尺寸。 */
  SIZE_CHANGED: "ui/notifications/size-changed",
  /**
   * host → sandbox-proxy（notification，**本宿主私有**，不在 MCP Apps 规范里）：
   * 端口握手之后宿主把 `ui://` HTML 与算好的 CSP 交给 `oceanleo.app` 上的
   * proxy 页，proxy 再用 `srcdoc` + `MCP_APP_FRAME_SANDBOX` 装它。proxy 页
   * 自己是 opaque origin、没有任何凭据，HTML 只能由宿主经端口递进去。
   */
  SANDBOX_LOAD: "ui/notifications/sandbox-load",
} as const);

/**
 * app → host 的白名单。**没有** `proxy-fetch` / `http-request` / `eval` 这类通用
 * 代理形态：`tools/call` 只带 `name` + `arguments`，由网关按此人的连接鉴权后转发。
 */
export const APP_TO_HOST_METHODS: ReadonlySet<string> = new Set<string>([
  UI_METHODS.INITIALIZE,
  UI_METHODS.INITIALIZED,
  UI_METHODS.TOOLS_CALL,
  UI_METHODS.MESSAGE,
  UI_METHODS.UPDATE_MODEL_CONTEXT,
  UI_METHODS.SIZE_CHANGED,
]);

/** host → app 的白名单（通知）。宿主对 app 请求的应答另走 JSON-RPC response。 */
export const HOST_TO_APP_METHODS: ReadonlySet<string> = new Set<string>([
  UI_METHODS.TOOL_INPUT,
  UI_METHODS.TOOL_RESULT,
  UI_METHODS.SANDBOX_LOAD,
]);

// ── 沙箱 ─────────────────────────────────────────────────────────────────────

/**
 * 装 MCP 服务器 HTML 的 frame 的沙箱：**只有**脚本与表单。
 * 比 `UNTRUSTED_FRAME_SANDBOX` 还少 `allow-popups` / `allow-downloads`：
 * 聊天框下的一排按钮没有理由开新窗口或往用户电脑里写文件。
 * 令牌集合必须是 `UNTRUSTED_FRAME_SANDBOX` 的子集，由测试锁死。
 */
export const MCP_APP_FRAME_SANDBOX = "allow-scripts allow-forms";

/** 上面这档沙箱下 frame 的 `event.origin` 字面值：opaque origin 序列化成字符串就是它。 */
export const MCP_APP_FRAME_OPAQUE_ORIGIN = "null";

/**
 * 允许承载 MCP App 的 sandbox-proxy origin **全串**白名单（形状照
 * `hosted-editor-origins.ts`：写死完整 `https://host`，不做后缀推断）。
 *
 * **本轮为空。** 往这里加一行 = 允许宿主把一个 `oceanleo.app` 上的页面当作
 * MCP App 的承载面并给它拼 src；那个页面必须是我方部署的 sandbox-proxy
 * （它再用 `srcdoc` + `MCP_APP_FRAME_SANDBOX` 装第三方 HTML）。加之前要操作员
 * 批准（`_COMMON.md §2.3` / 任务书「禁区」）。空表 = `AppFrame` fail closed，
 * 恒走纯文本降级——这是设计好的默认，不是缺陷。
 */
export const MCP_APPS_SANDBOX_ORIGINS: readonly string[] = Object.freeze([]);

function canonicalHttpsOrigin(origin: string): URL | null {
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin) return null;
    if (parsed.protocol !== "https:" || parsed.port) return null;
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 这个 origin 是否可以作为 MCP App 的承载面。三件事同时成立：
 *   1. 规范化 https origin（无端口、无凭据、无路径）；
 *   2. 主机在**不可信内容域**上（`oceanleo.app` / `leoapp.cn`）——第一方主机
 *      永远不行：`oceanleo.com` 上跑第三方 HTML 就是把 SSO cookie 域交出去；
 *   3. 命中全串白名单。
 * 第二条是「就算有人往白名单里写了 `https://oceanleo.com`，这里也拒」的兜底。
 */
export function isValidAppSandboxOrigin(
  origin: string,
  allowed: readonly string[] = MCP_APPS_SANDBOX_ORIGINS,
): boolean {
  const parsed = canonicalHttpsOrigin(origin);
  if (!parsed) return false;
  if (!isUntrustedContentHostname(parsed.hostname)) return false;
  if (isCurrentFamilyFirstPartyHost(parsed.hostname)) return false;
  return allowed.includes(origin);
}

/**
 * 宿主若要对某个 window 调 `postMessage`，targetOrigin 必须过这里。
 * `*` 直接拒；第一方 origin 拒（宿主不会往自己家投 App 消息）；只有白名单里
 * 的承载面 origin 放行。**本设计下宿主对 frame 一次也不调 `window.postMessage`**
 * （全走 MessagePort），这个函数是给未来任何投递路径的闸，以及测试的判据。
 */
export function isValidAppTargetOrigin(
  origin: string,
  allowed: readonly string[] = MCP_APPS_SANDBOX_ORIGINS,
): boolean {
  if (origin === "*" || origin === "/" || !origin) return false;
  return isValidAppSandboxOrigin(origin, allowed);
}

/** 沙箱串是否满足本协议：不给 same-origin，且是 `UNTRUSTED_FRAME_SANDBOX` 的子集。 */
export function isAcceptableAppFrameSandbox(sandbox: string): boolean {
  if (sandboxGrantsScriptedSameOrigin(sandbox)) return false;
  const tokens = sandboxTokens(sandbox);
  if (tokens.has("allow-same-origin")) return false;
  const ceiling = sandboxTokens(UNTRUSTED_FRAME_SANDBOX);
  for (const token of tokens) if (!ceiling.has(token)) return false;
  return true;
}

// ── 消息形状 ─────────────────────────────────────────────────────────────────

export type JsonRpcId = number | string;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type AppToHostMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

/** frame 先手的那条 hello（走 `window.postMessage`，随带 `MessagePort`）。 */
export interface AppFrameHello {
  protocol: typeof MCP_APPS_PROTOCOL;
  instanceId: string;
  type: "hello";
}

/** `tools/list` 里带界面的工具的 `_meta.ui`。 */
export interface AppUiMeta {
  resourceUri: string;
  csp?: {
    connectDomains?: string[];
    resourceDomains?: string[];
  };
}

export interface AppTool {
  /** 这条工具来自此人的哪一个 MCP 连接（网关按它鉴权与计费）。 */
  connectorId: string;
  name: string;
  title?: string;
  description?: string;
  ui: AppUiMeta;
}

/** 单条消息的体积上限。App 界面没有理由一次塞 200 KB 进宿主。 */
export const MAX_APP_MESSAGE_BYTES = 200_000;
export const MAX_ID_LENGTH = 128;

export function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function boundedString(value: unknown, max: number, required = false): boolean {
  if (value === undefined || value === null) return !required;
  return typeof value === "string" && value.length <= max && (!required || value.length > 0);
}

function withinBudget(value: unknown): boolean {
  try {
    return JSON.stringify(value).length <= MAX_APP_MESSAGE_BYTES;
  } catch {
    return false;
  }
}

function validId(value: unknown): value is JsonRpcId {
  if (typeof value === "number") return Number.isSafeInteger(value);
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/**
 * hello 的三段闸门：source 必须是本 frame 的 contentWindow；origin 必须**等于**
 * 预期值——沙箱 frame 的预期值就是 `"null"`，未来若承载面拿到真 origin，则必须
 * 命中 `isValidAppSandboxOrigin`；信封 protocol / instanceId / type 逐字对。
 * 通过则返回随消息来的那一个 `MessagePort`；恰好一个，多一个少一个都拒。
 */
export function acceptAppFrameMessage(
  event: {
    origin: string;
    source: unknown;
    data: unknown;
    ports?: ReadonlyArray<unknown> | null;
  },
  gate: {
    expectedOrigin: string;
    frameWindow: unknown;
    instanceId: string;
    allowedOrigins?: readonly string[];
  },
): MessagePort | null {
  if (!gate.frameWindow || event.source !== gate.frameWindow) return null;
  if (!gate.expectedOrigin || gate.expectedOrigin === "*") return null;
  const expectedIsOpaque = gate.expectedOrigin === MCP_APP_FRAME_OPAQUE_ORIGIN;
  if (
    !expectedIsOpaque &&
    !isValidAppSandboxOrigin(gate.expectedOrigin, gate.allowedOrigins)
  ) {
    return null;
  }
  if (event.origin !== gate.expectedOrigin) return null;
  const hello = asAppFrameHello(event.data, gate.instanceId);
  if (!hello) return null;
  const ports = event.ports ?? [];
  if (ports.length !== 1) return null;
  const port = ports[0];
  if (!port || typeof (port as MessagePort).postMessage !== "function") return null;
  return port as MessagePort;
}

export function asAppFrameHello(data: unknown, instanceId: string): AppFrameHello | null {
  const record = recordValue(data);
  if (!record) return null;
  if (record.protocol !== MCP_APPS_PROTOCOL) return null;
  if (!boundedString(instanceId, MAX_ID_LENGTH, true)) return null;
  if (record.instanceId !== instanceId) return null;
  if (record.type !== "hello") return null;
  return record as unknown as AppFrameHello;
}

/**
 * 端口上收到的 app → host 消息。JSON-RPC 2.0；方法名走白名单（fail closed）；
 * response 只认形状，`id` 是否是宿主发出去过的由 host.ts 用待答表判。
 */
export function asAppToHostMessage(data: unknown): AppToHostMessage | null {
  const record = recordValue(data);
  if (!record || record.jsonrpc !== "2.0") return null;
  if (!withinBudget(record)) return null;
  const hasMethod = typeof record.method === "string";
  const hasId = record.id !== undefined;
  if (hasMethod) {
    const method = record.method as string;
    if (!APP_TO_HOST_METHODS.has(method)) return null;
    if (record.params !== undefined && !recordValue(record.params)) return null;
    if (hasId && !validId(record.id)) return null;
    if (method === UI_METHODS.TOOLS_CALL) {
      const params = recordValue(record.params);
      if (!params || !boundedString(params.name, 200, true)) return null;
      if (params.arguments !== undefined && !recordValue(params.arguments)) return null;
      if (!hasId) return null; // tools/call 必须是 request，宿主要回结果
    }
    if (method === UI_METHODS.MESSAGE) {
      const params = recordValue(record.params);
      if (!params || !boundedString(params.text, 20_000, true)) return null;
      if (!hasId) return null;
    }
    if (method === UI_METHODS.UPDATE_MODEL_CONTEXT) {
      const params = recordValue(record.params);
      if (!params) return null;
      if (!hasId) return null;
    }
    if (method === UI_METHODS.INITIALIZE && !hasId) return null;
    return record as unknown as JsonRpcRequest | JsonRpcNotification;
  }
  // response：必须有 id，且 result / error 恰有其一
  if (!hasId || !validId(record.id)) return null;
  const hasResult = record.result !== undefined;
  const error = recordValue(record.error);
  if (hasResult === Boolean(error)) return null;
  if (error && (typeof error.code !== "number" || !boundedString(error.message, 1_000, true))) {
    return null;
  }
  return record as unknown as JsonRpcResponse;
}

/** host → app 通知。宿主自己发的也过一遍白名单：防止别处顺手加一个新方法。 */
export function hostNotification(
  method: string,
  params: Record<string, unknown>,
): JsonRpcNotification | null {
  if (!HOST_TO_APP_METHODS.has(method)) return null;
  const message: JsonRpcNotification = { jsonrpc: "2.0", method, params };
  return withinBudget(message) ? message : null;
}

/** `ui://` HTML 的体积上限。一段聊天框下的界面不该有 1 MB。 */
export const MAX_APP_HTML_BYTES = 1_000_000;

/**
 * 握手后宿主递给 proxy 的那一条：HTML + 已算好的 CSP 串 + 资源 uri。
 * 不走 `hostNotification()` 的 200 KB 消息预算（HTML 单独按 `MAX_APP_HTML_BYTES`
 * 卡），但方法名同样必须在 `HOST_TO_APP_METHODS` 里。CSP 必须由
 * `buildAppFrameCsp()` 算出来再传进来：这里不接受任意串，形状对不上就拒。
 */
export function sandboxLoadNotification(input: {
  html: string;
  csp: string;
  resourceUri: string;
}): JsonRpcNotification | null {
  if (typeof input.html !== "string" || !input.html || input.html.length > MAX_APP_HTML_BYTES) {
    return null;
  }
  if (!isUiResourceUri(input.resourceUri)) return null;
  if (typeof input.csp !== "string" || !input.csp.startsWith("default-src 'none'")) return null;
  return {
    jsonrpc: "2.0",
    method: UI_METHODS.SANDBOX_LOAD,
    params: { html: input.html, csp: input.csp, resourceUri: input.resourceUri },
  };
}

// ── 资源与 CSP ───────────────────────────────────────────────────────────────

export function isUiResourceUri(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(UI_RESOURCE_SCHEME) &&
    value.length > UI_RESOURCE_SCHEME.length &&
    value.length <= 2_000 &&
    !/\s/.test(value)
  );
}

/** 从网关给的 `tools/list` 行里挑出带界面的那些；形状不对的一律跳过，不抛。 */
export function appToolsFrom(rows: unknown): AppTool[] {
  if (!Array.isArray(rows)) return [];
  const out: AppTool[] = [];
  for (const row of rows) {
    const record = recordValue(row);
    if (!record) continue;
    const meta = recordValue(record._meta);
    const ui = recordValue(meta?.ui);
    if (!ui || !isUiResourceUri(ui.resourceUri)) continue;
    const connectorId = record.connector_id ?? record.connectorId;
    if (!boundedString(connectorId, 200, true) || !boundedString(record.name, 200, true)) continue;
    if (!boundedString(record.title, 300) || !boundedString(record.description, 5_000)) continue;
    const cspRecord = recordValue(ui.csp);
    out.push({
      connectorId: connectorId as string,
      name: record.name as string,
      title: (record.title as string | undefined) || undefined,
      description: (record.description as string | undefined) || undefined,
      ui: {
        resourceUri: ui.resourceUri,
        csp: cspRecord
          ? {
              connectDomains: stringList(cspRecord.connectDomains),
              resourceDomains: stringList(cspRecord.resourceDomains),
            }
          : undefined,
      },
    });
  }
  return out;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string").slice(0, 32);
}

/**
 * CSP 里能放的域：规范化 https origin，且**不是**第一方主机。第三方界面没有
 * 理由连 `api.oceanleo.com`——它要调工具走 `tools/call`，由网关鉴权。
 */
export function cspOriginAllowed(origin: string): boolean {
  const parsed = canonicalHttpsOrigin(origin);
  if (!parsed) return false;
  if (isCurrentFamilyFirstPartyHost(parsed.hostname)) return false;
  return true;
}

/**
 * 给 frame 的 CSP。缺省最严：不许连网、不许加载外部资源、不许再嵌 frame、
 * 不许提交表单到外面、不许改 base。`_meta.ui.csp` 只能**加**通过校验的 https
 * origin，加不进第一方主机。inline script/style 必须放行——`ui://` HTML 就是
 * 一整段内联页面，这是规范给定的形态；隔离靠 opaque origin 与 connect-src，
 * 不靠禁内联。
 */
export function buildAppFrameCsp(csp?: AppUiMeta["csp"]): string {
  const connect = (csp?.connectDomains ?? []).filter(cspOriginAllowed);
  const resources = (csp?.resourceDomains ?? []).filter(cspOriginAllowed);
  const res = resources.length ? ` ${resources.join(" ")}` : "";
  const directives = [
    "default-src 'none'",
    `script-src 'unsafe-inline'${res}`,
    `style-src 'unsafe-inline'${res}`,
    `img-src data: blob:${res}`,
    `font-src data:${res}`,
    `media-src data: blob:${res}`,
    connect.length ? `connect-src ${connect.join(" ")}` : "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ];
  return directives.join("; ");
}

/** `tools/call` 结果压成一段纯文本——降级路径与「没有界面」的工具走同一条。 */
export function plainTextOfToolResult(result: unknown): string {
  const record = recordValue(result);
  const content = record ? record.content : undefined;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      const block = recordValue(item);
      if (block && block.type === "text" && typeof block.text === "string") parts.push(block.text);
    }
    if (parts.length) return parts.join("\n");
  }
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result ?? null);
  } catch {
    return "";
  }
}
