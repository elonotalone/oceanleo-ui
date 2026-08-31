// 插件 AI 契约的对外入口。13 件插件一律从 `@oceanleo/ui/shell/plugin-ai` 取，
// 不要深引子模块——六套旧通道就是从「各自深引一点点」长出来的。
//
// 分工：types.ts = 说什么（能力与形状），transport.ts = 由谁去做（网关 /
// host.fetchJson / 没有），client.ts = 怎么跑一次（取消、进度、错误、回执）。
// 「agent 改文档」那条总线仍然在 plugin-command，本包一个字都不碰它。

export {
  AI_CAPABILITIES,
  PluginAiError,
  isPluginAiError,
  type AiAspectRatio,
  type AiBilling,
  type AiCapability,
  type AiCapabilityAvailability,
  type AiCapabilityIo,
  type AiCodeFile,
  type AiCodePatchInput,
  type AiCodePatchOutput,
  type AiDisposition,
  type AiImageEditInput,
  type AiImageGenerateInput,
  type AiImageInpaintInput,
  type AiImageOutput,
  type AiImageOutputSet,
  type AiImageRef,
  type AiImageRelightInput,
  type AiImageUpscaleInput,
  type AiInputFor,
  type AiLightDirection,
  type AiOutputFor,
  type AiProgress,
  type AiProgressPhase,
  type AiReceipt,
  type AiRewriteAction,
  type AiTextGenerateInput,
  type AiTextOutput,
  type AiTextRewriteInput,
  type AiTextTranslateInput,
  type AiVideoGenerateInput,
  type AiVideoOutput,
  type AiVideoOutputSet,
  type PluginAiErrorOptions,
  type PluginAiRequest,
  type PluginAiResult,
} from "./types";

export {
  PLUGIN_AI_LOGICAL_URLS,
  PLUGIN_AI_REQUEST_SCHEMA,
  createGatewayAiTransport,
  createHostFetchJsonAiTransport,
  createUnavailableAiTransport,
  type AiTransport,
  type AiTransportContext,
  type AiTransportResult,
  type GatewayAiTransportOptions,
  type HostFetchJsonAiTransportOptions,
  type PluginAiFetchJson,
} from "./transport";

export {
  createPluginAiClient,
  type PluginAiClient,
  type PluginAiClientOptions,
} from "./client";
