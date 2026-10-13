export const BAY_AUDIENCE_MODES = ["public", "verified_first", "invited", "group"] as const;
export type BayAudienceMode = (typeof BAY_AUDIENCE_MODES)[number];

export type BayAudienceMember = {
  userId: string;
  name: string;
  handle?: string;
  kind?: "person" | "group";
  conversationId?: string;
  memberIds?: string[];
};

export type BayAudience = {
  mode: BayAudienceMode;
  handle: string;
  members: BayAudienceMember[];
};

export function emptyAudience(): BayAudience {
  return { mode: "public", handle: "", members: [] };
}

export function isAudienceMode(value: unknown): value is BayAudienceMode {
  return value === "public" || value === "verified_first" || value === "invited" || value === "group";
}

export function normalizeAudience(input: Partial<BayAudience> | null | undefined): BayAudience {
  const mode = isAudienceMode(input?.mode) ? input.mode : "public";
  const members = Array.isArray(input?.members)
    ? input.members.filter((row) => row && typeof row.userId === "string" && row.userId.trim())
    : [];
  return {
    mode,
    handle: typeof input?.handle === "string" ? input.handle.trim() : "",
    members: members.map((row) => ({
      userId: row.userId.trim(),
      name: (row.name || row.handle || row.userId).trim(),
      handle: row.handle?.trim() || undefined,
      kind: row.kind === "group" ? "group" : "person",
      conversationId: row.conversationId?.trim() || undefined,
      memberIds: Array.isArray(row.memberIds) ? row.memberIds.filter((id) => typeof id === "string" && id.trim()) : undefined,
    })),
  };
}

export function audienceDone(audience: BayAudience): boolean {
  if (audience.mode === "invited") return audience.members.length > 0 || Boolean(audience.handle.trim());
  if (audience.mode === "group") return audience.members.length > 0;
  return true;
}

export function audienceMemberIds(audience: BayAudience): string[] {
  const ids: string[] = [];
  for (const row of audience.members) {
    if (row.kind === "group" && row.memberIds?.length) {
      ids.push(...row.memberIds);
      continue;
    }
    if (row.userId && !row.userId.startsWith("g:")) ids.push(row.userId);
  }
  return [...new Set(ids.filter(Boolean))];
}

export const CUSTOM_TERM_HINTS = [
  "可商用",
  "仅个人使用",
  "已交付不退款",
  "不得转售原文件",
  "按约定时间交付",
  "含改稿",
] as const;

export function appendTermHint(current: string, hint: string): string {
  const text = current.trim();
  const line = hint.trim();
  if (!line) return current;
  if (text.split(/\n/).some((row) => row.trim() === line)) return text;
  return text ? `${text}\n${line}` : line;
}
