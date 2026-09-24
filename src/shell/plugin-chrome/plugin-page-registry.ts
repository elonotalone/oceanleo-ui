import type { PluginPage } from "./plugin-pages";

/** iframe 还没申报时，静态附加页用的不可用原因（走 tt）。 */
export const PLUGIN_AUX_PENDING_REASON = "编辑器还在加载";

export const WEBSITE_AUX_PAGE_IDS = [
  "code",
  "dashboard",
  "database",
  "storage",
] as const;

const WEBSITE_AUX_PAGES = [
  { id: "code", label: "源码" },
  { id: "dashboard", label: "仪表盘" },
  { id: "database", label: "数据库" },
  { id: "storage", label: "文件存储" },
] as const;

const GAME_AUX_PAGES = [{ id: "code", label: "Code" }] as const;

const STATIC_AUX_PAGES: Record<
  string,
  readonly { id: string; label: string }[]
> = {
  website: WEBSITE_AUX_PAGES,
  game: GAME_AUX_PAGES,
};

export function declaredAuxPages(
  pluginId: string | null | undefined,
): readonly { id: string; label: string }[] {
  if (!pluginId) return [];
  return STATIC_AUX_PAGES[pluginId] ?? [];
}

/** 选页去重：有没有 manifest，不含 revision，避免 iframe 回写把宿主打转。 */
export function embeddedPageDispatchKey(
  pageId: string,
  manifestReady: boolean,
): string {
  return `${pageId}::${manifestReady ? "ready" : "pending"}`;
}

/**
 * 静态表 + iframe 申报。表内未就绪的页保持原位并置灰；表外 id 追加在后面。
 */
export function mergePluginAuxPages(
  pluginId: string | null | undefined,
  remote: readonly PluginPage[] | undefined,
): PluginPage[] {
  const declared = declaredAuxPages(pluginId);
  const remoteAux = (remote ?? []).filter(
    (page) =>
      page.kind === "aux" && page.id !== "artifact" && page.id !== "pro",
  );
  const remoteById = new Map(remoteAux.map((page) => [page.id, page]));
  const merged: PluginPage[] = declared.map((page) => {
    const hit = remoteById.get(page.id);
    if (hit) {
      remoteById.delete(page.id);
      const disabled = Boolean(hit.disabled);
      return {
        ...hit,
        label: hit.label || page.label,
        disabled,
        ...(disabled
          ? {
              unavailableReason:
                hit.unavailableReason || PLUGIN_AUX_PENDING_REASON,
            }
          : hit.unavailableReason
            ? { unavailableReason: hit.unavailableReason }
            : {}),
      };
    }
    return {
      id: page.id,
      label: page.label,
      kind: "aux",
      disabled: true,
      unavailableReason: PLUGIN_AUX_PENDING_REASON,
    };
  });
  for (const extra of remoteById.values()) {
    merged.push(extra);
  }
  return merged;
}
