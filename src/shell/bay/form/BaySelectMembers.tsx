"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImConversationSummary, ImProfile } from "../../../lib/im/types";
import { BAY_FORM_HELP_CLASS, BAY_FORM_INPUT_CLASS } from "./form-ui";
import type { BayAudienceMember } from "./bay-audience";

function profileToMember(profile: Pick<ImProfile, "user_id" | "display_name">): BayAudienceMember {
  return { userId: profile.user_id, name: profile.display_name || profile.user_id, kind: "person" };
}

function groupToMember(row: ImConversationSummary): BayAudienceMember {
  return {
    userId: `g:${row.id}`,
    name: row.title || row.id,
    kind: "group",
    conversationId: row.id,
    memberIds: [],
  };
}

export function BaySelectMembers(props: {
  selected: readonly BayAudienceMember[];
  onChange: (members: BayAudienceMember[]) => void;
  disabled?: boolean;
  pick?: "single" | "multi";
}): ReactElement {
  const tt = useUI();
  const pick = props.pick ?? "multi";
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<BayAudienceMember[]>([]);
  const [groups, setGroups] = useState<BayAudienceMember[]>([]);
  const [hits, setHits] = useState<BayAudienceMember[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    let alive = true;
    void import("../../../lib/im/people-api")
      .then(({ listContacts }) => listContacts())
      .then((rows) => {
        if (!alive) return;
        setContacts(rows.map((row) => profileToMember(row.profile)));
        setError("");
      })
      .catch(() => {
        if (alive) setError(tt("联系人暂时读不出来，也可以搜名字"));
      });
    void import("../../../lib/im/inbox-api")
      .then(({ fetchConversations }) => fetchConversations("group"))
      .then((page) => {
        if (!alive) return;
        setGroups((page.items || []).filter((row) => row && !row.dissolved).map(groupToMember));
      })
      .catch(() => {
        if (alive) setGroups([]);
      });
    return () => {
      alive = false;
    };
  }, [tt]);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      void import("../../../lib/im/people-api")
        .then(({ searchDirectory }) => searchDirectory(needle))
        .then((rows) => {
          if (alive) setHits(rows.map(profileToMember));
        })
        .catch(() => {
          if (alive) setHits([]);
        });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const selectedIds = useMemo(() => new Set(props.selected.map((row) => row.userId)), [props.selected]);
  const needle = query.trim().toLocaleLowerCase();
  const friendRows = useMemo(() => {
    const seen = new Set<string>();
    const rows: BayAudienceMember[] = [];
    for (const row of [...hits, ...contacts]) {
      if (!row.userId || seen.has(row.userId)) continue;
      seen.add(row.userId);
      rows.push(row);
    }
    return needle
      ? rows.filter((row) => row.name.toLocaleLowerCase().includes(needle) || row.userId.toLocaleLowerCase().includes(needle))
      : rows.slice(0, 24);
  }, [contacts, hits, needle]);
  const groupRows = useMemo(() => {
    return needle ? groups.filter((row) => row.name.toLocaleLowerCase().includes(needle)) : groups.slice(0, 24);
  }, [groups, needle]);

  async function pickRow(row: BayAudienceMember) {
    if (props.disabled) return;
    if (selectedIds.has(row.userId)) {
      props.onChange(props.selected.filter((item) => item.userId !== row.userId));
      return;
    }
    let next = row;
    if (row.kind === "group" && row.conversationId) {
      setBusyId(row.userId);
      try {
        const { getConversationDetail } = await import("../../../lib/im/groups-api");
        const detail = await getConversationDetail(row.conversationId);
        next = {
          ...row,
          name: detail.title || row.name,
          memberIds: (detail.members || []).map((member) => member.user_id).filter(Boolean),
        };
      } catch {
        next = row;
      } finally {
        setBusyId("");
      }
    }
    props.onChange(pick === "single" ? [next] : [...props.selected, next]);
  }

  function renderList(title: string, rows: BayAudienceMember[], empty: string) {
    return (
      <div>
        <p className={`${BAY_FORM_HELP_CLASS} mb-1`}>{title}</p>
        {rows.length === 0 ? <p className={BAY_FORM_HELP_CLASS}>{empty}</p> : null}
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {rows.map((row) => {
            const on = selectedIds.has(row.userId);
            return (
              <li key={row.userId}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-neutral-50">
                  <input
                    type={pick === "single" ? "radio" : "checkbox"}
                    name={pick === "single" ? "bay-audience-pick" : undefined}
                    checked={on}
                    disabled={props.disabled || busyId === row.userId}
                    onChange={() => void pickRow(row)}
                    data-bay-member={row.userId}
                    data-bay-member-kind={row.kind || "person"}
                  />
                  <span className="min-w-0 truncate text-[13px] text-neutral-900">{row.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div data-bay-select-members="" className="space-y-3">
      <input
        className={BAY_FORM_INPUT_CLASS}
        value={query}
        disabled={props.disabled}
        placeholder={tt("搜名字")}
        onChange={(event) => setQuery(event.target.value)}
        data-bay-select-members-q=""
      />
      {props.selected.length ? (
        <p className="text-[13px] text-neutral-700" data-bay-select-members-count="">
          {tt("已选 {n} 人", { n: props.selected.length })}
        </p>
      ) : (
        <p className={BAY_FORM_HELP_CLASS}>{tt("还没选人")}</p>
      )}
      {error ? <p className="text-[12px] text-amber-700">{error}</p> : null}
      {renderList(tt("好友"), friendRows, tt("还没有好友"))}
      {renderList(tt("群聊"), groupRows, tt("还没有群聊"))}
    </div>
  );
}
