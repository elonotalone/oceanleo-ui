/** Fetch keepalive 的浏览器级 payload 安全阈值（给 64 KiB 总队列预留协议空间）。 */
export const APP_SESSION_KEEPALIVE_MAX_BYTES = 60_000;

export function appSessionBodySupportsKeepalive(body?: string): boolean {
  if (!body) return true;
  if (typeof TextEncoder === "undefined") {
    // 极老环境无法精确计字节时保守按最坏 UTF-8 宽度判断。
    return body.length * 3 < APP_SESSION_KEEPALIVE_MAX_BYTES;
  }
  return (
    new TextEncoder().encode(body).byteLength <
    APP_SESSION_KEEPALIVE_MAX_BYTES
  );
}
