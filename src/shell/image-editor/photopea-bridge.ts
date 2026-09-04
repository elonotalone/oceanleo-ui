/**
 * Photopea free-tier bridge — the L3 professional mode for the merged image /
 * design editor (operator ruling R4; five-layer spec §4).
 *
 * Photopea is an external SaaS in an iframe, not a library, so the whole
 * exchange is `postMessage` in both directions and this module owns the
 * protocol: launch configuration, origin filtering, the scripts we send, and
 * the state machine. Kept free of React and of the DOM so the protocol can be
 * tested as data — §2 rules out browser-driven acceptance evidence.
 *
 * Round trip: current canvas → PSD bytes → Photopea → edited PSD bytes back.
 */

export const PHOTOPEA_ORIGIN = "https://www.photopea.com";

/**
 * The free tier is ad-supported, and the task book requires it to load only
 * when the user opens it. Nothing here may run at mount time; flipping this to
 * `true` would trade a visible first-open wait for preloading someone else's
 * ads, so it stays off by default (see `signals/W04-question.md` Q2).
 */
export const PHOTOPEA_PRELOAD = false;

/** Photopea reports completion of every script with this exact payload. */
export const PHOTOPEA_DONE = "done";

/**
 * Hands the active document back as PSD bytes on the message channel.
 * `saveToOE` is Photopea's "save to outer environment" entry point.
 */
export const PHOTOPEA_EXPORT_SCRIPT = 'app.activeDocument.saveToOE("psd");';

export interface PhotopeaLaunchOptions {
  /** PSD bytes of the current document, as a data URL. */
  documentDataUrl?: string;
  /** Matches Photopea's chrome to the host theme; "dark" | "light". */
  theme?: "dark" | "light";
}

export interface PhotopeaConfig {
  files: string[];
  environment: { theme: number; localsave: boolean; autosave: boolean };
}

/**
 * Photopea takes its configuration as JSON in the URL fragment. `theme` is
 * numeric in its API: 1 is dark, 2 is light.
 */
export function buildPhotopeaConfig(
  options: PhotopeaLaunchOptions = {},
): PhotopeaConfig {
  return {
    files: options.documentDataUrl ? [options.documentDataUrl] : [],
    environment: {
      theme: options.theme === "light" ? 2 : 1,
      localsave: false,
      autosave: false,
    },
  };
}

export function photopeaLaunchUrl(options: PhotopeaLaunchOptions = {}): string {
  const config = buildPhotopeaConfig(options);
  return `${PHOTOPEA_ORIGIN}#${encodeURIComponent(JSON.stringify(config))}`;
}

export type PhotopeaMessage =
  /** Not from Photopea's origin; must be ignored rather than parsed. */
  | { kind: "foreign" }
  /** PSD bytes coming back from the editor. */
  | { kind: "document"; bytes: ArrayBuffer }
  /** A script we sent finished; also fires once when the editor is ready. */
  | { kind: "script-done" }
  | { kind: "log"; text: string };

export function classifyPhotopeaMessage(event: {
  origin?: string;
  data?: unknown;
}): PhotopeaMessage {
  if (event.origin !== PHOTOPEA_ORIGIN) return { kind: "foreign" };
  const { data } = event;
  if (data instanceof ArrayBuffer) return { kind: "document", bytes: data };
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return {
      kind: "document",
      bytes: view.buffer.slice(
        view.byteOffset,
        view.byteOffset + view.byteLength,
      ) as ArrayBuffer,
    };
  }
  if (data === PHOTOPEA_DONE) return { kind: "script-done" };
  if (typeof data === "string") return { kind: "log", text: data };
  return { kind: "log", text: "" };
}

/**
 * `closed` is the only state in which no iframe exists, which is what keeps the
 * ad-supported page from loading before the user asks for it.
 */
export type PhotopeaPhase =
  | "closed"
  | "launching"
  | "ready"
  | "exporting"
  | "returned";

export interface PhotopeaState {
  phase: PhotopeaPhase;
  /** Bytes handed back by the last export; cleared on close. */
  document: ArrayBuffer | null;
  log: string[];
}

export const PHOTOPEA_INITIAL_STATE: PhotopeaState = Object.freeze({
  phase: "closed",
  document: null,
  log: Object.freeze([]) as unknown as string[],
});

export type PhotopeaAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "request-export" }
  | { type: "message"; message: PhotopeaMessage };

const MAX_LOG_ENTRIES = 20;

export function photopeaReducer(
  state: PhotopeaState,
  action: PhotopeaAction,
): PhotopeaState {
  switch (action.type) {
    case "open":
      return state.phase === "closed"
        ? { phase: "launching", document: null, log: [] }
        : state;
    case "close":
      return PHOTOPEA_INITIAL_STATE;
    case "request-export":
      // Only meaningful once the editor has reported itself ready; sending the
      // script earlier is dropped by Photopea and would leave us waiting.
      return state.phase === "ready" || state.phase === "returned"
        ? { ...state, phase: "exporting" }
        : state;
    case "message": {
      if (state.phase === "closed") return state;
      const { message } = action;
      if (message.kind === "foreign") return state;
      if (message.kind === "document") {
        return { ...state, phase: "returned", document: message.bytes };
      }
      if (message.kind === "script-done") {
        if (state.phase === "launching") return { ...state, phase: "ready" };
        if (state.phase === "exporting") return state;
        return state;
      }
      if (message.text.length === 0) return state;
      return {
        ...state,
        log: [...state.log, message.text].slice(-MAX_LOG_ENTRIES),
      };
    }
    default:
      return state;
  }
}

/** True when an iframe should exist. Nothing loads while this is false. */
export function photopeaShouldMountFrame(state: PhotopeaState): boolean {
  return state.phase !== "closed";
}

export function photopeaBytesToDataUrl(
  bytes: ArrayBuffer,
  toBase64: (input: Uint8Array) => string,
): string {
  return `data:image/vnd.adobe.photoshop;base64,${toBase64(new Uint8Array(bytes))}`;
}

/**
 * UC-6：发给 Photopea 的 targetOrigin 必须是它自己的 origin，不许 `"*"`。
 * 第三参对不上就拒发，避免调用方随手写通配符。
 */
export function postToPhotopea(
  frame: { postMessage: (message: unknown, targetOrigin: string) => void } | null | undefined,
  data: unknown,
  targetOrigin: string,
): boolean {
  if (!frame) return false;
  if (targetOrigin !== PHOTOPEA_ORIGIN) return false;
  frame.postMessage(data, PHOTOPEA_ORIGIN);
  return true;
}

/** UC-6：收信要比 origin，还要比 source 是我们挂的那扇 iframe。 */
export function isPhotopeaFrameSource(
  event: { origin?: string; source?: unknown },
  frameWindow: unknown,
): boolean {
  return (
    event.origin === PHOTOPEA_ORIGIN &&
    frameWindow != null &&
    event.source === frameWindow
  );
}
