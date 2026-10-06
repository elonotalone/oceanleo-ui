"use client";

/**
 * 「邀请一起改」：选一个会话和权限（可以一起编辑 / 只能查看实时变化）→
 * 把作品的同改权限授给会话里当时的全部成员 → 往会话发一张作品卡（带 coedit 信息）。
 * 发消息用 W09 的 `messagesApi.sendMessage`（import，不复制）。
 */
import { useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { Modal } from "../../ui";
import { Button } from "../../ui/Button";
import { imFetch, useImEnabled } from "../../lib/im/client";
import { messagesApi } from "../../lib/im/messages-api";
import type { ImConversationSummary, ImEditorKind } from "../../lib/im/types";
import type { CollabRole, CollabRoom } from "./index";
import { CollabApiError, grantCoeditToConversation } from "./grants-api";

interface ConversationPage {
  items: ImConversationSummary[];
  next_cursor?: string | null;
}

function newClientId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `collab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CollabInviteButton({
  room,
  artifact,
}: {
  room: CollabRoom | null;
  artifact: { id: string; title: string; editorKind: ImEditorKind };
}) {
  const tt = useUI();
  const enabled = useImEnabled();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <Button variant="ghost" data-collab-invite onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true" className="text-base leading-none">＋</span>
        {tt("邀请一起改")}
      </Button>
      {open ? <InviteDialog room={room} artifact={artifact} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function InviteDialog({
  room,
  artifact,
  onClose,
}: {
  room: CollabRoom | null;
  artifact: { id: string; title: string; editorKind: ImEditorKind };
  onClose: () => void;
}) {
  const tt = useUI();
  const [items, setItems] = useState<ImConversationSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [role, setRole] = useState<CollabRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    imFetch<ConversationPage>("/v1/im/conversations?filter=all").then(
      (page) => {
        if (!alive.current) return;
        // 交易会话没有「邀请一起改」；已解散的群也不能发。
        setItems((page?.items ?? []).filter((c) => c.kind !== "talent" && !c.dissolved));
      },
      () => {
        if (alive.current) setLoadFailed(true);
      },
    );
    return () => {
      alive.current = false;
    };
  }, []);

  const roomKey = room?.roomKey ?? `artifact:${artifact.id}`;

  async function send() {
    if (!picked || busy) return;
    const conversation = items?.find((c) => c.id === picked);
    setBusy(true);
    setError(null);
    try {
      await grantCoeditToConversation(roomKey, picked, role);
      await messagesApi.sendMessage(picked, {
        client_id: newClientId(),
        kind: "artifact",
        body: "",
        card: {
          type: "artifact",
          id: artifact.id,
          title: artifact.title,
          editor_kind: artifact.editorKind,
          coedit: { room_key: roomKey, role },
        },
      });
      if (alive.current) setSentTo(conversation?.title || tt("未命名会话"));
    } catch (err) {
      if (!alive.current) return;
      const status = err instanceof CollabApiError ? err.status : (err as { status?: number })?.status;
      setError(status === 403 ? tt("你没有权限邀请别人一起改这个作品") : tt("邀请没能发出，请重试"));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const titleId = "collab-invite-title";
  return (
    <Modal onClose={onClose} labelledBy={titleId} className="max-w-md">
      <div className="flex flex-col gap-3 p-5" data-collab-invite-dialog>
        <h2 id={titleId} className="text-base font-semibold text-neutral-900">
          {tt("邀请一起改")}
        </h2>
        {sentTo ? (
          <>
            <p role="status" className="text-sm text-neutral-700">
              {tt("已发进「{title}」", { title: sentTo })}
            </p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={onClose}>
                {tt("关闭")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-600">{tt("把这个作品发进一个会话，让里面的人一起改")}</p>
            <div role="radiogroup" aria-label={tt("选择一个会话")} className="max-h-56 overflow-y-auto rounded-lg border border-neutral-200">
              {items === null && !loadFailed ? (
                <p className="p-3 text-sm text-neutral-500">{tt("正在加载会话…")}</p>
              ) : loadFailed ? (
                <p role="alert" className="p-3 text-sm text-red-600">
                  {tt("会话列表加载失败，请重试")}
                </p>
              ) : items && items.length === 0 ? (
                <p className="p-3 text-sm text-neutral-500">{tt("还没有可选的会话。先到「消息」里建一个。")}</p>
              ) : (
                items?.map((c) => (
                  <Button
                    key={c.id}
                    variant="ghost"
                    block
                    align="start"
                    role="radio"
                    aria-checked={picked === c.id}
                    selected={picked === c.id}
                    onClick={() => setPicked(c.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">{c.title || c.peer?.display_name || tt("未命名会话")}</span>
                  </Button>
                ))
              )}
            </div>
            <div role="radiogroup" aria-label={tt("邀请一起改")} className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                role="radio"
                aria-checked={role === "editor"}
                selected={role === "editor"}
                onClick={() => setRole("editor")}
              >
                {tt("可以一起编辑")}
              </Button>
              <Button
                variant="secondary"
                role="radio"
                aria-checked={role === "viewer"}
                selected={role === "viewer"}
                onClick={() => setRole("viewer")}
              >
                {tt("只能查看实时变化")}
              </Button>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {tt("取消")}
              </Button>
              <Button variant="primary" disabled={!picked} loading={busy} loadingLabel={tt("发送邀请")} onClick={() => void send()}>
                {tt("发送邀请")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
