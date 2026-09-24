"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  MEMORY_CONTENT_MAX_CHARS,
  addMemory,
  countChars,
  deleteMemory,
  updateMemory,
  type MemoryItem,
  type MemoryKind,
  type PersonalizationApiCode,
} from "../../../lib/personalization-api";
import { ConfirmDialog, Select, SkeletonLine, Switch } from "../../../ui";
import {
  CARD,
  CARD_TITLE,
  FIELD,
  KIND_BADGE,
  Note,
  PRIMARY,
  QUIET,
  accentStyle,
  errorCopy,
  kindLabel,
} from "./parts";
import type { MemoriesState } from "./state";

const SUMMARY_COUNT = 3;

export function MemoryListCard({
  accent,
  memories,
  onMemoriesChange,
  onRetry,
}: {
  accent?: string;
  memories: MemoriesState;
  onMemoriesChange: (update: (items: MemoryItem[]) => MemoryItem[]) => void;
  onRetry: () => void;
}) {
  const tt = useUI();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<MemoryKind>("preference");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<PersonalizationApiCode | null>(null);
  const [confirming, setConfirming] = useState<MemoryItem | null>(null);

  const items = memories.status === "ready" ? memories.items : [];
  const content = draft.trim();
  const contentChars = countChars(content);
  const contentTooLong = contentChars > MEMORY_CONTENT_MAX_CHARS;
  const canAdd = contentChars > 0 && !contentTooLong && !adding;

  async function add() {
    if (!canAdd) return;
    setAdding(true);
    setError(null);
    const res = await addMemory({ content, kind });
    setAdding(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const created = res.data;
    setDraft("");
    onMemoriesChange((list) => [created, ...list.filter((m) => m.id !== created.id)]);
  }

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

  const addForm = (
    <div className="mt-4 space-y-2" data-personalization-memory-add>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <input
          className={`${FIELD} min-w-0 flex-1`}
          placeholder={tt("例如：默认先给结论，再列出可执行步骤")}
          value={draft}
          aria-invalid={contentTooLong}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void add();
            }
          }}
          data-personalization-memory-input
        />
        <Select<MemoryKind>
          className="w-full shrink-0 sm:w-32"
          options={[
            { id: "fact", label: tt("事实") },
            { id: "preference", label: tt("偏好") },
            { id: "recipe", label: tt("做法") },
          ]}
          value={kind}
          onChange={setKind}
        />
        <button
          type="button"
          className={`${PRIMARY} shrink-0`}
          style={accentStyle(accent)}
          disabled={!canAdd}
          onClick={() => void add()}
          data-personalization-memory-submit
        >
          {tt("添加")}
        </button>
      </div>
      {contentTooLong ? (
        <p className="text-[11px] text-red-600">
          {tt("最多 {n} 字", { n: MEMORY_CONTENT_MAX_CHARS })}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className={CARD} data-personalization-card="memories">
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

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <p className={CARD_TITLE}>{tt("来自对话的记忆")}</p>
          {memories.status === "ready" ? (
            <span className="text-[12px] text-neutral-500" data-personalization-memory-count>
              {tt("{n} 条", { n: items.length })}
            </span>
          ) : null}
        </div>
        {memories.status === "ready" && items.length > 0 ? (
          <button
            type="button"
            className={QUIET}
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            data-personalization-memory-expand
          >
            {expanded ? tt("收起") : tt("展开")}
          </button>
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
        <>
          <p className="mt-3 text-[13px] text-neutral-500" data-personalization-memory-empty>
            {tt("还没有记忆。")}{" "}
            {tt("开着「生成对话记忆」时，OceanLeo 会从对话里记下你的偏好；你也可以手动添加。")}
          </p>
          {addForm}
        </>
      ) : null}

      {memories.status === "ready" && items.length > 0 && !expanded ? (
        <ul className="mt-3 space-y-1.5" data-personalization-memory-summary>
          {items.slice(0, SUMMARY_COUNT).map((item) => (
            <li
              key={item.id}
              className={`line-clamp-1 text-[13px] ${item.enabled ? "text-neutral-700" : "text-neutral-400"}`}
            >
              {item.content}
            </li>
          ))}
        </ul>
      ) : null}

      {memories.status === "ready" && items.length > 0 && expanded ? (
        <>
          <ul className="mt-3 divide-y divide-neutral-100" data-personalization-memory-list>
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 py-3"
                data-personalization-memory={item.id}
              >
                <div className="min-w-0">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_BADGE[item.kind]}`}
                  >
                    {kindLabel(item.kind, tt)}
                  </span>
                  <p
                    className={`mt-1 whitespace-pre-wrap break-words text-[13px] ${
                      item.enabled ? "text-neutral-900" : "text-neutral-400"
                    }`}
                  >
                    {item.content}
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-400">
                    {item.use_count > 0 ? tt("已应用 {n} 次", { n: item.use_count }) : tt("尚未应用")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={item.enabled}
                    onChange={(next) => void toggleItem(item, next)}
                    label={item.enabled ? tt("已启用") : tt("已停用")}
                  />
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-[12px] text-red-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-red-50"
                    onClick={() => setConfirming(item)}
                    data-personalization-memory-delete={item.id}
                  >
                    {tt("删除")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {addForm}
        </>
      ) : null}

      {error ? (
        <div className="mt-3">
          <Note kind="error" text={errorCopy(error, tt)} />
        </div>
      ) : null}
    </div>
  );
}
