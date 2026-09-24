export const EDITOR_TIMING_DEBUG_KEY = "oleo.debug.editor-timing";

export type EditorOpenPhase =
  | "click"
  | "code"
  | "content"
  | "firstFrame"
  | "editable";

export interface EditorOpenDurations {
  clickToCode: number | null;
  codeToContent: number | null;
  contentToFirstFrame: number | null;
  firstFrameToEditable: number | null;
  clickToEditable: number | null;
}

export interface EditorOpenTiming {
  id: string;
  click: number;
  code: number | null;
  content: number | null;
  firstFrame: number | null;
  editable: number | null;
  durations: EditorOpenDurations;
}

const sessions = new Map<string, EditorOpenTiming>();
let latestId = "";

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function emptyDurations(): EditorOpenDurations {
  return {
    clickToCode: null,
    codeToContent: null,
    contentToFirstFrame: null,
    firstFrameToEditable: null,
    clickToEditable: null,
  };
}

function delta(from: number | null, to: number | null): number | null {
  if (from == null || to == null) return null;
  return to - from;
}

function recompute(session: EditorOpenTiming): void {
  session.durations = {
    clickToCode: delta(session.click, session.code),
    codeToContent: delta(session.code, session.content),
    contentToFirstFrame: delta(session.content, session.firstFrame),
    firstFrameToEditable: delta(session.firstFrame, session.editable),
    clickToEditable: delta(session.click, session.editable),
  };
}

function debugEnabled(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(EDITOR_TIMING_DEBUG_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function maybeTable(session: EditorOpenTiming): void {
  if (!debugEnabled() || typeof console === "undefined" || !console.table) return;
  console.table({
    id: session.id,
    click: session.click,
    code: session.code,
    content: session.content,
    firstFrame: session.firstFrame,
    editable: session.editable,
    clickToCode: session.durations.clickToCode,
    codeToContent: session.durations.codeToContent,
    contentToFirstFrame: session.durations.contentToFirstFrame,
    firstFrameToEditable: session.durations.firstFrameToEditable,
    clickToEditable: session.durations.clickToEditable,
  });
}

export function editorOpenSessionId(item: {
  artifactId?: string;
  id?: string;
  revisionId?: string;
  kind?: string;
  url?: string;
}): string {
  return [
    item.artifactId || item.id || "item",
    item.revisionId || "",
    item.kind || "",
    item.url || "",
  ].join(":");
}

export function markEditorOpen(id: string, phase: EditorOpenPhase): EditorOpenTiming {
  const at = nowMs();
  let session = sessions.get(id);
  if (!session || phase === "click") {
    session = {
      id,
      click: at,
      code: null,
      content: null,
      firstFrame: null,
      editable: null,
      durations: emptyDurations(),
    };
    sessions.set(id, session);
  }
  if (phase !== "click" && session[phase] == null) {
    session[phase] = at;
  }
  latestId = id;
  if (typeof performance !== "undefined" && typeof performance.mark === "function") {
    performance.mark(`oleo-editor-open:${id}:${phase}`);
  }
  recompute(session);
  maybeTable(session);
  return session;
}

export function readEditorOpenTiming(id?: string): EditorOpenTiming | null {
  if (id) return sessions.get(id) ?? null;
  if (!latestId) return null;
  return sessions.get(latestId) ?? null;
}

export function resetEditorOpenTimingForTests(): void {
  sessions.clear();
  latestId = "";
}
