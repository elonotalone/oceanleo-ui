"use client";

// 选人：按 /v1/im/directory 搜（联系人 + 同 Team + 同项目，没有全站搜人），标出谁能直接加、谁需要对方同意、谁已拉黑不可选。

import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  classifyCandidate,
  getProfiles,
  listBlocks,
  searchDirectory,
  type CandidateStatus,
} from "../../../lib/im/people-api";
import type { ImProfile } from "../../../lib/im/types";
import { PersonAvatar } from "../groups/GroupAvatar";

export interface MemberPickerProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  /** single：只能选一个（新建私聊）；multi：默认 */
  mode?: "multi" | "single";
  /** 已经在群里的人：显示「已在群里」，不可选 */
  existingIds?: string[];
  /** 不在通讯录里、但要放进候选的人（比如从别处带过来的预选）；会向后端取资料，按「同群成员」处理 */
  extraIds?: string[];
  /** 只允许能直接找到的人（私聊用：非联系人不能私聊） */
  directOnly?: boolean;
  autoFocus?: boolean;
}

const STATUS_COPY: Record<CandidateStatus, string> = {
  direct: "可直接加",
  consent: "需对方同意",
  blocked: "已拉黑，不可选",
  existing: "已在群里",
};

export function MemberPicker({
  selected,
  onChange,
  mode = "multi",
  existingIds,
  extraIds,
  directOnly = false,
  autoFocus = false,
}: MemberPickerProps) {
  const tt = useUI();
  const [query, setQuery] = useState("");
  const [directory, setDirectory] = useState<ImProfile[]>([]);
  const [extras, setExtras] = useState<ImProfile[]>([]);
  const [blockedIds, setBlockedIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const known = useRef(new Map<string, ImProfile>());
  const ticket = useRef(0);

  useEffect(() => {
    let alive = true;
    listBlocks().then(
      (items) => alive && setBlockedIds(new Set(items.map((p) => p.user_id))),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);

  const extraKey = (extraIds ?? []).join(",");
  useEffect(() => {
    let alive = true;
    const ids = extraKey ? extraKey.split(",") : [];
    getProfiles(ids).then(
      (items) => alive && setExtras(items),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [extraKey]);

  useEffect(() => {
    const mine = ++ticket.current;
    setLoading(true);
    searchDirectory(query).then(
      (items) => {
        if (mine !== ticket.current) return;
        setDirectory(items);
        setFailed(false);
        setLoading(false);
      },
      () => {
        if (mine !== ticket.current) return;
        setFailed(true);
        setLoading(false);
      },
    );
  }, [query]);

  const existing = useMemo(() => new Set(existingIds ?? []), [existingIds]);

  const candidates = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const byId = new Map<string, ImProfile>();
    for (const p of directory) byId.set(p.user_id, p);
    for (const p of extras) {
      if (byId.has(p.user_id)) continue;
      if (needle && !p.display_name.toLocaleLowerCase().includes(needle)) continue;
      byId.set(p.user_id, p);
    }
    for (const p of byId.values()) known.current.set(p.user_id, p);
    return [...byId.values()];
  }, [directory, extras, query]);

  function toggle(profile: ImProfile, status: CandidateStatus) {
    if (status === "blocked" || status === "existing") return;
    if (directOnly && status === "consent") return;
    const on = selected.includes(profile.user_id);
    if (mode === "single") {
      onChange(on ? [] : [profile.user_id]);
      return;
    }
    onChange(on ? selected.filter((id) => id !== profile.user_id) : [...selected, profile.user_id]);
  }

  return (
    <div className="flex min-h-0 flex-col gap-2" data-member-picker>
      <input
        type="search"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tt("按名字搜索联系人、同 Team、同项目的人")}
        aria-label={tt("搜索")}
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      />
      {mode === "multi" && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-picker-chips>
          {selected.map((id) => {
            const p = known.current.get(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(selected.filter((x) => x !== id))}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-neutral-200"
                aria-label={tt("移除")}
              >
                <span>{p?.display_name ?? id.slice(0, 6)}</span>
                <span aria-hidden="true">×</span>
              </button>
            );
          })}
        </div>
      )}
      <ul className="max-h-64 min-h-[96px] overflow-y-auto rounded-lg border border-neutral-100" role="listbox" aria-multiselectable={mode === "multi"}>
        {candidates.map((p) => {
          const status = classifyCandidate(p, { blockedIds, existingIds: existing });
          const picked = selected.includes(p.user_id);
          const unavailable = status === "blocked" || status === "existing" || (directOnly && status === "consent");
          const label =
            directOnly && status === "consent"
              ? tt("需先加联系人")
              : directOnly && status === "direct"
                ? ""
                : tt(STATUS_COPY[status]);
          return (
            <li key={p.user_id} role="option" aria-selected={picked}>
              <button
                type="button"
                disabled={unavailable}
                data-candidate={p.user_id}
                data-status={status}
                data-picked={picked ? "true" : "false"}
                onClick={() => toggle(p, status)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PersonAvatar name={p.display_name} src={p.avatar_url} seed={p.user_id} size={28} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-900">{p.display_name}</span>
                {label && (
                  <span
                    className={`shrink-0 text-[11px] ${status === "direct" ? "text-emerald-600" : status === "consent" ? "text-amber-600" : "text-neutral-400"}`}
                  >
                    {label}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${picked ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}
                >
                  {picked ? "✓" : ""}
                </span>
              </button>
            </li>
          );
        })}
        {candidates.length === 0 && (
          <li className="px-3 py-6 text-center text-[12px] text-neutral-400" data-picker-empty>
            {loading
              ? tt("加载中…")
              : failed
                ? tt("加载失败，请稍后再试。")
                : query.trim()
                  ? tt("没有找到。只能搜到联系人、同 Team、同项目的人；其他人请发邀请链接。")
                  : tt("这里还没有人。先用邀请链接加联系人吧。")}
          </li>
        )}
      </ul>
    </div>
  );
}
