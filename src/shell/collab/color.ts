/**
 * 头像颜色：`hsl(fnv1a32(id) % 360, 70%, 45%)`，与后端 `app.collab`（W04）同一算法。
 * fnv1a32 按 UTF-8 字节计算（偏移基 0x811c9dc5，质数 0x01000193）。
 */
const encoder = new TextEncoder();

export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  const bytes = encoder.encode(text);
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function colorForUser(userId: string): string {
  return `hsl(${fnv1a32(String(userId)) % 360}, 70%, 45%)`;
}
