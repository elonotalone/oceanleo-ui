"use client";

// 搜索筛选：会话、发送人、类型、时间。把界面状态翻成接口参数的规则写成纯函数。
import { useUI } from "../../../i18n/ui/useUI";
import type { SearchParams } from "../../../lib/im/search-api";
import { CollectionFilterSelect } from "../../collection-chrome";
import type { ImMessageKind } from "../../../lib/im/types";

export type TimeRange = "any" | "day" | "week" | "month" | "custom";

export interface SearchFilterState {
  conversationId: string;
  from: string;
  kind: ImMessageKind | "";
  range: TimeRange;
  /** 自定义范围，`YYYY-MM-DD`。 */
  customAfter: string;
  customBefore: string;
}

export const EMPTY_FILTERS: SearchFilterState = {
  conversationId: "",
  from: "",
  kind: "",
  range: "any",
  customAfter: "",
  customBefore: "",
};

export const SEARCH_KINDS: ReadonlyArray<{ kind: ImMessageKind | ""; label: string }> = [
  { kind: "", label: "全部类型" },
  { kind: "text", label: "文字" },
  { kind: "image", label: "图片" },
  { kind: "file", label: "文件" },
  { kind: "video", label: "视频" },
  { kind: "voice", label: "语音" },
  { kind: "artifact", label: "作品" },
  { kind: "replay", label: "工作回放" },
];

const DAY_MS = 86_400_000;

function dayStart(value: string): string | null {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dayEnd(value: string): string | null {
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** 界面筛选 → 接口参数（时间一律转成 ISO；空值不带）。 */
export function filtersToParams(
  filters: SearchFilterState,
  now: number = Date.now(),
  fixedConversationId: string | null = null,
): Pick<SearchParams, "conversation_id" | "from" | "kind" | "before" | "after"> {
  const params: Pick<SearchParams, "conversation_id" | "from" | "kind" | "before" | "after"> = {};
  const conversationId = fixedConversationId || filters.conversationId;
  if (conversationId) params.conversation_id = conversationId;
  if (filters.from) params.from = filters.from;
  if (filters.kind) params.kind = filters.kind;
  if (filters.range === "day") params.after = new Date(now - DAY_MS).toISOString();
  else if (filters.range === "week") params.after = new Date(now - 7 * DAY_MS).toISOString();
  else if (filters.range === "month") params.after = new Date(now - 30 * DAY_MS).toISOString();
  else if (filters.range === "custom") {
    const after = filters.customAfter ? dayStart(filters.customAfter) : null;
    const before = filters.customBefore ? dayEnd(filters.customBefore) : null;
    if (after) params.after = after;
    if (before) params.before = before;
  }
  return params;
}

export function filtersActive(filters: SearchFilterState): boolean {
  return Object.entries(filters).some(([key, value]) => (key === "range" ? value !== "any" : Boolean(value)));
}

const dateClass =
  "min-w-0 rounded-lg border border-stone-200 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-stone-400";

/** Sender, type and time (and the conversation in LeoChat's list search): the shared filter select, not bare `<select>`. */
export function SearchFilters({
  value,
  onChange,
  conversations,
  senders,
  conversationLocked,
}: {
  value: SearchFilterState;
  onChange: (next: SearchFilterState) => void;
  conversations: Array<{ id: string; title: string }>;
  senders: Array<{ id: string; name: string }>;
  conversationLocked: boolean;
}) {
  const tt = useUI();
  const set = (patch: Partial<SearchFilterState>) => onChange({ ...value, ...patch });
  const ranges: Array<{ value: TimeRange; label: string }> = [
    { value: "any", label: tt("不限时间") },
    { value: "day", label: tt("最近一天") },
    { value: "week", label: tt("最近 7 天") },
    { value: "month", label: tt("最近 30 天") },
    { value: "custom", label: tt("自定义范围") },
  ];
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto" data-search-filters="">
      {conversationLocked ? null : (
        <CollectionFilterSelect
          name="conversation"
          size="compact"
          searchable
          label={tt("会话")}
          allLabel={tt("全部会话")}
          value={value.conversationId}
          options={conversations.map((conversation) => ({ value: conversation.id, label: conversation.title }))}
          onChange={(conversationId) => set({ conversationId })}
        />
      )}
      <CollectionFilterSelect
        name="sender"
        size="compact"
        searchable={senders.length > 8}
        label={tt("发送人")}
        allLabel={tt("所有发送人")}
        value={value.from}
        options={senders.map((sender) => ({ value: sender.id, label: sender.name }))}
        onChange={(from) => set({ from })}
      />
      <CollectionFilterSelect
        name="kind"
        size="compact"
        label={tt("类型")}
        value={value.kind}
        options={SEARCH_KINDS.map((entry) => ({ value: entry.kind, label: tt(entry.label) }))}
        onChange={(kind) => set({ kind: kind as ImMessageKind | "" })}
      />
      <CollectionFilterSelect
        name="time"
        size="compact"
        label={tt("时间")}
        value={value.range}
        defaultValue="any"
        options={ranges}
        onChange={(range) => set({ range: range as TimeRange })}
      />
      {value.range === "custom" ? (
        <span className="flex items-center gap-1 text-[12px] text-stone-500">
          <input
            type="date"
            aria-label={tt("开始日期")}
            value={value.customAfter}
            max={value.customBefore || undefined}
            onChange={(event) => set({ customAfter: event.target.value })}
            className={dateClass}
          />
          —
          <input
            type="date"
            aria-label={tt("结束日期")}
            value={value.customBefore}
            min={value.customAfter || undefined}
            onChange={(event) => set({ customBefore: event.target.value })}
            className={dateClass}
          />
        </span>
      ) : null}
      {filtersActive(value) && !(conversationLocked && !value.from && !value.kind && value.range === "any") ? (
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FILTERS, conversationId: conversationLocked ? value.conversationId : "" })}
          className="rounded-lg px-2 py-1 text-[12px] font-medium text-stone-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-100"
        >
          {tt("清除筛选")}
        </button>
      ) : null}
    </div>
  );
}
