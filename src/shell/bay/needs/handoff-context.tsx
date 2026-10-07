"use client";

// 逐条勾选要给对方看的内容。选中集合的 state 留在调用方（Dialog / CallHumanPane），
// 这里只有纯函数和展示：默认一条都不勾，没有「全选」。

import { useUI } from "../../../i18n/ui/useUI";
import { HANDOFF_CONTEXT_MAX_ITEMS } from "../../../api/talent-handoff";

export interface HandoffPickItem {
  kind: "message" | "artifact";
  ref: string;
  label: string;
  preview: string;
}

const PREVIEW_MAX = 140;

export function handoffCandidateKey(item: Pick<HandoffPickItem, "kind" | "ref">): string {
  return `${item.kind}:${item.ref}`;
}

export function toggleHandoffPick(
  current: ReadonlySet<string>,
  item: HandoffPickItem,
  maxPerKind = HANDOFF_CONTEXT_MAX_ITEMS,
): Set<string> {
  const key = handoffCandidateKey(item);
  const next = new Set(current);
  if (next.has(key)) {
    next.delete(key);
    return next;
  }
  const sameKind = [...next].filter((entry) => entry.startsWith(`${item.kind}:`));
  if (sameKind.length >= maxPerKind) return new Set(current);
  next.add(key);
  return next;
}

export function selectedHandoffRefs(
  items: readonly HandoffPickItem[],
  selected: ReadonlySet<string>,
): { messages: string[]; artifacts: string[] } {
  return {
    messages: items.filter((item) => item.kind === "message" && selected.has(handoffCandidateKey(item))).map((item) => item.ref),
    artifacts: items.filter((item) => item.kind === "artifact" && selected.has(handoffCandidateKey(item))).map((item) => item.ref),
  };
}

function previewOf(content: unknown): string {
  return String(content || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_MAX);
}

/** 从任务页对话流摘出可勾选的消息与产物。没有 durable id 的产物不进清单。 */
export function candidatesFromTaskMessages(messages: readonly unknown[]): HandoffPickItem[] {
  const candidates: HandoffPickItem[] = [];
  let userTurn = 0;
  let agentTurn = 0;
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const message = raw as {
      id?: unknown;
      role?: unknown;
      kind?: unknown;
      content?: unknown;
      meta?: { artifact?: { id?: string; title?: string; type?: string; url?: string } };
    };
    if (!Number.isSafeInteger(message.id) || Number(message.id) <= 0) continue;
    const artifact = message.meta?.artifact;
    if (artifact?.id) {
      candidates.push({
        kind: "artifact",
        ref: artifact.id,
        label: artifact.title || artifact.type || "产物",
        preview: previewOf(message.content || artifact.url || ""),
      });
    }
    const body = previewOf(message.content);
    if (!body) continue;
    const kind = typeof message.kind === "string" ? message.kind : "text";
    if (!["text", "report", "answer"].includes(kind)) continue;
    if (message.role === "user") {
      userTurn += 1;
      candidates.push({
        kind: "message",
        ref: String(message.id),
        label: `我说的第 ${userTurn} 句`,
        preview: body,
      });
    } else {
      agentTurn += 1;
      candidates.push({
        kind: "message",
        ref: String(message.id),
        label: `AI 的第 ${agentTurn} 段回答`,
        preview: body,
      });
    }
  }
  return candidates;
}

export function HandoffContextPicker({
  items,
  selected,
  onToggle,
}: {
  items: readonly HandoffPickItem[];
  selected: ReadonlySet<string>;
  onToggle: (item: HandoffPickItem) => void;
}) {
  const tt = useUI();
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-stone-200 px-3 py-4 text-center text-[12px] text-stone-400">
        {tt("这段对话还没有可以交出去的内容；你也可以只写一句话请人来。")}
      </p>
    );
  }
  return (
    <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-stone-200 p-1.5" data-bay-handoff-picks>
      {items.map((item) => {
        const key = handoffCandidateKey(item);
        const checked = selected.has(key);
        return (
          <label
            key={key}
            className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 ${checked ? "bg-stone-100" : "hover:bg-stone-50"}`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(item)}
              className="mt-0.5 shrink-0"
              data-bay-handoff-pick={key}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium text-stone-700">{tt(item.label)}</span>
                {item.kind === "artifact" ? (
                  <span className="shrink-0 rounded bg-stone-200/70 px-1 text-[10px] text-stone-600">{tt("产物")}</span>
                ) : null}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-[12px] leading-4 text-stone-500">{item.preview}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
