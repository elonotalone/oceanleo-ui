// W1-RDGW: parent registers RD_GATEWAY_MESSAGES in shell-overhaul-copy.ts.
import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";

const SOURCE = {
  reconnecting: "这台电脑上的 OceanLeo 刚断开，正在等待它恢复。",
  offline: "联系不上这台电脑上的 OceanLeo：这台电脑已离线，请等待它恢复后重新连接。",
  lastSeen: "最后在线：{time}",
} as const;

type Messages = CopyMessagesOf<typeof SOURCE>;
const EN: Messages = {
  reconnecting: "OceanLeo on this computer just disconnected. Waiting for it to recover.",
  offline: "Cannot reach OceanLeo on this computer: the computer is offline. Reconnect after it recovers.",
  lastSeen: "Last seen: {time}",
};
const ZH_TW: Messages = {
  reconnecting: "這台電腦上的 OceanLeo 剛中斷連線，正在等待它恢復。",
  offline: "聯絡不上這台電腦上的 OceanLeo：這台電腦已離線，請等待它恢復後重新連線。",
  lastSeen: "最後在線：{time}",
};

export const RD_GATEWAY_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN)]),
) as Record<Locale, Record<string, string>>;
