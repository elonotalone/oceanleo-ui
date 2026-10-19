"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { getCredits } from "../../../lib/auth/account";
import { formatMoney } from "../../../lib/money";
import { ImApiError } from "../../../lib/im/client";
import { meetingsApi } from "../../../lib/im/meetings-api";
import type { ImMeetingSnapshot, ImProfile } from "../../../lib/im/types";
import { useImEvent } from "../realtime/hooks";
import { ConfirmDialog } from "../../../ui";
import { createArtcClient, type ArtcClient } from "./artc-client";
import { canJoinMeeting, meetingAvailabilityMessage, sdkUserIdForParticipant } from "./meeting-policy";

interface MeetingPanelProps {
  conversationId: string;
  conversationTitle: string;
  myUserId: string | null;
  myRole: "owner" | "admin" | "member" | null;
  profiles: Record<string, ImProfile | undefined>;
  onClose: () => void;
}

function messageForError(error: unknown, fallback: string): string {
  if (error instanceof ImApiError) {
    if (error.code === "artc_not_configured") return "本版 ARTC 尚未配置，会议暂时无法连接。";
    if (error.code === "metering_unavailable") return "计费核验能力尚未开通，会议暂不可加入。当前不会启动媒体或产生通话费用。";
    if (error.code === "meeting_unavailable") return "会议已结束或不可用，请刷新会话状态。";
    if (error.code === "insufficient_balance") return "余额不足，无法加入会议。";
    if (error.status === 0) return "网络连接中断。恢复网络后可以重新加载会议状态。";
    return error.message || fallback;
  }
  if (error instanceof Error) {
    if (error.message === "artc_browser_unsupported") return "当前浏览器不支持 ARTC，请更新浏览器后重试。";
    if (error.message === "artc_sdk_load_failed" || error.message === "artc_sdk_unavailable") return "ARTC 客户端暂时无法加载，尚未连接会议。";
  }
  return fallback;
}

export function MeetingPanel({ conversationId, conversationTitle, myUserId, myRole, profiles, onClose }: MeetingPanelProps) {
  const tt = useUI();
  const [snapshot, setSnapshot] = useState<ImMeetingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [wallet, setWallet] = useState<{ balance: number; currency: string } | null>(null);
  const [connected, setConnected] = useState(false);
  const [microphone, setMicrophone] = useState(false);
  const [camera, setCamera] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [audioSubscriptions, setAudioSubscriptions] = useState<Set<string>>(() => new Set());
  const [subscribed, setSubscribed] = useState<Set<string>>(() => new Set());
  const [confirmAction, setConfirmAction] = useState<{ action: "end" | "remove"; participantId?: string } | null>(null);
  const clientRef = useRef<ArtcClient | null>(null);
  const leavingRef = useRef(false);
  const activeMeetingIdRef = useRef<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideos = useRef(new Map<string, HTMLVideoElement>());

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await meetingsApi.get(conversationId));
      setNote("");
    } catch (error) {
      setNote(messageForError(error, "会议状态加载失败，请稍后重试。"));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => { void reload(); }, [reload]);
  useImEvent("meeting", (event) => {
    if (event.conversation_id === conversationId) {
      setSnapshot((current) => current ? { ...current, meeting: event.meeting } : current);
      void reload();
    }
  });
  useEffect(() => {
    let alive = true;
    void getCredits().then((result) => {
      if (alive && result.ok) setWallet({ balance: result.data.balance, currency: result.data.currency });
    }).catch(() => { if (alive) setWallet(null); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
  useEffect(() => () => {
    leavingRef.current = true;
    void clientRef.current?.destroy();
    clientRef.current = null;
    if (activeMeetingIdRef.current) void meetingsApi.leave(activeMeetingIdRef.current).catch(() => undefined);
    activeMeetingIdRef.current = null;
  }, []);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    for (const participantId of subscribed) {
      const video = remoteVideos.current.get(participantId);
      if (video) client.engine.setRemoteViewConfig(video, sdkUserIdForParticipant(participantId), 1);
    }
  }, [subscribed]);

  useEffect(() => {
    const video = localVideoRef.current;
    if (connected && camera && video) clientRef.current?.engine.setLocalViewConfig(video, 1);
  }, [connected, camera]);

  const meeting = snapshot?.meeting ?? null;
  const participants = meeting?.participants?.filter((participant) => participant.status === "joined") ?? [];
  const canManage = myRole === "owner" || myRole === "admin";
  const canStart = canJoinMeeting({ snapshot, wallet, online, busy, connected });
  const canCreate = !meeting && !loading && online && !busy;

  const runAction = useCallback(async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    setNote("");
    try {
      await action();
      await reload();
      if (success) setNote(success);
    } catch (error) {
      setNote(messageForError(error, "操作未完成，请稍后重试。"));
    } finally {
      setBusy(false);
    }
  }, [reload]);

  async function createMeeting() {
    await runAction(async () => { await meetingsApi.create(conversationId); }, "会议已创建。计费核验未就绪时，成员仍无法入会。");
  }

  async function joinMeeting() {
    if (!meeting || !canStart) return;
    setBusy(true);
    setNote("");
    let joinedMeetingId: string | null = null;
    try {
      const credentials = await meetingsApi.join(meeting.meeting_id);
      joinedMeetingId = credentials.meeting.meeting_id;
      const displayName = myUserId ? (profiles[myUserId]?.display_name || "OceanLeo 成员") : "OceanLeo 成员";
      const client = await createArtcClient(credentials, displayName);
      clientRef.current = client;
      activeMeetingIdRef.current = credentials.meeting.meeting_id;
      client.engine.on("localDeviceException", () => {
        setMicrophone(false);
        setCamera(false);
        setNote("麦克风或摄像头不可用，请检查设备连接和浏览器权限。未启用的设备不会发布媒体。");
      });
      client.engine.on("connectionStatusChange", (...values) => {
        const status = values.map(String).join(" ").toLowerCase();
        if (status.includes("failed") || status.includes("disconnected")) {
          setNote("会议连接中断。请检查网络；恢复连接前不会主动重新订阅媒体。");
        }
      });
      client.engine.on("bye", () => {
        if (!leavingRef.current) void leaveMeeting("已与会议断开连接。请刷新会议状态后重试。");
      });
      setConnected(true);
      setMicrophone(false);
      setCamera(false);
      await reload();
    } catch (error) {
      await clientRef.current?.destroy().catch(() => undefined);
      clientRef.current = null;
      if (joinedMeetingId) await meetingsApi.leave(joinedMeetingId).catch(() => undefined);
      activeMeetingIdRef.current = null;
      setConnected(false);
      setNote(messageForError(error, "会议连接失败；媒体未启动。"));
    } finally {
      setBusy(false);
    }
  }

  async function leaveMeeting(exitNotice?: string) {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const client = clientRef.current;
    setBusy(true);
    setNote("");
    try {
      if (client) await client.destroy();
      clientRef.current = null;
      activeMeetingIdRef.current = null;
      setConnected(false);
      setMicrophone(false);
      setCamera(false);
      setSharing(false);
      setAudioSubscriptions(new Set());
      setSubscribed(new Set());
      if (meeting) await meetingsApi.leave(meeting.meeting_id);
      await reload();
      if (exitNotice) setNote(exitNotice);
    } catch (error) {
      setNote(messageForError(error, "离开会议未完成，请检查网络后重试。"));
    } finally {
      leavingRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => {
      void getCredits().then((result) => {
        if (!result.ok || result.data.balance <= 0) {
          void leaveMeeting(result.ok ? "余额已用尽，媒体已停止并退出会议。" : "暂时无法核对本人余额，媒体已停止并退出会议。请重新连接网络后查看账单状态。");
        } else setWallet({ balance: result.data.balance, currency: result.data.currency });
      }).catch(() => {
        void leaveMeeting("无法核对本人余额，媒体已停止并退出会议。");
      });
    }, 15_000);
    return () => window.clearInterval(timer);
    // The interval should be recreated only when the active call state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  function toggleVideoSubscription(participantId: string) {
    const remoteId = sdkUserIdForParticipant(participantId);
    const next = !subscribed.has(participantId);
    try {
      clientRef.current?.subscribeVideo(remoteId, next);
      if (!next) clientRef.current?.engine.setRemoteViewConfig(null, remoteId, 1);
      setSubscribed((current) => {
        const updated = new Set(current);
        if (next) updated.add(participantId); else updated.delete(participantId);
        return updated;
      });
    } catch (error) { setNote(messageForError(error, "无法更改视频订阅。")); }
  }

  function toggleAudioSubscription(participantId: string) {
    const remoteId = sdkUserIdForParticipant(participantId);
    const next = !audioSubscriptions.has(participantId);
    try {
      clientRef.current?.subscribeAudio(remoteId, next);
      setAudioSubscriptions((current) => {
        const updated = new Set(current);
        if (next) updated.add(participantId); else updated.delete(participantId);
        return updated;
      });
    } catch (error) { setNote(messageForError(error, "无法更改音频订阅。")); }
  }

  async function toggleLocalMedia(kind: "microphone" | "camera" | "screen") {
    const client = clientRef.current;
    if (!client) return;
    try {
      if (kind === "microphone") {
        const next = !microphone;
        client.setMicrophone(next);
        setMicrophone(next);
      } else if (kind === "camera") {
        const next = !camera;
        client.setCamera(next);
        if (!next) client.engine.setLocalViewConfig(null, 1);
        setCamera(next);
      } else {
        const next = !sharing;
        client.setScreenShare(next);
        setSharing(next);
      }
    } catch (error) {
      setNote(messageForError(error, "设备暂不可用，请检查浏览器权限设置。"));
    }
  }

  async function manageMeeting(action: "end" | "remove", participantId?: string) {
    if (!meeting) return;
    await runAction(async () => {
      if (action === "end") {
        leavingRef.current = true;
        try {
          await clientRef.current?.destroy();
          clientRef.current = null;
          activeMeetingIdRef.current = null;
          setConnected(false);
          setMicrophone(false);
          setCamera(false);
          setSharing(false);
          setSubscribed(new Set());
          setAudioSubscriptions(new Set());
          await meetingsApi.end(meeting.meeting_id);
        } finally { leavingRef.current = false; }
      }
      else if (participantId) await meetingsApi.remove(meeting.meeting_id, participantId);
    });
  }

  const readyLabel = meetingAvailabilityMessage(snapshot);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-4" data-meeting-panel>
      <section role="dialog" aria-modal="true" aria-labelledby="meeting-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-neutral-200 bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id="meeting-title" className="truncate text-[15px] font-semibold text-neutral-900">{tt("会话会议")}</h2>
            <p className="truncate text-xs text-neutral-500">{conversationTitle}</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100">{tt("关闭")}</button>
        </header>
        <div className="min-h-0 overflow-y-auto p-4">
          {!online ? <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">网络已断开。恢复网络后请刷新会议状态。</p> : null}
          {note ? <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{note}</p> : null}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-neutral-800">{meeting?.status === "active" ? "会议进行中" : meeting?.status === "ended" ? "会议已结束" : "当前没有会议"}</span>
              {meeting?.status === "active" ? <span className="text-xs text-neutral-500">{participants.length} 位成员在线</span> : null}
            </div>
            <p className="mt-2 text-xs leading-5 text-neutral-600">{readyLabel}</p>
            <p className="mt-2 text-xs leading-5 text-neutral-600">参会者各自使用自己的余额。音频可能在独自参会或静音时产生费用；视频费用取决于本人实际订阅的远端视频。此处不提供未经核验的实时费用估算。</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600">
              <span>本人余额：{wallet ? formatMoney(wallet.balance, wallet.currency, 2) : "暂不可读取"}</span>
              {wallet && wallet.balance <= 0 ? <span className="font-medium text-rose-700">余额不足，无法加入</span> : null}
            </div>
          </div>

          {loading ? <p className="py-8 text-center text-sm text-neutral-500">正在加载…</p> : null}
          {!loading && !meeting ? <div className="mt-4 flex justify-end"><button type="button" disabled={!canCreate} onClick={() => void createMeeting()} className="min-h-11 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">发起会议</button></div> : null}

          {meeting ? <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" data-meeting-stage>
              {participants.length ? participants.map((participant) => {
                const profile = profiles[participant.user_id];
                const isMe = participant.user_id === myUserId;
                return <article key={participant.participant_id} className="relative min-h-32 overflow-hidden rounded-xl bg-neutral-900 p-3 text-white" data-participant-id={participant.participant_id}>
                  {!isMe && subscribed.has(participant.participant_id) ? <video ref={(element) => {
                    if (element) remoteVideos.current.set(participant.participant_id, element);
                    else remoteVideos.current.delete(participant.participant_id);
                  }} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" aria-label={`${profile?.display_name || "成员"} 视频`} /> : null}
                  {isMe && camera ? <video ref={localVideoRef} muted autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" aria-label="我的摄像头预览" /> : null}
                  <div className="relative z-10 flex h-full min-h-[6rem] items-end justify-between gap-2">
                    <span className="rounded bg-black/45 px-2 py-1 text-xs">{profile?.display_name || (isMe ? "我" : "成员")}{isMe ? " · 我" : ""}</span>
                    {isMe ? <span className="text-[11px] text-white/80">{microphone ? "麦克风已开" : "麦克风已关"}{sharing ? " · 正在共享屏幕" : ""}</span> : null}
                  </div>
                </article>;
              }) : <p className="col-span-full rounded-lg border border-dashed border-neutral-300 px-3 py-5 text-center text-sm text-neutral-500">尚无在线成员</p>}
            </div>

            {connected ? <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void toggleLocalMedia("microphone")} className="min-h-11 rounded-lg border border-neutral-300 px-3 text-sm">{microphone ? "关闭麦克风" : "打开麦克风"}</button>
              <button type="button" onClick={() => void toggleLocalMedia("camera")} className="min-h-11 rounded-lg border border-neutral-300 px-3 text-sm">{camera ? "关闭摄像头" : "打开摄像头"}</button>
              <button type="button" onClick={() => void toggleLocalMedia("screen")} className="min-h-11 rounded-lg border border-neutral-300 px-3 text-sm">{sharing ? "停止共享" : "共享屏幕"}</button>
              {canManage ? <button type="button" disabled={busy} onClick={() => setConfirmAction({ action: "end" })} className="min-h-11 rounded-lg border border-rose-300 px-3 text-sm text-rose-700 disabled:opacity-50">结束会议</button> : null}
              <button type="button" disabled={busy} onClick={() => void leaveMeeting()} className="min-h-11 rounded-lg bg-rose-700 px-3 text-sm text-white disabled:opacity-50">离开会议</button>
            </div> : null}

            {connected && participants.some((participant) => participant.user_id !== myUserId) ? <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold text-neutral-700">远端媒体订阅（默认关闭）</h3>
              <div className="flex flex-wrap gap-2">{participants.filter((participant) => participant.user_id !== myUserId).map((participant) => {
                const profile = profiles[participant.user_id];
                const selected = subscribed.has(participant.participant_id);
                return <button key={participant.participant_id} type="button" aria-pressed={selected} onClick={() => toggleVideoSubscription(participant.participant_id)} className="min-h-11 rounded-lg border border-neutral-300 px-3 text-xs">{selected ? "停止接收" : "接收"} {profile?.display_name || "成员"} 的视频</button>;
              })}</div>
              <div className="mt-2 flex flex-wrap gap-2">{participants.filter((participant) => participant.user_id !== myUserId).map((participant) => {
                const profile = profiles[participant.user_id];
                const selected = audioSubscriptions.has(participant.participant_id);
                return <button key={participant.participant_id} type="button" aria-pressed={selected} onClick={() => toggleAudioSubscription(participant.participant_id)} className="min-h-11 rounded-lg border border-neutral-300 px-3 text-xs">{selected ? "停止接收" : "接收"} {profile?.display_name || "成员"} 的音频</button>;
              })}</div>
            </div> : null}

            {!connected && meeting.status === "active" ? <div className="mt-4 flex flex-wrap justify-end gap-2">
              {canManage ? <button type="button" disabled={busy || !online} onClick={() => setConfirmAction({ action: "end" })} className="min-h-11 rounded-lg border border-rose-300 px-3 text-sm text-rose-700 disabled:opacity-50">结束会议</button> : null}
              <button type="button" disabled={!canStart} onClick={() => void joinMeeting()} className="min-h-11 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "连接中…" : "加入会议"}</button>
            </div> : null}

            {!connected && meeting.status === "ended" ? <p className="mt-4 text-right text-sm text-neutral-500">本次会议已关闭。</p> : null}
            {canManage && meeting.status === "active" && participants.some((participant) => participant.user_id !== myUserId) ? <div className="mt-4 border-t border-neutral-200 pt-3">
              <h3 className="mb-2 text-xs font-semibold text-neutral-600">主持人操作</h3>
              {participants.filter((participant) => participant.user_id !== myUserId).map((participant) => <button key={participant.participant_id} type="button" onClick={() => setConfirmAction({ action: "remove", participantId: participant.participant_id })} className="mr-2 min-h-11 rounded-lg px-2 text-xs text-rose-700 hover:bg-rose-50">移除 {profiles[participant.user_id]?.display_name || "成员"}</button>)}
            </div> : null}
          </> : null}
          {confirmAction ? <ConfirmDialog
            title={confirmAction.action === "end" ? "结束会议" : "移除成员"}
            body={confirmAction.action === "end" ? "结束后，所有成员都将断开，不能继续加入。" : "确定将该成员移出会议吗？"}
            confirmLabel={confirmAction.action === "end" ? "结束会议" : "移除成员"}
            danger
            onCancel={() => setConfirmAction(null)}
            onConfirm={async () => {
              const pending = confirmAction;
              setConfirmAction(null);
              if (pending) await manageMeeting(pending.action, pending.participantId);
            }}
          /> : null}
        </div>
      </section>
    </div>
  );
}
