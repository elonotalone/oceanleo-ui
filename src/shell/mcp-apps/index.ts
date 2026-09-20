// @oceanleo/ui — MCP Apps 宿主（W14，2026-09-20）。对外只从这里 import。
//
// 三层：`protocol`（认什么、拒什么）→ `host`（网关桥接与缓存）→ `AppFrame` /
// `ComposerAppsBar`（DOM）。安全前提见 `protocol.ts` 文件头与 `_COMMON.md §3.10`。

export {
  APP_TO_HOST_METHODS,
  HOST_TO_APP_METHODS,
  MAX_APP_HTML_BYTES,
  MAX_APP_MESSAGE_BYTES,
  MCP_APP_FRAME_OPAQUE_ORIGIN,
  MCP_APP_FRAME_SANDBOX,
  MCP_APP_RESOURCE_MIME,
  MCP_APPS_CAPABILITY_KEY,
  MCP_APPS_PROTOCOL,
  MCP_APPS_SANDBOX_ORIGINS,
  UI_METHODS,
  UI_RESOURCE_SCHEME,
  acceptAppFrameMessage,
  appToolsFrom,
  asAppFrameHello,
  asAppToHostMessage,
  buildAppFrameCsp,
  cspOriginAllowed,
  hostNotification,
  isAcceptableAppFrameSandbox,
  isUiResourceUri,
  isValidAppSandboxOrigin,
  isValidAppTargetOrigin,
  plainTextOfToolResult,
  sandboxLoadNotification,
} from "./protocol";
export type {
  AppFrameHello,
  AppTool,
  AppToHostMessage,
  AppUiMeta,
  JsonRpcId,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./protocol";

export {
  DEFAULT_APP_TIMEOUT_MS,
  MCP_APPS_GATEWAY_PATHS,
  appResourceFrom,
  createMcpAppsHost,
  gatewayTransport,
} from "./host";
export type {
  AppRenderMode,
  AppResource,
  McpAppsHost,
  McpAppsHostOptions,
  McpAppsTransport,
} from "./host";

export {
  APP_FRAME_DEFAULT_HEIGHT,
  APP_FRAME_MAX_HEIGHT,
  APP_FRAME_MIN_HEIGHT,
  AppFrame,
  MCP_APPS_PROTOCOL_VERSION,
  SANDBOX_PROXY_PATH,
  appFrameSrc,
} from "./AppFrame";
export type { AppFrameProps } from "./AppFrame";

export { ComposerAppsBar, defaultAppsHost } from "./ComposerAppsBar";
export type { ComposerAppsBarProps } from "./ComposerAppsBar";
