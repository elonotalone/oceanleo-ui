/** Connector settings labels. The parent registers CONNECTORS_MESSAGES in messages/index.ts. */
export const CONNECTORS_MESSAGES = {
  zh: {},
  en: {
    "已连接 · {n} 工具": "Connected · {n} tools",
    "已失效 · 点击重试": "Expired · retry",
    "已停用": "Disabled",
    "连接": "Connect",
    "断开": "Disconnect",
    "重试": "Retry",
    "重新连接": "Reconnect",
    "探活": "Check connection",
    "探活中…": "Checking…",
    "停用 {name}": "Disable {name}",
    "启用 {name}": "Enable {name}",
    "更多操作：{name}": "More actions: {name}",
  },
  ja: {}, ko: {}, fr: {}, de: {}, it: {}, es: {}, "es-419": {}, "pt-BR": {}, "pt-PT": {}, vi: {}, tr: {}, "zh-TW": {}, ar: {}, th: {}, hi: {},
} as const;

export type ConnectorCopyKey = keyof typeof CONNECTORS_MESSAGES.en;
