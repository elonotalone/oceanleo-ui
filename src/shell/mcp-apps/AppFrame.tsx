"use client";

// ============================================================================
// @oceanleo/ui — MCP App 的沙箱 iframe 承载组件（W14，2026-09-20）
// ----------------------------------------------------------------------------
// 一个 MCP App 的界面在这里落地。它做三件事，每一件都 fail closed：
//
//  1. **能不能渲染**：只有当 (a) `resources/read` 真拿到了 `ui://` HTML，且
//     (b) 有一个过 `isValidAppSandboxOrigin()` 的承载面 origin（我方部署在
//     `oceanleo.app` 上的 sandbox-proxy 页，全串白名单 `MCP_APPS_SANDBOX_ORIGINS`），
//     且 (c) 宿主页自己在第一方 https 主机上，三者同时成立才出 iframe。缺任何一条
//     → 渲染 `toolResult` 的纯文本（`plainTextOfToolResult`），不白屏、不弹窗。
//     **本轮白名单为空**，所以这一层今天恒走纯文本；那是设计好的默认。
//
//  2. **沙箱**：iframe 的 sandbox 属性写**字面串** allow-scripts allow-forms
//     （= `MCP_APP_FRAME_SANDBOX`，由测试锁两者相等）。没有 `allow-same-origin`
//     ⇒ frame 是 opaque origin ⇒ 拿不到家族 cookie，也不能被宿主用具体
//     targetOrigin 投消息。扫描器规则要求字面串而不是变量（计算值会记
//     `UC-3-IFRAME-DYNAMIC-SANDBOX`）。
//
//  3. **通信**：frame 先手。proxy 页加载后向宿主 `postMessage(hello, <宿主精确
//     origin>, [MessagePort])`；宿主对 hello 过 `acceptAppFrameMessage()` 三段闸
//     （source === contentWindow、origin === "null"、信封逐字对）后收下端口，
//     之后**宿主→frame 的每一条消息都走端口**，宿主一次也不对 frame 调
//     `window.postMessage`。端口第一条是 `sandbox-load`（HTML + CSP），随后按
//     MCP Apps 规范应答 `ui/initialize`、推 `tool-input` / `tool-result`、代理
//     `tools/call` / `ui/message` / `ui/update-model-context`。
// ============================================================================

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { isCurrentFamilyFirstPartyHost } from "../../contracts/domain-family";
import {
  type AppToHostMessage,
  type AppUiMeta,
  type JsonRpcId,
  type JsonRpcRequest,
  MCP_APP_FRAME_OPAQUE_ORIGIN,
  MCP_APPS_CAPABILITY_KEY,
  MCP_APPS_PROTOCOL,
  MCP_APPS_SANDBOX_ORIGINS,
  UI_METHODS,
  acceptAppFrameMessage,
  asAppToHostMessage,
  buildAppFrameCsp,
  hostNotification,
  isValidAppSandboxOrigin,
  plainTextOfToolResult,
  recordValue,
  sandboxLoadNotification,
} from "./protocol";

/** MCP Apps 稳定扩展的日期版本（能力协商回它）。 */
export const MCP_APPS_PROTOCOL_VERSION = "2026-01-26";

/** proxy 页的路径。fragment 里带 instance 与宿主 origin（fragment 不上送服务器）。 */
export const SANDBOX_PROXY_PATH = "/mcp-app";

/** 界面报的尺寸夹在这个区间里：不让一个 App 把聊天页撑成 30 屏。 */
export const APP_FRAME_MIN_HEIGHT = 48;
export const APP_FRAME_MAX_HEIGHT = 720;
export const APP_FRAME_DEFAULT_HEIGHT = 240;

export interface AppFrameProps {
  /** `_meta.ui.resourceUri`。 */
  resourceUri: string;
  /** `resources/read` 拿到的 HTML；`null` = 没拿到 / 不是 mcp-app MIME → 走纯文本。 */
  html: string | null;
  /** `_meta.ui.csp`；缺省最严。 */
  csp?: AppUiMeta["csp"];
  /** 这次工具调用的入参（初始化完成后推给界面）。 */
  toolInput?: Record<string, unknown>;
  /** 这次工具调用的结果（初始化完成后推给界面；变化时再推）。降级路径就显示它的纯文本。 */
  toolResult?: unknown;
  /** 界面按钮回调工具。宿主把它代理回网关，**不在浏览器里直连 MCP 服务器**。 */
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  /** 界面想往对话里追加一句话。 */
  onMessage?: (text: string) => void;
  /** 界面更新模型上下文。 */
  onContextUpdate?: (context: Record<string, unknown>) => void;
  /**
   * 承载面 origin。不传取 `MCP_APPS_SANDBOX_ORIGINS[0]`。**必须**过
   * `isValidAppSandboxOrigin(origin, allowedOrigins)`，否则整层降级。
   */
  sandboxOrigin?: string;
  /** 白名单注入点（测试用；生产恒用 `MCP_APPS_SANDBOX_ORIGINS`）。 */
  allowedOrigins?: readonly string[];
  /** 宿主页 origin 注入点（测试用；生产取 `window.location.origin`）。 */
  hostOrigin?: string;
  title?: string;
  className?: string;
  /** 降级文本为空时显示的占位（默认「此工具没有可显示的结果」由调用方 tt 后传入）。 */
  emptyFallback?: ReactNode;
}

/**
 * 三个前提都成立才返回 iframe 的 src；否则返回 `""`（调用方走纯文本）。
 * 导出是为了让测试直接判：`oceanleo.com` / `*` / 不在白名单 / 宿主不是第一方 → `""`。
 */
export function appFrameSrc(input: {
  sandboxOrigin: string;
  hostOrigin: string;
  instanceId: string;
  allowedOrigins?: readonly string[];
}): string {
  const { sandboxOrigin, hostOrigin, instanceId, allowedOrigins } = input;
  if (!isValidAppSandboxOrigin(sandboxOrigin, allowedOrigins)) return "";
  if (!instanceId || instanceId.length > 128) return "";
  let host: URL;
  try {
    host = new URL(hostOrigin);
  } catch {
    return "";
  }
  if (host.origin !== hostOrigin || host.protocol !== "https:") return "";
  if (!isCurrentFamilyFirstPartyHost(host.hostname)) return "";
  const url = new URL(SANDBOX_PROXY_PATH, sandboxOrigin);
  const fragment = new URLSearchParams({ instance: instanceId, host: hostOrigin });
  url.hash = fragment.toString();
  return url.toString();
}

function currentHostOrigin(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.location.origin;
  } catch {
    return "";
  }
}

function clampHeight(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(APP_FRAME_MAX_HEIGHT, Math.max(APP_FRAME_MIN_HEIGHT, Math.round(value)));
}

/** 端口上的投递。单独成函数是为了让扫描器看清这是 MessagePort（单参）而不是 window。 */
function deliver(port: MessagePort, payload: unknown): void {
  port.postMessage(payload);
}

function respond(port: MessagePort, id: JsonRpcId, result: unknown): void {
  deliver(port, { jsonrpc: "2.0", id, result });
}

function reject(port: MessagePort, id: JsonRpcId, code: number, message: string): void {
  deliver(port, { jsonrpc: "2.0", id, error: { code, message } });
}

export function AppFrame({
  resourceUri,
  html,
  csp,
  toolInput,
  toolResult,
  onToolCall,
  onMessage,
  onContextUpdate,
  sandboxOrigin,
  allowedOrigins,
  hostOrigin,
  title,
  className = "",
  emptyFallback,
}: AppFrameProps) {
  const reactId = useId();
  // instanceId 进 fragment 与 hello 信封；每次挂载一个新值，旧 frame 的消息对不上就丢。
  const instanceId = useMemo(
    () => `mcp-app-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}-${Date.now().toString(36)}`,
    [reactId],
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const portRef = useRef<MessagePort | null>(null);
  const initializedRef = useRef(false);
  const [height, setHeight] = useState(APP_FRAME_DEFAULT_HEIGHT);

  const effectiveSandboxOrigin = sandboxOrigin ?? (allowedOrigins ?? MCP_APPS_SANDBOX_ORIGINS)[0] ?? "";
  const effectiveHostOrigin = hostOrigin ?? currentHostOrigin();
  const src = html
    ? appFrameSrc({
        sandboxOrigin: effectiveSandboxOrigin,
        hostOrigin: effectiveHostOrigin,
        instanceId,
        allowedOrigins,
      })
    : "";
  const canFrame = Boolean(src) && typeof html === "string" && html.length > 0;
  const cspString = useMemo(() => buildAppFrameCsp(csp), [csp]);

  // 最新的 props 放进 ref：端口回调是长命的，不该因为父组件重渲染就重绑。
  const latest = useRef({ toolInput, toolResult, onToolCall, onMessage, onContextUpdate, html, cspString, resourceUri });
  latest.current = { toolInput, toolResult, onToolCall, onMessage, onContextUpdate, html, cspString, resourceUri };

  const pushToolState = useCallback((port: MessagePort) => {
    const { toolInput: input, toolResult: result } = latest.current;
    const inputMessage = hostNotification(UI_METHODS.TOOL_INPUT, { arguments: input ?? {} });
    if (inputMessage) deliver(port, inputMessage);
    if (result !== undefined) {
      const resultMessage = hostNotification(UI_METHODS.TOOL_RESULT, { result });
      if (resultMessage) deliver(port, resultMessage);
    }
  }, []);

  const handleAppMessage = useCallback(
    (port: MessagePort, message: AppToHostMessage) => {
      if (!("method" in message)) return; // 宿主没发过任何 request，任何 response 都没有待答项
      const request = message as JsonRpcRequest;
      const hasId = request.id !== undefined;
      const params = recordValue(request.params) ?? {};
      switch (request.method) {
        case UI_METHODS.INITIALIZE: {
          if (!hasId) return;
          respond(port, request.id, {
            protocolVersion: MCP_APPS_PROTOCOL_VERSION,
            hostCapabilities: { [MCP_APPS_CAPABILITY_KEY]: {} },
            hostInfo: { name: "oceanleo", protocol: MCP_APPS_PROTOCOL },
          });
          return;
        }
        case UI_METHODS.INITIALIZED: {
          initializedRef.current = true;
          pushToolState(port);
          return;
        }
        case UI_METHODS.TOOLS_CALL: {
          if (!hasId) return;
          const name = params.name as string;
          const args = recordValue(params.arguments) ?? {};
          latest.current
            .onToolCall(name, args)
            .then((result) => respond(port, request.id, result ?? {}))
            .catch((error: unknown) => {
              const text = error instanceof Error ? error.message : "tool call failed";
              reject(port, request.id, -32000, text.slice(0, 500));
            });
          return;
        }
        case UI_METHODS.MESSAGE: {
          if (!hasId) return;
          latest.current.onMessage?.(params.text as string);
          respond(port, request.id, {});
          return;
        }
        case UI_METHODS.UPDATE_MODEL_CONTEXT: {
          if (!hasId) return;
          latest.current.onContextUpdate?.(params);
          respond(port, request.id, {});
          return;
        }
        case UI_METHODS.SIZE_CHANGED: {
          const next = clampHeight(params.height);
          if (next !== null) setHeight(next);
          return;
        }
        default:
          if (hasId) reject(port, request.id, -32601, "method not allowed");
      }
    },
    [pushToolState],
  );

  // hello 闸 + 端口接管。只在真的出了 iframe 时挂监听。
  useEffect(() => {
    if (!canFrame || typeof window === "undefined") return;
    const onWindowMessage = (event: MessageEvent) => {
      if (portRef.current) return; // 一个实例只收一个端口；第二个 hello 一律丢
      const port = acceptAppFrameMessage(
        {
          origin: event.origin,
          source: event.source,
          data: event.data,
          ports: event.ports,
        },
        {
          expectedOrigin: MCP_APP_FRAME_OPAQUE_ORIGIN,
          frameWindow: iframeRef.current?.contentWindow ?? null,
          instanceId,
          allowedOrigins,
        },
      );
      if (!port) return;
      portRef.current = port;
      port.onmessage = (portEvent: MessageEvent) => {
        const message = asAppToHostMessage(portEvent.data);
        if (!message) return;
        handleAppMessage(port, message);
      };
      if (typeof port.start === "function") port.start();
      const { html: currentHtml, cspString: currentCsp, resourceUri: uri } = latest.current;
      const load = currentHtml
        ? sandboxLoadNotification({ html: currentHtml, csp: currentCsp, resourceUri: uri })
        : null;
      if (!load) {
        port.close();
        portRef.current = null;
        return;
      }
      deliver(port, load);
    };
    window.addEventListener("message", onWindowMessage);
    return () => {
      window.removeEventListener("message", onWindowMessage);
      portRef.current?.close();
      portRef.current = null;
      initializedRef.current = false;
    };
  }, [canFrame, instanceId, allowedOrigins, handleAppMessage]);

  // 结果变了就再推一次（只在界面已 initialized 之后）。
  useEffect(() => {
    const port = portRef.current;
    if (!port || !initializedRef.current) return;
    if (toolResult === undefined) return;
    const message = hostNotification(UI_METHODS.TOOL_RESULT, { result: toolResult });
    if (message) deliver(port, message);
  }, [toolResult]);

  if (!canFrame) {
    const text = plainTextOfToolResult(toolResult);
    return (
      <div
        className={`rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] leading-relaxed text-neutral-700 ${className}`}
        data-mcp-app-fallback=""
        data-mcp-app-resource={resourceUri}
      >
        {text ? (
          <pre className="whitespace-pre-wrap break-words font-sans">{text}</pre>
        ) : (
          <span className="text-neutral-400">{emptyFallback ?? null}</span>
        )}
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title || resourceUri}
      // 字面串。与 `MCP_APP_FRAME_SANDBOX` 相等由测试锁死；改这里必须同时改常量。
      sandbox="allow-scripts allow-forms"
      referrerPolicy="no-referrer"
      loading="lazy"
      style={{ height: `${height}px` }}
      className={`w-full rounded-xl border border-neutral-200 bg-white ${className}`}
      data-mcp-app-frame=""
      data-mcp-app-resource={resourceUri}
      data-mcp-app-instance={instanceId}
    />
  );
}

export default AppFrame;
