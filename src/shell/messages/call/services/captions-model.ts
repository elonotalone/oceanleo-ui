// 字幕聚合（纯函数）：`call_caption` 事件（合同 §3.3）→ 按说话人聚合的几行字幕。
// 规则：
//  - 同一句（participant_id + sentence_id）的中间结果原地替换；`is_final` 定稿；定稿后迟到的中间结果丢弃。
//  - 空文本的定稿 = 识别撤回，删掉这一句。
//  - 同一说话人开始新的一句时，他上一句若还没定稿就按定稿处理（不会卡着一条永远的中间结果）。
//  - 只认当前通话（call_id 对不上的丢弃），只保留最近几句；静默一段时间后自动淡出。
//  - 显示时同一说话人连续的几句合成一行，行尾保留最新的字（太长从前面截断）。

export interface CaptionEventInput {
  call_id: string;
  participant_id: string;
  user_id: string;
  sentence_id: string | number;
  text: string;
  is_final: boolean;
}

export interface CaptionEntry {
  key: string;
  participantId: string;
  userId: string;
  sentenceId: string;
  text: string;
  isFinal: boolean;
  seq: number;
  updatedAt: number;
}

export interface CaptionsModel {
  callId: string | null;
  entries: CaptionEntry[];
  seq: number;
}

/** 合并后的一行（说话人名由界面按 participantId 查）。 */
export interface CaptionLineModel {
  participantId: string;
  userId: string;
  sentenceId: string;
  text: string;
  isFinal: boolean;
  updatedAt: number;
}

/** 最多保留几句（跨说话人）。 */
export const CAPTION_MAX_ENTRIES = 8;
/** 定稿的句子多久不更新就淡出。 */
export const CAPTION_FINAL_TTL_MS = 8_000;
/** 一直没定稿的中间结果多久不更新就丢掉。 */
export const CAPTION_INTERIM_TTL_MS = 15_000;
/** 单句上限（防异常长的识别结果撑爆内存；保留尾部）。 */
export const CAPTION_TEXT_MAX = 600;

export function emptyCaptions(callId: string | null = null): CaptionsModel {
  return { callId, entries: [], seq: 0 };
}

/** 换了通话就清空；同一通话原样返回。 */
export function captionsForCall(model: CaptionsModel, callId: string | null): CaptionsModel {
  return model.callId === callId ? model : emptyCaptions(callId);
}

function cleanText(raw: unknown): string {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= CAPTION_TEXT_MAX) return text;
  return Array.from(text).slice(-CAPTION_TEXT_MAX).join("");
}

function entryKey(participantId: string, sentenceId: string): string {
  return `${participantId}\u0000${sentenceId}`;
}

export function applyCaptionEvent(model: CaptionsModel, event: CaptionEventInput, now: number): CaptionsModel {
  if (!model.callId || !event || event.call_id !== model.callId) return model;
  const participantId = String(event.participant_id ?? "").trim();
  if (!participantId) return model;
  const sentenceId = String(event.sentence_id ?? "");
  const key = entryKey(participantId, sentenceId);
  const text = cleanText(event.text);
  const isFinal = event.is_final === true;
  const index = model.entries.findIndex((entry) => entry.key === key);

  if (index >= 0) {
    const existing = model.entries[index];
    if (existing.isFinal && !isFinal) return model; // 定稿后迟到的中间结果
    if (!text) return { ...model, entries: model.entries.filter((_, i) => i !== index) };
    if (existing.text === text && existing.isFinal === isFinal) return model;
    const entries = model.entries.slice();
    entries[index] = { ...existing, text, isFinal, updatedAt: now };
    return { ...model, entries };
  }

  if (!text) return model;
  const seq = model.seq + 1;
  const entries = model.entries.map((entry) =>
    entry.participantId === participantId && !entry.isFinal ? { ...entry, isFinal: true } : entry,
  );
  entries.push({
    key,
    participantId,
    userId: String(event.user_id ?? ""),
    sentenceId,
    text,
    isFinal,
    seq,
    updatedAt: now,
  });
  return { ...model, seq, entries: entries.slice(-CAPTION_MAX_ENTRIES) };
}

function expiresAt(entry: CaptionEntry): number {
  return entry.updatedAt + (entry.isFinal ? CAPTION_FINAL_TTL_MS : CAPTION_INTERIM_TTL_MS);
}

function isLive(entry: CaptionEntry, now: number): boolean {
  return expiresAt(entry) > now;
}

/** 删掉已淡出的句子；没有变化时原样返回（引用不变，订阅者不重绘）。 */
export function pruneCaptions(model: CaptionsModel, now: number): CaptionsModel {
  const entries = model.entries.filter((entry) => isLive(entry, now));
  return entries.length === model.entries.length ? model : { ...model, entries };
}

/** 下一句什么时候淡出（宿主据此定一个清理计时器）；没有句子 = null。 */
export function nextCaptionExpiry(model: CaptionsModel): number | null {
  let next: number | null = null;
  for (const entry of model.entries) {
    const at = expiresAt(entry);
    if (next === null || at < next) next = at;
  }
  return next;
}

// 中日文（汉字、假名、全角标点）之间不加空格；其余语言（含韩文）句与句之间加一个空格。
const NO_SPACE_CHAR = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;

export function joinCaptionText(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const last = a[a.length - 1];
  const first = b[0];
  return NO_SPACE_CHAR.test(last) || NO_SPACE_CHAR.test(first) ? `${a}${b}` : `${a} ${b}`;
}

/** 太长时保留结尾（最新的字），前面加「…」。按字符（不是 UTF-16 码元）截，不切坏表情。 */
export function tailText(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `…${chars.slice(chars.length - maxChars + 1).join("")}`;
}

/**
 * 当前要显示的几行：未淡出的句子按出现顺序，同一说话人连续的合成一行，取最后 `maxLines` 行。
 * 小窗 1 行、放大视图 2 行。
 */
export function captionLines(model: CaptionsModel, now: number, maxLines: number, maxChars: number): CaptionLineModel[] {
  if (maxLines <= 0) return [];
  const lines: CaptionLineModel[] = [];
  for (const entry of model.entries) {
    if (!isLive(entry, now)) continue;
    const last = lines[lines.length - 1];
    if (last && last.participantId === entry.participantId) {
      last.text = joinCaptionText(last.text, entry.text);
      last.sentenceId = entry.sentenceId;
      last.isFinal = entry.isFinal;
      last.updatedAt = Math.max(last.updatedAt, entry.updatedAt);
      continue;
    }
    lines.push({
      participantId: entry.participantId,
      userId: entry.userId,
      sentenceId: entry.sentenceId,
      text: entry.text,
      isFinal: entry.isFinal,
      updatedAt: entry.updatedAt,
    });
  }
  return lines.slice(-maxLines).map((line) => ({ ...line, text: tailText(line.text, maxChars) }));
}
