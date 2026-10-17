import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  addClipToTrack,
  addTrackTo,
  createEmptyDoc,
  cutTimelineRange,
  docDurationMs,
  normalizeTimelineDoc,
} from "../../src/shell/video-editor/timeline-model.ts";
import type { TimelineDoc } from "../../src/shell/video-editor/types.ts";

const PROTOCOL = "oceanleo.editor-session.v1";
const SESSION = "sess-timeline-r2";

function post(type: string, extra: Record<string, unknown> = {}) {
  const message = { protocol: PROTOCOL, sessionId: SESSION, type, ...extra };
  window.parent?.postMessage(message, location.origin);
  (window as Window & { __oceanleoOutbound?: unknown[] }).__oceanleoOutbound?.push(message);
}

function seed(): TimelineDoc {
  let doc = createEmptyDoc();
  const video = doc.tracks.find((track) => track.kind === "video")!;
  const audio = doc.tracks.find((track) => track.kind === "audio")!;
  const text = doc.tracks.find((track) => track.kind === "text")!;
  doc = addClipToTrack(doc, video.id, {
    id: "clip_a",
    start_ms: 0,
    duration_ms: 4000,
    source_url: "/local/a.mp4",
  });
  doc = addClipToTrack(doc, video.id, {
    id: "clip_b",
    start_ms: 4000,
    duration_ms: 3000,
    source_url: "/local/b.mp4",
  });
  doc = addClipToTrack(doc, audio.id, {
    id: "audio_a",
    start_ms: 0,
    duration_ms: 7000,
    source_url: "/local/a.wav",
    volume: 0.8,
  });
  doc = addClipToTrack(doc, text.id, {
    id: "caption_a",
    start_ms: 500,
    duration_ms: 2000,
    text: "本地字幕",
    style: { font_size: 42, align: "center" },
  });
  return normalizeTimelineDoc(doc);
}

function readStored() {
  try {
    const raw = sessionStorage.getItem("w10-r2-timeline");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function TimelineR2() {
  const initial = useMemo(() => readStored() || seed(), []);
  const [history, setHistory] = useState([initial]);
  const [index, setIndex] = useState(0);
  const doc = history[index];

  function commit(next: TimelineDoc) {
    const stored = normalizeTimelineDoc(next);
    setHistory([...history.slice(0, index + 1), stored]);
    setIndex(index + 1);
    post("changed", { payload: stored, durationMs: docDurationMs(stored) });
  }

  return (
    <div data-testid="video-timeline-legacy-stage">
      <div className="bar">
        <button
          type="button"
          data-testid="timeline-cut"
          onClick={() => commit(cutTimelineRange(doc, 1000, 2500))}
        >
          剪切
        </button>
        <button
          type="button"
          data-testid="timeline-concat"
          onClick={() => {
            const video = doc.tracks.find((track) => track.kind === "video")!;
            commit(
              addClipToTrack(doc, video.id, {
                id: `clip_${history.length}`,
                start_ms: docDurationMs(doc),
                duration_ms: 2000,
                source_url: "/local/c.mp4",
              }),
            );
          }}
        >
          拼接
        </button>
        <button
          type="button"
          data-testid="timeline-caption"
          onClick={() => {
            const text = doc.tracks.find((track) => track.kind === "text")!;
            commit(
              addClipToTrack(doc, text.id, {
                id: `caption_${history.length}`,
                start_ms: 3000,
                duration_ms: 1500,
                text: "第二句字幕",
                style: { font_size: 36, align: "center" },
              }),
            );
          }}
        >
          加字幕
        </button>
        <button
          type="button"
          data-testid="timeline-audio-track"
          onClick={() => commit(addTrackTo(doc, "audio"))}
        >
          加音轨
        </button>
        <button
          type="button"
          data-testid="timeline-undo"
          disabled={index <= 0}
          onClick={() => {
            const next = Math.max(0, index - 1);
            setIndex(next);
            post("changed", { payload: history[next] });
          }}
        >
          撤销
        </button>
        <button
          type="button"
          data-testid="timeline-redo"
          disabled={index >= history.length - 1}
          onClick={() => {
            const next = Math.min(history.length - 1, index + 1);
            setIndex(next);
            post("changed", { payload: history[next] });
          }}
        >
          重做
        </button>
        <button
          type="button"
          data-testid="r2-save"
          onClick={() => {
            sessionStorage.setItem("w10-r2-timeline", JSON.stringify(doc));
            post("save", { requestId: "save-1", document: JSON.stringify(doc) });
          }}
        >
          保存
        </button>
        <button
          type="button"
          data-testid="r2-export"
          onClick={() => post("exported", { document: JSON.stringify(doc, null, 2) })}
        >
          导出
        </button>
        <span data-testid="timeline-duration">{docDurationMs(doc)}ms</span>
      </div>
      <ol data-testid="timeline-tracks">
        {doc.tracks.map((track) => (
          <li key={track.id}>
            {track.kind} · {track.clips.length} clips
            {track.clips.map((clip) => (
              <span key={clip.id}>
                {" "}
                [{clip.id}:{clip.text || clip.source_url || ""}]
              </span>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}

(window as Window & { __oceanleoOutbound?: unknown[] }).__oceanleoOutbound = [];
createRoot(document.getElementById("root")!).render(<TimelineR2 />);
(window as Window & { __oceanleoReady?: boolean }).__oceanleoReady = true;
post("ready");
