// 参与者 id 的两种写法：服务端 participant_id 是带连字符的 UUID；ARTC userId 是去掉连字符的同一串（合同 §3.2）。
// 字幕事件带的是服务端写法；引擎快照里的 participantId 两种都可能——这里统一。

/** 比较用的键：去连字符、小写。 */
export function participantKey(id: string | null | undefined): string {
  return String(id ?? "").replace(/-/g, "").trim().toLowerCase();
}

/** 上行鉴权要的服务端写法：32 位十六进制补回 8-4-4-4-12；本来就是 UUID 或别的写法原样返回；空 → null。 */
export function participantUuid(id: string | null | undefined): string | null {
  const raw = String(id ?? "").trim();
  if (!raw) return null;
  if (/^[0-9a-f]{32}$/i.test(raw)) {
    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`.toLowerCase();
  }
  return raw;
}
