/**
 * 选区桥：把当前选区编进 agent 上下文，并解析聊天里的 @页 / @列 / @图层。
 *
 * 这是 CopilotKit `useCopilotReadable` 的自研替代（≤200 行）。不引入 CopilotKit：
 * 它是另一套 agent runtime，而 OceanLeo 的对话走 `createTask` / `followUp`。
 */
import type { SelectionContext } from "../selection-context-types";

export type MentionKind = "page" | "column" | "layer";

export interface AgentSelection {
  kind: string;
  id: string;
  summary: string;
  label?: string;
  editorId?: string;
}

export interface MentionHit {
  raw: string;
  kind: MentionKind;
  id: string;
  summary: string;
}

export function selectionToAgent(
  sel: SelectionContext | null | undefined,
  editorId?: string,
): AgentSelection | null {
  if (!sel || typeof sel.kind !== "string" || typeof sel.id !== "string") {
    return null;
  }
  const kind = sel.kind.trim();
  const id = sel.id.trim();
  if (!kind || !id) return null;
  const label = typeof sel.label === "string" ? sel.label.trim() : "";
  const text = typeof sel.text === "string" ? sel.text.trim() : "";
  const summary = (text || label || `${kind}:${id}`).slice(0, 500);
  return {
    kind,
    id,
    summary,
    ...(label ? { label } : {}),
    ...(editorId ? { editorId } : {}),
  };
}

export function formatSelectionContext(sel: AgentSelection | null): string {
  if (!sel) return "";
  return [
    "〔当前选区〕",
    `kind=${sel.kind}`,
    `id=${sel.id}`,
    `摘要=${sel.summary}`,
  ].join("\n");
}

function classifyKind(kind: string): MentionKind | null {
  const k = kind.toLowerCase();
  if (/(page|slide|sheet)/.test(k)) return "page";
  if (/(column|col)/.test(k)) return "column";
  if (/(layer|image|shape|object)/.test(k)) return "layer";
  return null;
}

function lookup(
  catalog: readonly AgentSelection[],
  kind: MentionKind,
  token: string,
): AgentSelection | undefined {
  const needle = token.toLowerCase();
  return catalog.find((item) => {
    const classified = classifyKind(item.kind);
    if (classified !== kind) return false;
    const hay = `${item.id} ${item.label || ""} ${item.summary}`.toLowerCase();
    return hay.includes(needle) || item.id.toLowerCase() === needle;
  });
}

const CN_ONES: Record<string, string> = {
  一: "1",
  二: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9",
  十: "10",
};

function pageToken(raw: string): string {
  return CN_ONES[raw] || raw;
}

const PAGE_RE = /@第?\s*(\d+|[一二三四五六七八九十]+)\s*页/g;
const COL_RE = /@([A-Za-z]{1,3})\s*列/g;
const LAYER_RE = /@(?:这个图层|图层\s*([^\s@]+))/g;

export function parseAtMentions(
  prompt: string,
  catalog: readonly AgentSelection[] = [],
): MentionHit[] {
  const hits: MentionHit[] = [];
  const seen = new Set<string>();
  const push = (hit: MentionHit) => {
    if (seen.has(hit.raw)) return;
    seen.add(hit.raw);
    hits.push(hit);
  };
  const source = typeof prompt === "string" ? prompt : "";
  for (const match of source.matchAll(PAGE_RE)) {
    const token = pageToken(match[1]);
    const found = lookup(catalog, "page", token);
    push({
      raw: match[0],
      kind: "page",
      id: found?.id || `page-${token}`,
      summary: found?.summary || `第${token}页`,
    });
  }
  for (const match of source.matchAll(COL_RE)) {
    const token = match[1];
    const found = lookup(catalog, "column", token);
    push({
      raw: match[0],
      kind: "column",
      id: found?.id || `column-${token.toUpperCase()}`,
      summary: found?.summary || `${token.toUpperCase()} 列`,
    });
  }
  for (const match of source.matchAll(LAYER_RE)) {
    const token = match[1] || "current";
    const found =
      lookup(catalog, "layer", token) ||
      catalog.find((item) => classifyKind(item.kind) === "layer");
    push({
      raw: match[0],
      kind: "layer",
      id: found?.id || `layer-${token}`,
      summary: found?.summary || (token === "current" ? "当前图层" : `图层 ${token}`),
    });
  }
  return hits;
}

export function assembleAgentEditorContext(
  commandContext: string,
  prompt: string,
  selection: AgentSelection | null,
  catalog: readonly AgentSelection[] = [],
): string {
  const selectionCtx = buildAgentSelectionBlock(selection, prompt, catalog);
  return [commandContext, selectionCtx].filter(Boolean).join("\n\n");
}

export function buildAgentSelectionBlock(
  sel: AgentSelection | null,
  prompt: string,
  catalog: readonly AgentSelection[] = [],
): string {
  const parts: string[] = [];
  const current = formatSelectionContext(sel);
  if (current) parts.push(current);
  const mentions = parseAtMentions(prompt, catalog);
  if (mentions.length) {
    parts.push("〔提到的对象〕");
    for (const hit of mentions) {
      parts.push(`${hit.kind} ${hit.id}：${hit.summary}`);
    }
  }
  return parts.join("\n");
}
