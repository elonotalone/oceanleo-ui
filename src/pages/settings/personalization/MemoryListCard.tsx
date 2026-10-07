"use client";

import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  MEMORY_CONTENT_MAX_CHARS,
  countChars,
  deleteMemory,
  updateMemory,
  type MemoryItem,
  type PersonalizationApiCode,
} from "../../../lib/personalization-api";
import { ConfirmDialog, SkeletonLine, Switch } from "../../../ui";
import {
  CARD,
  CARD_TITLE,
  FIELD,
  KIND_BADGE,
  Note,
  QUIET,
  errorCopy,
  kindLabel,
} from "./parts";
import type { MemoriesState } from "./state";

export function MemoryListCard({
  memories,
  onMemoriesChange,
  onRetry,
}: {
  memories: MemoriesState;
  onMemoriesChange: (update: (items: MemoryItem[]) => MemoryItem[]) => void;
  onRetry: () => void;
}) {
  const tt = useUI();
  const [error, setError] = useState<PersonalizationApiCode | null>(null);
  const [confirming, setConfirming] = useState<MemoryItem | null>(null);

  const items = memories.status === "ready" ? memories.items : [];

  async function toggleItem(item: MemoryItem, next: boolean) {
    setError(null);
    onMemoriesChange((list) => list.map((m) => (m.id === item.id ? { ...m, enabled: next } : m)));
    const res = await updateMemory(item.id, { enabled: next });
    if (!res.ok) {
      onMemoriesChange((list) =>
        list.map((m) => (m.id === item.id ? { ...m, enabled: item.enabled } : m)),
      );
      setError(res.error);
    }
  }

  async function saveContent(item: MemoryItem, next: string) {
    const content = next.trim();
    if (!content || content === item.content) return;
    if (countChars(content) > MEMORY_CONTENT_MAX_CHARS) {
      setError("invalid");
      return;
    }
    setError(null);
    onMemoriesChange((list) => list.map((m) => (m.id === item.id ? { ...m, content } : m)));
    const res = await updateMemory(item.id, { content });
    if (!res.ok) {
      onMemoriesChange((list) =>
        list.map((m) => (m.id === item.id ? { ...m, content: item.content } : m)),
      );
      setError(res.error);
    }
  }

  async function remove(item: MemoryItem) {
    setConfirming(null);
    setError(null);
    const index = items.findIndex((m) => m.id === item.id);
    onMemoriesChange((list) => list.filter((m) => m.id !== item.id));
    const res = await deleteMemory(item.id);
    if (res.ok || res.error === "not_found") return;
    onMemoriesChange((list) => {
      if (list.some((m) => m.id === item.id)) return list;
      const at = index < 0 ? 0 : Math.min(index, list.length);
      return [...list.slice(0, at), item, ...list.slice(at)];
    });
    setError(res.error);
  }

  return (
    <div className={`${CARD} flex h-full min-h-0 flex-col`} data-personalization-card="memories">
      {confirming ? (
        <ConfirmDialog
          title={tt("删除这条记忆？")}
          body={tt("删除后 OceanLeo 不会再使用这条记忆。")}
          confirmLabel={tt("删除")}
          danger
          onConfirm={() => remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      <div className="flex min-w-0 items-baseline gap-2">
        <p className={CARD_TITLE}>{tt("来自对话的记忆")}</p>
        {memories.status === "ready" ? (
          <span className="text-[12px] text-neutral-500" data-personalization-memory-count>
            {tt("{n} 条", { n: items.length })}
          </span>
        ) : null}
      </div>

      {memories.status === "loading" ? (
        <div className="mt-4 space-y-2">
          <SkeletonLine className="h-3 w-4/5" />
          <SkeletonLine className="h-3 w-2/5" />
          <SkeletonLine className="h-3 w-2/3" />
        </div>
      ) : null}

      {memories.status === "failed" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Note kind="error" text={errorCopy(memories.code, tt)} />
          <button type="button" className={QUIET} onClick={onRetry}>
            {tt("重试")}
          </button>
        </div>
      ) : null}

      {memories.status === "ready" && items.length === 0 ? (
        <p className="mt-3 text-[13px] text-neutral-500" data-personalization-memory-empty>
          {tt("还没有记忆。")} {tt("开着「生成对话记忆」时，OceanLeo 会从对话里记下你的偏好。")}
        </p>
      ) : null}

      {memories.status === "ready" && items.length > 0 ? (
        <ul className="mt-3 min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto" data-personalization-memory-list>
          {items.map((item) => (
            <MemoryRow
              key={item.id}
              item={item}
              onToggle={(next) => void toggleItem(item, next)}
              onSave={(next) => void saveContent(item, next)}
              onDelete={() => setConfirming(item)}
            />
          ))}
        </ul>
      ) : null}

      {error ? (
        <div className="mt-3">
          <Note kind="error" text={errorCopy(error, tt)} />
        </div>
      ) : null}
    </div>
  );
}

function MemoryRow({
  item,
  onToggle,
  onSave,
  onDelete,
}: {
  item: MemoryItem;
  onToggle: (next: boolean) => void;
  onSave: (next: string) => void;
  onDelete: () => void;
}) {
  const tt = useUI();
  const [draft, setDraft] = useState(item.content);
  useEffect(() => {
    setDraft(item.content);
  }, [item.content]);
  const tooLong = countChars(draft.trim()) > MEMORY_CONTENT_MAX_CHARS;

  return (
    <li
      className="flex flex-col gap-2 py-3"
      data-personalization-memory={item.id}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_BADGE[item.kind]}`}>
          {kindLabel(item.kind, tt)}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={item.enabled}
            onChange={onToggle}
            label={item.enabled ? tt("已启用") : tt("已停用")}
          />
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[12px] text-red-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-red-50"
            onClick={onDelete}
            data-personalization-memory-delete={item.id}
          >
            {tt("删除")}
          </button>
        </div>
      </div>
      <textarea
        className={`${FIELD} min-h-[4.5rem] resize-y text-[13px] ${item.enabled ? "" : "opacity-60"}`}
        value={draft}
        aria-invalid={tooLong}
        data-personalization-memory-content={item.id}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (!tooLong) onSave(draft);
        }}
      />
      {tooLong ? (
        <p className="text-[11px] text-red-600">{tt("最多 {n} 字", { n: MEMORY_CONTENT_MAX_CHARS })}</p>
      ) : (
        <p className="text-[11px] text-neutral-400">
          {item.use_count > 0 ? tt("已应用 {n} 次", { n: item.use_count }) : tt("尚未应用")}
        </p>
      )}
    </li>
  );
}
