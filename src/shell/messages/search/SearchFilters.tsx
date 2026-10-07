"use client";

// 搜索筛选：会话、发送人、类型、时间。把界面状态翻成接口参数的规则写成纯函数。
import { useUI } from "../../../i18n/ui/useUI";
import type { SearchParams } from "../../../lib/im/search-api";
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

const selectClass =
  "min-w-0 rounded-lg border-0 bg-neutral-100/80 px-2 py-1.5 text-[12px] text-neutral-700 focus:outline-none";

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
  return (
    <div className="flex flex-wrap items-center gap-2" data-search-filters="">
      {conversationLocked ? null : (
        <select
          aria-label={tt("会话")}
          value={value.conversationId}
          onChange={(event) => set({ conversationId: event.target.value })}
          className={selectClass + " max-w-[10rem]"}
        >
          <option value="">{tt("全部会话")}</option>
          {conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label={tt("发送人")}
        value={value.from}
        onChange={(event) => set({ from: event.target.value })}
        className={selectClass + " max-w-[9rem]"}
      >
        <option value="">{tt("所有发送人")}</option>
        {senders.map((sender) => (
          <option key={sender.id} value={sender.id}>
            {sender.name}
          </option>
        ))}
      </select>
      <select
        aria-label={tt("类型")}
        value={value.kind}
        onChange={(event) => set({ kind: event.target.value as ImMessageKind | "" })}
        className={selectClass}
      >
        {SEARCH_KINDS.map((entry) => (
          <option key={entry.kind} value={entry.kind}>
            {tt(entry.label)}
          </option>
        ))}
      </select>
      <select
        aria-label={tt("时间")}
        value={value.range}
        onChange={(event) => set({ range: event.target.value as TimeRange })}
        className={selectClass}
      >
        <option value="any">{tt("不限时间")}</option>
        <option value="day">{tt("最近一天")}</option>
        <option value="week">{tt("最近 7 天")}</option>
        <option value="month">{tt("最近 30 天")}</option>
        <option value="custom">{tt("自定义范围")}</option>
      </select>
      {value.range === "custom" ? (
        <span className="flex items-center gap-1 text-[12px] text-neutral-500">
          <input
            type="date"
            aria-label={tt("开始日期")}
            value={value.customAfter}
            max={value.customBefore || undefined}
            onChange={(event) => set({ customAfter: event.target.value })}
            className={selectClass}
          />
          —
          <input
            type="date"
            aria-label={tt("结束日期")}
            value={value.customBefore}
            min={value.customAfter || undefined}
            onChange={(event) => set({ customBefore: event.target.value })}
            className={selectClass}
          />
        </span>
      ) : null}
      {filtersActive(value) && !(conversationLocked && !value.from && !value.kind && value.range === "any") ? (
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FILTERS, conversationId: conversationLocked ? value.conversationId : "" })}
          className="text-[12px] text-neutral-500 underline hover:text-neutral-800"
        >
          {tt("清除筛选")}
        </button>
      ) : null}
    </div>
  );
}
