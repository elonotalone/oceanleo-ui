// 帧字段只做形状检查。缺字段沿用上一帧，不猜用户原文。

import type {
  DialogModel,
  DialogConfigOption,
  DialogSession,
  DirCapability,
  ModeOption,
  PermissionOption,
  PlanEntry,
  ProgramAuth,
  ProgramProvider,
  ProgramStatus,
  ToolCard,
  ToolContent,
  ToolKind,
  ToolLocation,
  ToolStatus,
  WsProgram,
} from "./types";
import { WS_PROGRAMS } from "./types";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function isWsProgram(value: string | null | undefined): value is WsProgram {
  return typeof value === "string" && (WS_PROGRAMS as readonly string[]).includes(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const TOOL_KINDS = new Set<ToolKind>([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
]);

const TOOL_STATUSES = new Set<ToolStatus>(["pending", "in_progress", "completed", "failed"]);

const PROGRAM_AUTHS = new Set<ProgramAuth>(["login", "key", "none", "unknown", "malformed"]);

// auth 是服务端探针结论；老帧没有 auth 字段时按 logged_in 退化（true→login、false→none、
// 缺→unknown），不向用户假装有结论。
export function parseProgramAuth(row: Record<string, unknown>): ProgramAuth {
  const raw = str(row.auth);
  if (PROGRAM_AUTHS.has(raw as ProgramAuth)) return raw as ProgramAuth;
  if (row.logged_in === true) return "login";
  if (row.logged_in === false) return "none";
  return "unknown";
}

export function loggedInOf(auth: ProgramAuth): boolean | null {
  if (auth === "login" || auth === "key") return true;
  if (auth === "none" || auth === "malformed") return false;
  return null;
}

function parseProviders(raw: unknown): ProgramProvider[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const providers: ProgramProvider[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row || !str(row.id) || (row.auth !== "login" && row.auth !== "key")) continue;
    providers.push({
      id: str(row.id), label: str(row.label) || str(row.id), auth: row.auth,
      ...(row.tier === "free" || row.tier === "paid" || row.tier === "unknown" ? { tier: row.tier } : {}),
    });
  }
  return providers;
}

export function parsePrograms(raw: unknown): ProgramStatus[] {
  if (!Array.isArray(raw)) return [];
  const out: ProgramStatus[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row || !isWsProgram(str(row.id))) continue;
    const cap = row.dir_capability;
    const dir_capability: DirCapability =
      cap === "link_only" || cap === "none" ? cap : "full";
    const auth = parseProgramAuth(row);
    out.push({
      id: row.id as WsProgram,
      installed: row.installed === true,
      path: str(row.path),
      version: str(row.version),
      auth,
      logged_in: loggedInOf(auth),
      dir_capability,
      running: row.running === true,
      ...(Array.isArray(row.providers) ? { providers: parseProviders(row.providers) } : {}),
      ...(typeof row.active_provider === "string" ? { active_provider: row.active_provider } : {}),
      ...(typeof row.account_kind === "string" ? { account_kind: row.account_kind } : {}),
    });
  }
  return out;
}

export function parseModels(raw: unknown): DialogModel[] {
  if (!Array.isArray(raw)) return [];
  const out: DialogModel[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row || !str(row.id)) continue;
    const id = str(row.id);
    out.push({
      id,
      name: str(row.name) || id,
      default: row.default === true,
      ...(typeof row.provider === "string" ? { provider: row.provider } : {}),
      ...(typeof row.provider_label === "string" ? { provider_label: row.provider_label } : {}),
      ...(typeof row.usable === "boolean" ? { usable: row.usable } : {}),
      ...(typeof row.reason === "string" ? { reason: row.reason } : {}),
    });
  }
  return out;
}

export function parseMode(raw: unknown): ModeOption | null {
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const id = str(row.id);
    const category = str(row.category);
    if (category !== "mode" && id !== "mode") continue;
    const options: { value: string; name: string }[] = [];
    if (Array.isArray(row.options)) {
      for (const opt of row.options) {
        const record = asRecord(opt);
        if (!record || !str(record.value)) continue;
        const value = str(record.value);
        options.push({ value, name: str(record.name) || value });
      }
    }
    return {
      id: id || "mode",
      name: str(row.name),
      current: str(row.current),
      options,
    };
  }
  return null;
}

export function parseConfigOptions(raw: unknown): DialogConfigOption[] {
  if (!Array.isArray(raw)) return [];
  const out: DialogConfigOption[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row || !str(row.id)) continue;
    const options: { value: string; name: string }[] = [];
    if (Array.isArray(row.options)) {
      for (const rawOption of row.options) {
        const option = asRecord(rawOption);
        if (!option || !str(option.value)) continue;
        const value = str(option.value);
        options.push({ value, name: str(option.name) || value });
      }
    }
    const current = typeof row.current === "boolean" ? row.current : str(row.current);
    const rawType = str(row.type);
    const type =
      rawType === "bool" || typeof current === "boolean"
        ? "bool"
        : rawType === "select" || options.length > 0
          ? "select"
          : "text";
    out.push({
      id: str(row.id),
      name: str(row.name) || str(row.id),
      category: str(row.category),
      type,
      current,
      options,
    });
  }
  return out;
}

export function parseSessions(raw: unknown): DialogSession[] {
  if (!Array.isArray(raw)) return [];
  const out: DialogSession[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row || !str(row.id)) continue;
    const id = str(row.id);
    out.push({
      id,
      title: str(row.title) || id,
      cwd: str(row.cwd),
      updatedAt: str(row.updated_at),
    });
  }
  return out;
}

export function parseContent(raw: unknown): ToolContent[] {
  if (!Array.isArray(raw)) return [];
  const out: ToolContent[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    if (row.type === "content") out.push({ type: "content", text: str(row.text) });
    else if (row.type === "terminal") out.push({ type: "terminal", output: str(row.output) });
    else if (row.type === "diff") {
      out.push({
        type: "diff",
        path: str(row.path),
        old_text: str(row.old_text),
        new_text: str(row.new_text),
      });
    }
  }
  return out;
}

export function parseLocations(raw: unknown): ToolLocation[] {
  if (!Array.isArray(raw)) return [];
  const out: ToolLocation[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row || !str(row.path)) continue;
    const loc: ToolLocation = { path: str(row.path) };
    if (typeof row.line === "number" && Number.isFinite(row.line)) loc.line = row.line;
    out.push(loc);
  }
  return out;
}

export function parseTool(frame: Record<string, unknown>, prev?: ToolCard): ToolCard {
  const kind = frame.kind;
  const status = frame.status;
  return {
    id: str(frame.id) || prev?.id || "",
    kind: typeof kind === "string" && TOOL_KINDS.has(kind as ToolKind) ? (kind as ToolKind) : prev?.kind ?? "other",
    title: frame.title === undefined ? prev?.title ?? "" : str(frame.title),
    status:
      typeof status === "string" && TOOL_STATUSES.has(status as ToolStatus)
        ? (status as ToolStatus)
        : prev?.status ?? "pending",
    content: frame.content === undefined ? prev?.content ?? [] : parseContent(frame.content),
    locations: frame.locations === undefined ? prev?.locations ?? [] : parseLocations(frame.locations),
  };
}

export function parsePlan(raw: unknown): PlanEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanEntry[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const priority = row.priority === "high" || row.priority === "low" ? row.priority : "medium";
    const status =
      row.status === "in_progress" || row.status === "completed" ? row.status : "pending";
    out.push({ content: str(row.content), priority, status });
  }
  return out;
}

export function parseOptions(raw: unknown): PermissionOption[] {
  if (!Array.isArray(raw)) return [];
  const out: PermissionOption[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row || !str(row.id)) continue;
    out.push({ id: str(row.id), name: str(row.name) || str(row.id), kind: str(row.kind) });
  }
  return out;
}

export function parseCommands(raw: unknown): { name: string; description: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { name: string; description: string }[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row || !str(row.name)) continue;
    out.push({ name: str(row.name), description: str(row.description) });
  }
  return out;
}

export function toolTitleOf(raw: unknown): string {
  const row = asRecord(raw);
  return row ? str(row.title) : "";
}

export function parseCost(raw: unknown): { amount: number; currency: string } | undefined {
  const row = asRecord(raw);
  if (!row || typeof row.amount !== "number" || !Number.isFinite(row.amount)) return undefined;
  return { amount: row.amount, currency: str(row.currency) };
}
