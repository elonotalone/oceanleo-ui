/**
 * `<textarea>` ↔ `Y.Text`：两人在同一段里打字互不覆盖（逐字合并），本地光标留在原来的位置。
 *
 * - 绑定时：文本里已有内容 → 画进 textarea；没有内容且房间要求种子（`needsSeed`）→ 把 textarea 里的
 *   现有内容写进文档并发 `seed.done`；两者都不是 → 不动 textarea（等别人的内容同步过来）。
 * - 本地输入：用公共前缀/后缀算出一段删除 + 一段插入，一次事务写进 `Y.Text`。
 * - 远端更新：按事件的 delta 平移本地光标/选区，再回填 textarea；输入法组字期间先攒着，组字结束再回填。
 * - 只读（viewer 或锁在别人手里）：textarea 变只读；强行输入的内容会被还原。
 */
import type { Text as YText, YTextEvent } from "yjs";
import type { CollabRoom } from "./index";
import { isCollabReadOnly } from "./provider";

const LOCAL_TEXT_ORIGIN = Symbol("oceanleo-collab-textarea-local");

type DeltaOp = { retain?: number; insert?: unknown; delete?: number };

/** 把旧文本里的下标按 delta 平移到新文本里。插入点恰好在下标上时，下标留在插入内容之前。 */
export function transformIndex(index: number, delta: readonly DeltaOp[]): number {
  let result = index;
  let oldPos = 0;
  for (const op of delta) {
    if (typeof op.retain === "number") {
      oldPos += op.retain;
    } else if (typeof op.insert === "string") {
      if (oldPos < index) result += op.insert.length;
    } else if (typeof op.delete === "number") {
      if (oldPos < index) result -= Math.min(op.delete, index - oldPos);
      oldPos += op.delete;
    }
  }
  return Math.max(0, result);
}

interface TextDiff { start: number; end: number; insert: string }

/** 公共前缀/后缀算出一段「删 [start,end) + 插 insert」；不动代理对（emoji）的中间。 */
function computeDiff(from: string, to: string): TextDiff | null {
  if (from === to) return null;
  let start = 0;
  const minLen = Math.min(from.length, to.length);
  while (start < minLen && from.charCodeAt(start) === to.charCodeAt(start)) start += 1;
  let endFrom = from.length;
  let endTo = to.length;
  while (endFrom > start && endTo > start && from.charCodeAt(endFrom - 1) === to.charCodeAt(endTo - 1)) {
    endFrom -= 1;
    endTo -= 1;
  }
  const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
  const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
  if (start > 0 && isHigh(from.charCodeAt(start - 1)) && (isLow(from.charCodeAt(start)) || isLow(to.charCodeAt(start)))) {
    start -= 1;
  }
  if (endFrom < from.length && isLow(from.charCodeAt(endFrom)) && isHigh(from.charCodeAt(endFrom - 1))) {
    endFrom += 1;
    endTo += 1;
  }
  return { start, end: endFrom, insert: to.slice(start, endTo) };
}

export function bindTextarea(room: CollabRoom, textName: string, el: HTMLTextAreaElement): { destroy(): void } {
  const ytext = room.doc.getText(textName);
  const baseReadOnly = el.readOnly;
  let composing = false;
  let destroyed = false;
  /** textarea 最近一次与文档对齐时的文本；组字期间的本地改动相对它计算。 */
  let shadow = "";
  /** 组字期间收到的远端 delta（按到达顺序），用来把本地改动的位置平移到新文档里。 */
  let queued: DeltaOp[][] = [];

  const syncReadOnly = () => {
    el.readOnly = baseReadOnly || isCollabReadOnly(room);
  };

  const refreshFromDoc = (deltas: readonly (readonly DeltaOp[])[] = []) => {
    const text = ytext.toString();
    shadow = text;
    if (el.value === text) return;
    const hadFocus = typeof document !== "undefined" && document.activeElement === el;
    let selStart = el.selectionStart ?? 0;
    let selEnd = el.selectionEnd ?? selStart;
    for (const delta of deltas) {
      selStart = transformIndex(selStart, delta);
      selEnd = transformIndex(selEnd, delta);
    }
    el.value = text;
    const max = text.length;
    if (hadFocus || deltas.length) el.setSelectionRange(Math.min(selStart, max), Math.min(selEnd, max));
  };

  /** 把 textarea 相对 shadow 的改动写进文档（位置按攒着的远端 delta 平移）。 */
  const flushLocal = () => {
    const diff = computeDiff(shadow, el.value);
    if (!diff) return;
    let { start, end } = diff;
    for (const delta of queued) {
      start = transformIndex(start, delta);
      end = Math.max(start, transformIndex(end, delta));
    }
    const length = ytext.length;
    start = Math.min(start, length);
    end = Math.min(end, length);
    room.doc.transact(() => {
      if (end > start) ytext.delete(start, end - start);
      if (diff.insert) ytext.insert(start, diff.insert);
    }, LOCAL_TEXT_ORIGIN);
    shadow = el.value;
  };

  // 初始内容
  if (ytext.length > 0) {
    refreshFromDoc();
  } else if (room.needsSeed && el.value) {
    room.doc.transact(() => ytext.insert(0, el.value), LOCAL_TEXT_ORIGIN);
    shadow = ytext.toString();
    room.completeSeed([textName]);
  } else if (room.needsSeed) {
    room.completeSeed([textName]);
  }
  shadow = ytext.toString();
  syncReadOnly();

  const onInput = () => {
    if (destroyed) return;
    if (isCollabReadOnly(room)) {
      const current = ytext.toString();
      if (el.value !== current) el.value = current;
      shadow = current;
      queued = [];
      return;
    }
    if (composing) return; // 组字中的中间态不写；compositionend 一次写
    flushLocal();
  };
  const onCompositionStart = () => {
    composing = true;
  };
  const onCompositionEnd = () => {
    composing = false;
    if (destroyed) return;
    if (isCollabReadOnly(room)) {
      onInput();
      return;
    }
    flushLocal();
    const deltas = queued;
    queued = [];
    refreshFromDoc(deltas);
  };
  const observer = (event: YTextEvent) => {
    if (destroyed || event.transaction.origin === LOCAL_TEXT_ORIGIN) return;
    const delta = event.delta as DeltaOp[];
    if (composing) {
      queued.push(delta);
      return;
    }
    refreshFromDoc([delta]);
  };

  el.addEventListener("input", onInput);
  el.addEventListener("compositionstart", onCompositionStart);
  el.addEventListener("compositionend", onCompositionEnd);
  ytext.observe(observer);
  const unsubscribe = room.subscribe(syncReadOnly);

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      el.removeEventListener("input", onInput);
      el.removeEventListener("compositionstart", onCompositionStart);
      el.removeEventListener("compositionend", onCompositionEnd);
      ytext.unobserve(observer);
      unsubscribe();
      el.readOnly = baseReadOnly;
    },
  };
}
