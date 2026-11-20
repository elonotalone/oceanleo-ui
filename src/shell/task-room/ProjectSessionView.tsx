"use client";

// A project session (session / sites wave 2026-11-21, contract §1 / §2.1): the people conversation of one session
// inside a project — the same ConversationView LeoChat uses, with `surface="session"` (task and quote cards, the
// composer's "Task" attachment) — under a header that shows only "Project / Session" and the members. A session has
// no agent entry, no children strip, no spin-off; task cards open in the right panel.
// The root carries `data-session-project-id`: a new task draft opened from here belongs to this project.
import { useCallback, useEffect, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { ImConversationDetail } from "../../lib/im/types";
import { getConversationDetail } from "../../lib/im/groups-api";
import { projectSessionsApi, type ProjectSession } from "../../lib/project-sessions-api";
import { Breadcrumb } from "../../ui/Breadcrumb";
import { ConversationView } from "../messages/conversation/ConversationView";
import { ConversationInfoPanel } from "../messages/groups/ConversationInfoPanel";
import { Avatar } from "../messages/conversation/MessageItem";
import { useImEvent, useImResync } from "../messages/realtime/hooks";
import { openMessages } from "../messages/host-state";

export interface ProjectSessionViewProps {
  /** The session's id = its conversation id. */
  sessionId: string;
  projectId: string;
  /** The "Project" crumb: back to the project's sessions. */
  onBack: () => void;
  className?: string;
}

type SessionState =
  | { state: "loading" }
  | { state: "ready"; session: ProjectSession }
  | { state: "unavailable" }
  | { state: "missing" };

export function ProjectSessionView({ sessionId, projectId, onBack, className = "" }: ProjectSessionViewProps) {
  const tt = useUI();
  const [answer, setAnswer] = useState<{ id: string; value: SessionState } | null>(null);
  const [detail, setDetail] = useState<ImConversationDetail | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const loadSession = useCallback(() => {
    let live = true;
    void projectSessionsApi.getSession(sessionId).then((result) => {
      if (!live) return;
      const value: SessionState = result.ok && result.data?.session
        ? { state: "ready", session: result.data.session }
        : !result.ok && result.unavailable ? { state: "unavailable" } : { state: "missing" };
      setAnswer((current) => (value.state === "ready" || current?.id !== sessionId || current.value.state !== "ready")
        ? { id: sessionId, value } : current);
    });
    return () => { live = false; };
  }, [sessionId]);
  const loadDetail = useCallback(() => {
    void getConversationDetail(sessionId).then(setDetail).catch(() => undefined);
  }, [sessionId]);
  useEffect(() => {
    setDetail(null);
    setInfoOpen(false);
    loadDetail();
    return loadSession();
  }, [loadDetail, loadSession]);
  useImEvent("member.changed", (event) => {
    if (event.conversation_id === sessionId) loadDetail();
  });
  useImEvent("conversation.updated", (event) => {
    if (event.conversation.id === sessionId) loadSession();
  });
  useImResync(() => {
    loadDetail();
    loadSession();
  });

  const state: SessionState = answer?.id === sessionId ? answer.value : { state: "loading" };
  const session = state.state === "ready" ? state.session : null;
  const sessionTitle = session?.title || detail?.title || tt("未命名会话");
  const titleSlot = (
    <Breadcrumb
      label={tt("会话位置")}
      className="text-[13px]"
      items={[
        { label: session?.project.name || tt("项目"), onClick: () => onBack() },
        { label: sessionTitle },
      ]}
    />
  );
  const members = detail?.members ?? [];
  const count = session?.members_count || detail?.member_count || members.length;
  const headerActions = (
    <button
      type="button"
      onClick={() => setInfoOpen(true)}
      className="flex items-center gap-1 rounded-lg p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800"
      aria-label={tt("这个会话的成员")}
      title={tt("这个会话的成员")}
      data-session-members=""
    >
      <span className="flex -space-x-1.5">
        {members.slice(0, 3).map((member) => (
          <Avatar key={member.user_id} profile={member.profile} size={20} />
        ))}
      </span>
      {count ? <span className="text-[12px] text-stone-500">{count}</span> : null}
    </button>
  );

  if (state.state === "unavailable" || state.state === "missing") {
    return (
      <div className={`flex h-full min-h-0 min-w-0 flex-col ${className}`.trim()} data-project-session={sessionId}
        data-session-project-id={projectId} data-project-session-state={state.state}>
        <div className="flex h-11 shrink-0 items-center px-3">
          <Breadcrumb label={tt("会话位置")} className="text-[13px]" items={[{ label: tt("项目"), onClick: () => onBack() }, { label: tt("会话") }]} />
        </div>
        <p role="status" className="px-4 py-6 text-[13px] text-stone-500">
          {state.state === "unavailable" ? tt("会话功能暂未开放。") : tt("这个会话不存在，或你不在这个项目里。")}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 min-w-0 flex-col ${className}`.trim()} data-project-session={sessionId}
      data-session-project-id={projectId}>
      <div hidden={infoOpen} style={{ display: infoOpen ? "none" : "flex" }} className="min-h-0 min-w-0 flex-1 flex-col">
        <ConversationView
          conversationId={sessionId}
          layout="full"
          active={!infoOpen}
          surface="session"
          attachTaskCard
          onOpenInfo={() => setInfoOpen(true)}
          titleSlot={titleSlot}
          headerActions={headerActions}
        />
      </div>
      {infoOpen ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-project-session-info="">
          <ConversationInfoPanel
            conversationId={sessionId}
            onClose={() => setInfoOpen(false)}
            onOpenConversation={(id) => {
              setInfoOpen(false);
              openMessages({ conversationId: id });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
