// 通话格子的排序与可见位（纯函数；时间一律由参数注入，便于单测）。合同 §3.1、§1 A4。
//
// 规则：
//   - `order`：入场顺序稳定，自己固定第一；说话只亮不挪（说话不改变 order，也不改变格子位置）。
//   - `visible`：可见格（槽位数组，位置稳定）。人数不超过格数时全部可见。
//     放不下时：被收起的人**连续说话 ≥2.5 s** 才换入，换掉「最久没说话」的可见者（就地替换，不挪别人）；
//     两次换位至少隔 **5 s**；**3 s 内说过话**的人不会被换出；自己永远不被换出。
//   - 有人离开空出的格子：就地由入场最早的被收起者补上；没人可补就收掉这一格。
//   - `overflowCount` = 在场人数 − 可见格数（界面显示「+N」）。

export const SWAP_IN_SPEAKING_MS = 2_500;
export const SWAP_MIN_INTERVAL_MS = 5_000;
export const SWAP_PROTECT_RECENT_MS = 3_000;

export interface OrderingParticipant {
  id: string;
  isMe: boolean;
  /** 入场时间（毫秒）。没说过话的人从这一刻起算「没说话」。 */
  joinedAt: number;
}

export interface SpeakingInfo {
  /** 这一段连续说话从何时开始；没在说话为 null。 */
  speakingSince: number | null;
  /** 最近一次处于说话状态的时间；从没说过为 null。 */
  lastSpokeAt: number | null;
}

export interface OrderingInput {
  /** 在场的人，按入场先后给出（引擎保证稳定）。 */
  participants: ReadonlyArray<OrderingParticipant>;
  speaking: Readonly<Record<string, SpeakingInfo | undefined>>;
  /** 可见格数（小窗 4，宫格每页 9 / 手机 4）。 */
  capacity: number;
  now: number;
}

export interface OrderingState {
  order: string[];
  visible: string[];
  lastSwapAt: number | null;
}

export interface OrderingResult extends OrderingState {
  overflowCount: number;
}

export const EMPTY_ORDERING: OrderingResult = { order: [], visible: [], lastSwapAt: null, overflowCount: 0 };

const SILENT: SpeakingInfo = { speakingSince: null, lastSpokeAt: null };

/** 入场顺序：保留上一次的相对顺序，新来的人接在后面，自己放第一。 */
export function computeOrder(previous: readonly string[], participants: ReadonlyArray<OrderingParticipant>): string[] {
  const present = new Set(participants.map((p) => p.id));
  const me = participants.find((p) => p.isMe)?.id ?? null;
  const next: string[] = [];
  const seen = new Set<string>();
  for (const id of previous) {
    if (id === me || !present.has(id) || seen.has(id)) continue;
    next.push(id);
    seen.add(id);
  }
  for (const p of participants) {
    if (p.isMe || seen.has(p.id)) continue;
    next.push(p.id);
    seen.add(p.id);
  }
  return me ? [me, ...next] : next;
}

function silenceStart(id: string, input: OrderingInput, joinedAt: Map<string, number>): number {
  const info = input.speaking[id] ?? SILENT;
  return info.lastSpokeAt ?? joinedAt.get(id) ?? Number.NEGATIVE_INFINITY;
}

/** 可被换出的可见者里「最久没说话」的那一格；没有返回 -1。`protect=false` 用于格数缩小时的强制收格。 */
function pickVictimIndex(
  slots: readonly string[],
  me: string | null,
  input: OrderingInput,
  order: readonly string[],
  joinedAt: Map<string, number>,
  protect: boolean,
): number {
  let best = -1;
  let bestSilence = Number.POSITIVE_INFINITY;
  let bestRank = -1;
  slots.forEach((id, index) => {
    if (id === me) return;
    const info = input.speaking[id] ?? SILENT;
    if (protect) {
      if (info.speakingSince !== null) return;
      if (info.lastSpokeAt !== null && input.now - info.lastSpokeAt < SWAP_PROTECT_RECENT_MS) return;
    }
    const silence = silenceStart(id, input, joinedAt);
    const rank = order.indexOf(id);
    // 最早开始沉默的先换出；同时开始沉默的，先换出入场更早的（他「没说话」更久）。
    if (silence < bestSilence || (silence === bestSilence && rank < bestRank)) {
      best = index;
      bestSilence = silence;
      bestRank = rank;
    }
  });
  return best;
}

export function updateOrdering(previous: OrderingState, input: OrderingInput): OrderingResult {
  const capacity = Math.max(1, Math.floor(Number.isFinite(input.capacity) ? input.capacity : 1));
  const order = computeOrder(previous.order, input.participants);
  const present = new Set(order);
  const me = input.participants.find((p) => p.isMe)?.id ?? null;
  const joinedAt = new Map(input.participants.map((p) => [p.id, p.joinedAt] as const));

  // 1) 上一次的槽位：离开的人留空位，自己固定在第 0 格。
  const slots: Array<string | null> = previous.visible.map((id) => (present.has(id) ? id : null));
  if (me) {
    const at = slots.indexOf(me);
    if (at !== 0) {
      if (at > 0) slots.splice(at, 1);
      slots.unshift(me);
    }
  }
  // 2) 空位就地由入场最早的被收起者补上；补不上就收掉。
  const shown = new Set(slots.filter((id): id is string => id !== null));
  const hidden = order.filter((id) => !shown.has(id));
  for (let i = 0; i < slots.length && hidden.length > 0; i += 1) {
    if (slots[i] === null) slots[i] = hidden.shift() ?? null;
  }
  const visible = slots.filter((id): id is string => id !== null);
  // 3) 还有空格就按入场顺序往后放。
  while (visible.length < capacity && hidden.length > 0) visible.push(hidden.shift() as string);
  // 4) 格数缩小：强制收掉最久没说话的（不收自己）。
  while (visible.length > capacity) {
    const index = pickVictimIndex(visible, me, input, order, joinedAt, false);
    if (index < 0) break;
    visible.splice(index, 1);
  }

  // 5) 换位：被收起者连续说话 ≥2.5 s；距上次换位 ≥5 s；被换出者 3 s 内没说过话。
  let lastSwapAt = previous.lastSwapAt;
  const visibleSet = new Set(visible);
  const waiting = order.filter((id) => !visibleSet.has(id));
  if (waiting.length > 0 && (lastSwapAt === null || input.now - lastSwapAt >= SWAP_MIN_INTERVAL_MS)) {
    const candidates = waiting
      .filter((id) => {
        const since = (input.speaking[id] ?? SILENT).speakingSince;
        return since !== null && input.now - since >= SWAP_IN_SPEAKING_MS;
      })
      .sort((a, b) => {
        const sa = (input.speaking[a] ?? SILENT).speakingSince as number;
        const sb = (input.speaking[b] ?? SILENT).speakingSince as number;
        return sa - sb || order.indexOf(a) - order.indexOf(b);
      });
    if (candidates.length > 0) {
      const index = pickVictimIndex(visible, me, input, order, joinedAt, true);
      if (index >= 0) {
        visible[index] = candidates[0];
        lastSwapAt = input.now;
      }
    }
  }

  return { order, visible, lastSwapAt, overflowCount: Math.max(0, order.length - visible.length) };
}

/** 放大视图分页：按 `order` 切页（每页 9 格，手机 4 格）。页码越界时夹到最后一页。 */
export function pageOf(order: readonly string[], page: number, pageSize: number): { ids: string[]; page: number; pages: number } {
  const size = Math.max(1, Math.floor(pageSize));
  const pages = Math.max(1, Math.ceil(order.length / size));
  const current = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  return { ids: order.slice(current * size, current * size + size), page: current, pages };
}
