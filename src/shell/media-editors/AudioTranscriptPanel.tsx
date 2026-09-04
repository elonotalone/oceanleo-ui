"use client";

import type { AudioTranscriptSentence } from "./audio-transcript";

export function AudioTranscriptPanel({
  sentences,
  estimated,
  busy,
  error,
  onTranscribe,
  onCutSentence,
}: {
  sentences: AudioTranscriptSentence[];
  estimated: boolean;
  busy: boolean;
  error: string;
  onTranscribe: () => void;
  onCutSentence: (sentence: AudioTranscriptSentence) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-xs" data-testid="audio-transcript-panel">
      <button
        type="button"
        className="rounded-md border px-3 py-1"
        disabled={busy}
        onClick={onTranscribe}
      >
        {busy ? "正在转写…" : "转写当前音频"}
      </button>
      {estimated ? (
        <p className="opacity-70">这份稿的时间是按字数估算的，删句前请听一下。</p>
      ) : null}
      {error ? <p className="text-red-600">{error}</p> : null}
      <ul className="min-h-0 flex-1 overflow-auto">
        {sentences.map((sentence) => (
          <li
            key={sentence.id}
            className="mb-2 rounded border px-2 py-1"
            data-sentence-id={sentence.id}
          >
            <p>{sentence.text}</p>
            <p className="tabular-nums opacity-70">
              {sentence.startSeconds.toFixed(2)}s – {sentence.endSeconds.toFixed(2)}s
            </p>
            <button
              type="button"
              className="mt-1 rounded border px-2 py-0.5"
              disabled={busy}
              onClick={() => onCutSentence(sentence)}
            >
              删这句
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
