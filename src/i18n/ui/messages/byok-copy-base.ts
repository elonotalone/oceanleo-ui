// @oceanleo/ui — BYOK 设置页 / API 页存储说明文案词典（key = 中文原文）。
//
// 单独一册：这批句子是密封 cookie 上线后用户必须读对的安全承诺
// （key 只在本机浏览器、服务器不保存）。缺译文会把中文印在外国用户脸上。

import { LOCALES, type Locale } from "../../config";

export const BYOK_COPY_SOURCE = {
  storageNotice:
    "你的 key 只以加密形式保存在这台设备的浏览器里，OceanLeo 服务器不保存；每次调用随请求经过 OceanLeo 网关转发给厂商，网关用完即弃、不记录。换设备需重填，清除站点数据会丢失。",
  storageBrowserOnly:
    "密钥只以加密形式保存在你这台设备的浏览器里，OceanLeo 服务器不保存。",
  compatBadge: "仅支持 OpenAI 兼容协议 API",
  endpointUrl: "接口地址",
  pasteVendorKey: "粘贴厂商 API Key",
  getFromConsole: "去厂商控制台获取 →",
  bailianCodingPlan:
    "百炼 Coding Plan（sk-sp- 开头）的 key 禁止用于应用后端，不能在此使用。",
  modelName: "模型名称",
  probe: "探测",
  probeFailed: "探测失败",
  modelPlaceholder: "例如 gpt-4o；留空用厂商默认",
  capability: "能力",
  capTools: "工具调用",
  capVision: "图片输入",
  capReasoning: "推理模式",
  toolsHint:
    "勾选「工具调用」后可用于智能体任务；未勾选时智能体会明确报错。",
  configuredProviders: "已配置的厂商",
  providerDefault: "厂商默认",
  gatewayNotEnabled: "网关尚未启用 BYOK，请稍后再试。",
  loginToConfigure: "登录后即可配置自己的 key",
} as const;

export type ByokCopyName = keyof typeof BYOK_COPY_SOURCE;
export type ByokCopyMessages = Record<ByokCopyName, string>;

export const BYOK_COPY_KEYS: readonly string[] = Object.values(BYOK_COPY_SOURCE);

export function byokCopyDictionaryFrom(
  messages: ByokCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(BYOK_COPY_SOURCE) as ByokCopyName[]).map((name) => [
      BYOK_COPY_SOURCE[name],
      messages[name],
    ]),
  );
}

export const BYOK_COPY_ZH: ByokCopyMessages = { ...BYOK_COPY_SOURCE };

export function assembleByokCopy(
  translations: Record<Exclude<Locale, "zh">, ByokCopyMessages>,
): Record<Locale, Record<string, string>> {
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      byokCopyDictionaryFrom(
        locale === "zh" ? BYOK_COPY_ZH : translations[locale],
      ),
    ]),
  ) as Record<Locale, Record<string, string>>;
}
