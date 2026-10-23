import { convertUmoToRichDoc, inspectRichDocDocument } from "./rich-doc-umo-migration";

/**
 * 服务器草稿 / 本地恢复给回来的工作文档 → 交给 `restoreRecovery` 的 Tiptap JSON。
 *
 * 草稿是本编辑器 `getJSON()` 的原样快照：原样恢复。只有旧 Umo 时代的草稿才回转——
 * 回转会剥掉 Umo 不认的段落排版（行距、首行缩进、段前段后）、编号预设、图片环绕，
 * 原生草稿走它就等于每次关掉重开都丢这些格式（10-23 R2 实测：行距 2 重开后没了）。
 */
export function richDocDraftForRestore(payload: unknown): unknown {
  if (
    (payload as { type?: unknown } | null)?.type === "doc" &&
    inspectRichDocDocument(payload).kind === "richdoc"
  ) {
    return payload;
  }
  const reversed = convertUmoToRichDoc(payload);
  return reversed.ok ? reversed.data : payload;
}
