/**
 * 百炼 Paraformer/SenseVoice 转写稿 → 「按文字剪」的时间段。
 *
 * 真转写走既有网关 `POST /v1/audio/asr`（key 在服务端 resolve_key 现取现用）。
 * 本模块不读、不写、不缓存任何 API key。
 */
import { keepWindowsAfterCut } from "./audio-playlist-engine";

export interface AudioTranscriptSentence {
  id: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface AudioTranscriptGateway {
  postJson: (path: string, body: unknown) => Promise<unknown>;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

/** DashScope `begin_time`/`end_time` 是毫秒；`startSeconds` 已经是秒。 */
export function asrTimeToSeconds(
  value: unknown,
  unit: "ms" | "s" = "ms",
): number {
  const numeric = asNumber(value);
  if (!Number.isFinite(numeric) || numeric < 0) return NaN;
  return unit === "s" ? numeric : numeric / 1000;
}

function splitPlainText(text: string): string[] {
  return text
    .split(/(?<=[。！？!?；;\n])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * 把网关 ASR 状态打成带时间的句子。
 * 优先用 results[].sentences[] 的 begin_time/end_time；
 * 没有时间戳时按字数在 durationSeconds 上比例切，并标明是估算。
 */
export function sentencesFromAsrStatus(
  payload: unknown,
  durationSeconds: number,
): { sentences: AudioTranscriptSentence[]; estimated: boolean; text: string } {
  const root = recordOf(payload) || {};
  const results = Array.isArray(root.results) ? root.results : [];
  const structured: AudioTranscriptSentence[] = [];
  const texts: string[] = [];
  for (const raw of results) {
    const row = recordOf(raw);
    if (!row) continue;
    const blob = String(row.text || "").trim();
    if (blob) texts.push(blob);
    const items = Array.isArray(row.sentences) ? row.sentences : [];
    for (const item of items) {
      const sentence = recordOf(item);
      if (!sentence) continue;
      const text = String(sentence.text || sentence.sentence || "").trim();
      const start = Object.prototype.hasOwnProperty.call(sentence, "startSeconds")
        ? asrTimeToSeconds(sentence.startSeconds, "s")
        : asrTimeToSeconds(
            sentence.begin_time ?? sentence.start,
            "ms",
          );
      const end = Object.prototype.hasOwnProperty.call(sentence, "endSeconds")
        ? asrTimeToSeconds(sentence.endSeconds, "s")
        : asrTimeToSeconds(
            sentence.end_time ?? sentence.end,
            "ms",
          );
      if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        continue;
      }
      structured.push({
        id: `s-${structured.length}`,
        text,
        startSeconds: start,
        endSeconds: end,
      });
    }
  }
  const fullText = texts.join("\n").trim();
  if (structured.length > 0) {
    return { sentences: structured, estimated: false, text: fullText };
  }
  const parts = splitPlainText(fullText);
  if (parts.length === 0 || !(durationSeconds > 0)) {
    return { sentences: [], estimated: false, text: fullText };
  }
  const totalChars = parts.reduce((sum, part) => sum + part.length, 0) || 1;
  let cursor = 0;
  const estimated = parts.map((text, index) => {
    const span = (text.length / totalChars) * durationSeconds;
    const startSeconds = cursor;
    const endSeconds =
      index === parts.length - 1 ? durationSeconds : cursor + span;
    cursor = endSeconds;
    return {
      id: `s-${index}`,
      text,
      startSeconds,
      endSeconds,
    };
  });
  return { sentences: estimated, estimated: true, text: fullText };
}

export function cutPlanForSentence(
  sentence: AudioTranscriptSentence,
  durationSeconds: number,
): { start: number; end: number; keep: { start: number; end: number }[] } | null {
  if (!sentence || sentence.endSeconds <= sentence.startSeconds) return null;
  const start = Math.max(0, sentence.startSeconds);
  const end = Math.min(durationSeconds, sentence.endSeconds);
  if (end <= start) return null;
  return {
    start,
    end,
    keep: keepWindowsAfterCut(durationSeconds, start, end),
  };
}

export async function submitBailianAsr(
  gateway: AudioTranscriptGateway,
  input: { siteId: string; fileUrls: string[] },
): Promise<{ taskId: string }> {
  const urls = (input.fileUrls || []).filter((url) => url.trim());
  if (urls.length === 0) throw new Error("转写需要一份已保存的音频地址。");
  const data = recordOf(
    await gateway.postJson("/v1/audio/asr", {
      site_id: input.siteId || "",
      file_urls: urls.slice(0, 5),
      key_mode: "platform",
    }),
  );
  const taskId = String(data?.task_id || "").trim();
  if (!taskId) throw new Error("百炼转写没有返回任务号。");
  return { taskId };
}

export async function pollBailianAsr(
  gateway: AudioTranscriptGateway,
  taskId: string,
): Promise<unknown> {
  if (!taskId.trim()) throw new Error("没有转写任务号。");
  return gateway.postJson(
    `/v1/audio/asr/status/${encodeURIComponent(taskId)}`,
    { key_mode: "platform" },
  );
}
