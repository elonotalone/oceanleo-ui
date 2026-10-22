"use client";

// 来电浮层（任务书 P3/P4；合同 §1 A2）。MessagesHost 在消息可用时全局挂一次，在 OceanLeo 任意页面都能弹。
//   - 卡片：主叫头像与名字、「邀请你通话」、接听 / 拒绝；45 秒后自动收起；
//   - 铃声：Web Audio 合成（ringtone.ts）；多个标签页只响一次（ring-leader.ts）；
//     浏览器拦了自动播放 → 卡片里给可见提示，点一下开启声音；
//   - 推送深链：LeoChatPage 登记的待核实来电，`GET …/call` 核实仍在进行才弹卡片（不响铃：人已经点开了）。
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { getUserId } from "../../../../lib/auth/client";
import { callsApi } from "../../../../lib/im/calls-api";
import { messagesApi } from "../../../../lib/im/messages-api";
import type { ImProfile } from "../../../../lib/im/types";
import { useToast } from "../../../../ui/Toast";
import { callErrorCode, isLivePhase } from "../chat/call-entry";
import { CallAvatar, HandsetIcon, HeadphonesIcon } from "../chat/call-visuals";
import { sanitizeCallView } from "../chat/conversation-calls";
import { callErrorText } from "../chat/use-call-entry";
import { callActions, callStore, useCall } from "../engine";
import { pendingCallLink, setPendingCallLink, subscribePendingCallLink } from "./deep-link";
import {
  acceptIncomingCard,
  declineIncomingCard,
  pickIncoming,
  withHandled,
  type IncomingActions,
  type IncomingCardModel,
  type LinkIncomingLike,
} from "./incoming-model";
import { browserRingLeaderDeps, claimRing } from "./ring-leader";
import { browserRingtoneDeps, createRingtone, type RingStartResult, type Ringtone } from "./ringtone";

// ── 主叫资料（头像 / 名字），按 id 缓存 ─────────────────────────────────────
const profileCache = new Map<string, ImProfile | null>();
const profileInflight = new Map<string, Promise<ImProfile | null>>();

function loadProfile(userId: string): Promise<ImProfile | null> {
  if (profileCache.has(userId)) return Promise.resolve(profileCache.get(userId) ?? null);
  const pending = profileInflight.get(userId);
  if (pending) return pending;
  const request = messagesApi
    .profiles([userId])
    .then((items) => {
      const found = items.find((item) => item.user_id === userId) ?? null;
      profileCache.set(userId, found);
      return found;
    })
    .catch(() => null)
    .finally(() => {
      profileInflight.delete(userId);
    });
  profileInflight.set(userId, request);
  return request;
}

function useCallerProfile(userId: string | null): ImProfile | null {
  const [profile, setProfile] = useState<ImProfile | null>(() => (userId ? profileCache.get(userId) ?? null : null));
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return undefined;
    }
    let alive = true;
    setProfile(profileCache.get(userId) ?? null);
    void loadProfile(userId).then((found) => {
      if (alive) setProfile(found);
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  return profile;
}

const INCOMING_ACTIONS: IncomingActions = {
  acceptRing: () => callActions.acceptIncoming(),
  declineRing: () => callActions.declineIncoming(),
  async joinLink(card) {
    // 卡片上已经写明「接听将离开当前通话」，这里不再二次确认。
    if (isLivePhase(callStore.getSnapshot().phase)) await callActions.leave("switch");
    await callActions.join(card.callId, card.conversationId, card.callerName ? { title: card.callerName } : undefined);
  },
  declineLink: (callId) => callsApi.decline(callId),
};

type RingUiState = "idle" | "other_tab" | RingStartResult;

/** 来电卡片的层级（`signals/W07-to-W08.md` 第 4 条：≥1160）。 */
export const INCOMING_Z = 1160;

/**
 * 外层：只管状态（来源、45 秒、已处理）与铃声，空闲时什么都不渲染、不调用文案钩子——
 * MessagesHost 在每个页面都挂它，空闲路径要尽量轻。
 */
export function IncomingCallHost() {
  const call = useCall();
  const engineIncoming = call.incoming;
  const liveCallId = isLivePhase(call.phase) ? call.callId : null;

  const [handled, setHandled] = useState<ReadonlySet<string>>(() => new Set());
  const [engineSeen, setEngineSeen] = useState<{ callId: string; at: number } | null>(null);
  const [link, setLink] = useState<LinkIncomingLike | null>(null);
  const [, setTick] = useState(0);
  const [ring, setRing] = useState<RingUiState>("idle");
  const ringtoneRef = useRef<Ringtone | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 引擎来电第一次出现的时刻（45 秒从这里起算）。
  const engineCallId = engineIncoming?.callId ?? null;
  useEffect(() => {
    if (!engineCallId) return;
    setEngineSeen((current) => (current?.callId === engineCallId ? current : { callId: engineCallId, at: Date.now() }));
  }, [engineCallId]);

  // 推送深链：核实这通还在进行，才弹卡片。
  const pending = useSyncExternalStore(subscribePendingCallLink, pendingCallLink, () => null);
  const processedLink = useRef(0);
  useEffect(() => {
    if (!pending || pending.id === processedLink.current) return;
    processedLink.current = pending.id;
    const target = pending;
    void (async () => {
      try {
        const [status, me] = await Promise.all([callsApi.status(target.conversationId), getUserId().catch(() => null)]);
        const view = sanitizeCallView(status?.call ?? null, target.conversationId);
        if (!view || view.status !== "active" || view.call_id !== target.callId) return;
        const ringCaller = view.ring && typeof view.ring.caller_id === "string" ? view.ring.caller_id : "";
        const callerId = ringCaller || view.started_by;
        if (!callerId || (me && callerId === me)) return;
        const profile = await loadProfile(callerId);
        if (!mounted.current) return;
        setLink({
          callId: view.call_id,
          conversationId: target.conversationId,
          callerId,
          callerName: profile?.display_name ?? "",
          seenAt: Date.now(),
        });
      } catch {
        /* 核实不了就不弹：会话已经打开了，用户可以在会话里点「通话」 */
      } finally {
        if (pendingCallLink()?.id === target.id) setPendingCallLink(null);
      }
    })();
  }, [pending]);

  const now = Date.now();
  const card = pickIncoming({
    engine: engineIncoming,
    engineFirstSeenAt: engineSeen && engineSeen.callId === engineCallId ? engineSeen.at : null,
    link,
    handled,
    liveCallId,
    now,
  });
  const cardCallId = card?.callId ?? null;
  const cardSource = card?.source ?? null;
  const cardDeadline = card?.deadline ?? 0;

  // 到点收起（铃声随卡片一起停）。
  useEffect(() => {
    if (!cardCallId) return undefined;
    const wait = Math.max(0, cardDeadline - Date.now());
    const timer = setTimeout(() => {
      setHandled((current) => withHandled(current, cardCallId));
      setTick((n) => n + 1);
    }, wait);
    return () => clearTimeout(timer);
  }, [cardCallId, cardDeadline]);

  // 铃声：只有实时来电响；多个标签页只有一个响。
  useEffect(() => {
    if (!cardCallId || cardSource !== "ring") return undefined;
    let alive = true;
    const claim = claimRing(browserRingLeaderDeps(), cardCallId);
    const tone = createRingtone(browserRingtoneDeps());
    ringtoneRef.current = tone;
    void claim.won.then(async (won) => {
      if (!alive) return;
      if (!won) {
        setRing("other_tab");
        return;
      }
      const result = await tone.start();
      if (alive) setRing(result);
    });
    return () => {
      alive = false;
      tone.stop();
      claim.release();
      if (ringtoneRef.current === tone) ringtoneRef.current = null;
      setRing("idle");
    };
  }, [cardCallId, cardSource]);

  const unlockSound = useCallback(() => {
    const tone = ringtoneRef.current;
    if (!tone) return;
    void tone.unlock().then((result) => {
      if (ringtoneRef.current === tone) setRing(result);
    });
  }, []);

  const callerProfile = useCallerProfile(card?.callerId ?? null);

  const markHandled = useCallback((callId: string) => {
    setHandled((current) => withHandled(current, callId));
  }, []);

  if (!card) return null;
  return (
    <IncomingCallCard
      card={card}
      ring={ring}
      callerProfile={callerProfile}
      liveCallId={liveCallId}
      onUnlockSound={unlockSound}
      onHandled={markHandled}
    />
  );
}

/** 内层：卡片本身（文案、接听 / 拒接）。只在有来电时挂载。 */
function IncomingCallCard({
  card,
  ring,
  callerProfile,
  liveCallId,
  onUnlockSound,
  onHandled,
}: {
  card: IncomingCardModel;
  ring: RingUiState;
  callerProfile: ImProfile | null;
  liveCallId: string | null;
  onUnlockSound(): void;
  onHandled(callId: string): void;
}) {
  const tt = useUI();
  const toast = useToast();
  const [acting, setActing] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const callerName = card.callerName || callerProfile?.display_name || tt("来电者");
  const switching = Boolean(liveCallId && liveCallId !== card.callId);
  const titleId = `incoming-call-title-${card.callId}`;

  const accept = async () => {
    if (acting) return;
    setActing(true);
    onHandled(card.callId);
    try {
      await acceptIncomingCard(INCOMING_ACTIONS, card);
    } catch (error) {
      if (callStore.getSnapshot().phase !== "error") toast.error(callErrorText(tt, callErrorCode(error)));
    } finally {
      if (mounted.current) setActing(false);
    }
  };

  const decline = async () => {
    if (acting) return;
    setActing(true);
    onHandled(card.callId);
    try {
      await declineIncomingCard(INCOMING_ACTIONS, card);
    } finally {
      if (mounted.current) setActing(false);
    }
  };

  return (
    // 层级（W07 的表）：消息浮层 999、Modal 1000、小窗 1050、放大视图 1100、通话菜单 1150 → 来电卡片 1160，放大视图开着也看得见。
    <div
      className="pointer-events-none fixed inset-x-0 top-3 flex justify-center px-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:justify-end"
      style={{ zIndex: INCOMING_Z }}
      data-incoming-call-layer=""
    >
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        data-incoming-call={card.source}
        data-incoming-call-id={card.callId}
        data-ring={ring}
        className="pointer-events-auto w-full max-w-[360px] rounded-2xl border border-black/10 bg-white p-4 text-neutral-900 shadow-2xl dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100"
      >
        <span className="sr-only" aria-live="assertive">
          {tt("{name} 邀请你通话", { name: callerName })}
        </span>
        <div className="flex items-center gap-3">
          <span className="relative shrink-0">
            <CallAvatar profile={callerProfile ?? undefined} name={callerName} size={44} />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white dark:ring-neutral-900">
              <HeadphonesIcon size={12} />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <div id={titleId} className="truncate text-[14px] font-semibold">
              {callerName}
            </div>
            <div className="text-[12.5px] text-neutral-500 dark:text-neutral-400">{tt("邀请你通话")}</div>
          </div>
        </div>
        {switching ? (
          <p className="mt-2 text-[12px] text-amber-700 dark:text-amber-400" data-incoming-switch="">
            {tt("接听将离开当前通话")}
          </p>
        ) : null}
        {ring === "blocked" ? (
          <button
            type="button"
            data-ring-unlock=""
            onClick={onUnlockSound}
            className="mt-2 w-full rounded-lg bg-amber-50 px-3 py-1.5 text-left text-[12px] text-amber-800 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300"
          >
            {tt("浏览器拦住了铃声，点这里开启声音")}
          </button>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            data-incoming-action="decline"
            disabled={acting}
            onClick={() => void decline()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-[13px] font-medium text-white hover:bg-red-600 disabled:opacity-60"
          >
            <HandsetIcon size={16} hangup />
            {tt("拒接")}
          </button>
          <button
            type="button"
            data-incoming-action="accept"
            disabled={acting}
            onClick={() => void accept()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-[13px] font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            <HandsetIcon size={16} />
            {tt("接听")}
          </button>
        </div>
      </section>
    </div>
  );
}
