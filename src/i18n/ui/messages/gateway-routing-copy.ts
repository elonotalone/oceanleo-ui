import type { Locale } from "../../config";

// W4 dashboard across gateways — wave 2026-11-09. Chinese source text is the key; English is the value.
// Other locales fall back to English until a translated row exists.
const EN: Record<string, string> = {
  "在线，但当前版本连不到它": "Online, but this version cannot reach it",
  "网关 {gateway}": "Gateway {gateway}",
  "当前版本无法控制这台电脑。": "This version cannot control this computer.",
};

export function gatewayRoutingCopy(locale: Locale): Record<string, string> {
  if (locale === "zh") return Object.fromEntries(Object.keys(EN).map((key) => [key, key]));
  return { ...EN };
}
