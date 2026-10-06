// 画面类编辑器（PPT / 图片 / 图表）共用的「看见别人选中了什么」（work-chat W13，_EDITORS.md 第 7 条）。
//
// awareness 里每个人放 `{ selection: <实体 key 列表> }`；这里负责：
//   readPeerSelections  —— 纯函数：从 awareness 读出别人（不含自己任何标签页）的选择，颜色按用户 id 重算（不信他自报），
//                           名字、key 都做长度与类型收口；
//   useCollabSelections —— React 钩子：把本人的选择写进 awareness，订阅别人的变化，返回别人的选择列表。
// 房间为 null（没在协同里）时什么都不做、返回空数组。
import { useEffect, useMemo, useRef, useState } from "react";
import type { CollabRoom } from "../index";
import { sanitizeCollabUser, AWARENESS_USER_FIELD } from "../awareness";

export const AWARENESS_SELECTION_FIELD = "selection";
const MAX_KEYS = 200;
const MAX_KEY_LENGTH = 300;

export interface PeerSelection {
  userId: string;
  name: string;
  /** `hsl(h, 70%, 45%)`，按用户 id 重新算的颜色。 */
  color: string;
  keys: string[];
}

interface AwarenessLike {
  clientID: number;
  getStates(): Map<number, unknown>;
}

function cleanKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !item || item.length > MAX_KEY_LENGTH) continue;
    out.push(item);
    if (out.length >= MAX_KEYS) break;
  }
  return out;
}

/** 其他人的选择：按用户去重（同一个人开多个标签页，合并他们的选择），先进房间的在前。 */
export function readPeerSelections(awareness: AwarenessLike, selfId: string): PeerSelection[] {
  const byUser = new Map<string, PeerSelection>();
  const entries = Array.from(awareness.getStates().entries()).sort((a, b) => a[0] - b[0]);
  for (const [clientId, state] of entries) {
    if (clientId === awareness.clientID) continue;
    const record = (state ?? null) as Record<string, unknown> | null;
    const user = sanitizeCollabUser(record?.[AWARENESS_USER_FIELD]);
    if (!user || user.id === selfId) continue;
    const keys = cleanKeys(record?.[AWARENESS_SELECTION_FIELD]);
    const known = byUser.get(user.id);
    if (known) {
      for (const key of keys) if (!known.keys.includes(key)) known.keys.push(key);
    } else {
      byUser.set(user.id, { userId: user.id, name: user.name, color: user.color, keys });
    }
  }
  return Array.from(byUser.values());
}

/** 某个实体 key 被哪些人选中着。 */
export function peersSelecting(peers: readonly PeerSelection[], key: string): PeerSelection[] {
  return peers.filter((peer) => peer.keys.includes(key));
}

/** 颜色只认我们自己算出的 hsl 形式，别的一律不画（防止样式注入）。 */
export function safeSelectionColor(color: string): string {
  return /^hsl\(\d{1,3}, \d{1,3}%, \d{1,3}%\)$/.test(color) ? color : "#6366f1";
}

function samePeers(a: readonly PeerSelection[], b: readonly PeerSelection[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useCollabSelections(room: CollabRoom | null, localKeys: readonly string[]): PeerSelection[] {
  const [peers, setPeers] = useState<PeerSelection[]>([]);
  const selfId = room?.self.id ?? "";
  const awareness = room?.awareness ?? null;
  const keyList = useMemo(() => cleanKeys(localKeys), [localKeys]);
  const keyText = JSON.stringify(keyList);
  const last = useRef("");

  useEffect(() => {
    if (!awareness) {
      setPeers((current) => (current.length ? [] : current));
      return undefined;
    }
    const refresh = () => {
      const next = readPeerSelections(awareness, selfId);
      setPeers((current) => (samePeers(current, next) ? current : next));
    };
    awareness.on("change", refresh);
    refresh();
    return () => {
      awareness.off("change", refresh);
      try {
        awareness.setLocalStateField(AWARENESS_SELECTION_FIELD, []);
      } catch {
        /* 房间已销毁 */
      }
      last.current = "";
    };
  }, [awareness, selfId]);

  useEffect(() => {
    if (!awareness || keyText === last.current) return;
    last.current = keyText;
    try {
      awareness.setLocalStateField(AWARENESS_SELECTION_FIELD, JSON.parse(keyText) as string[]);
    } catch {
      /* 房间已销毁 */
    }
  }, [awareness, keyText]);

  return peers;
}
