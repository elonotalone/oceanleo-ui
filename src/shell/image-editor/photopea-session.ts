import type { LibraryItem } from "../library-data";
import { AdvancedPersistenceController } from "../advanced-persistence-controller";
import { handOff } from "../advanced-background-saver";
import {
  createPhotopeaSaveRoundtrip,
  persistPhotopeaDocument,
  PHOTOPEA_PNG_EXPORT_SCRIPT,
  toPhotopeaDocumentRef,
} from "../advanced-routes/image-pro-handoff";
import {
  PHOTOPEA_ORIGIN,
  classifyPhotopeaMessage,
  isPhotopeaFrameSource,
  photopeaLaunchUrl,
  postToPhotopea,
  type PhotopeaLaunchOptions,
} from "./photopea-bridge";
import { photopeaFrameSandbox } from "./photopea-mount";

export type PhotopeaSaveState = { phase: "unconfirmed" | "saving" | "error"; message: string };
export interface PhotopeaSession {
  attach: (anchor: HTMLElement, options: PhotopeaLaunchOptions) => () => void;
  save: () => Promise<LibraryItem>;
  leave: () => Promise<LibraryItem>;
  subscribe: (listener: () => void) => () => void;
  snapshot: () => PhotopeaSaveState;
}

const UNCONFIRMED: PhotopeaSaveState = {
  phase: "unconfirmed",
  message: "专业编辑中的最新修改尚未确认保存；返回编辑或关闭时会导出并保存。",
};
let nextSessionId = 0;
// The registry, not React, owns live frames and their message listeners.
const liveSessions = new Set<PhotopeaSession>();

export function createPhotopeaSession(input: {
  item: LibraryItem;
  siteId: string;
  onSaved?: (item: LibraryItem) => void;
  recordSavedItem?: (item: LibraryItem) => Promise<boolean> | boolean;
  saveDocument?: typeof persistPhotopeaDocument;
  exportTimeoutMs?: number;
}): PhotopeaSession {
  const id = ++nextSessionId;
  const roundtrip = createPhotopeaSaveRoundtrip(input.exportTimeoutMs);
  const listeners = new Set<() => void>();
  let state = UNCONFIRMED;
  let currentItem = input.item;
  let confirmedDigest: string | undefined;
  let pendingReceipt = false;
  let baseline: Promise<void> = Promise.resolve();
  let host: HTMLDivElement | null = null;
  let frame: HTMLIFrameElement | null = null;
  let anchor: HTMLElement | null = null;
  let ownerDocument: Document | null = null;
  let ownerWindow: Window | null = null;
  let animation: number | undefined;
  let attachment = 0;
  let ready = false;
  let sequence = 0;
  let expectedMarker = "";
  let marked = false;
  let received = false;
  let pending: Promise<LibraryItem> | null = null;
  let pendingFinal = false;
  let failedBytes: ArrayBuffer | null = null;
  let disposed = false;
  let leaving = false;
  let background: AdvancedPersistenceController<LibraryItem> | null = null;

  function publish(next: PhotopeaSaveState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function position() {
    if (!anchor || !host || !ownerWindow) return;
    const rect = anchor.getBoundingClientRect();
    // Never move/reparent the iframe: doing so reloads its browsing context.
    Object.assign(host.style, {
      left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    });
    animation = ownerWindow.requestAnimationFrame(position);
  }

  function conceal() {
    if (animation !== undefined) ownerWindow?.cancelAnimationFrame(animation);
    animation = undefined;
    if (host) {
      host.style.visibility = "hidden";
      host.style.pointerEvents = "none";
      host.setAttribute("aria-hidden", "true");
    }
  }

  function release() {
    if (disposed) return;
    disposed = true;
    conceal();
    ownerWindow?.removeEventListener("message", receive);
    ownerWindow?.removeEventListener("pagehide", onPageHide);
    ownerDocument?.removeEventListener("visibilitychange", onVisibility);
    host?.remove();
    frame = null;
    host = null;
    liveSessions.delete(session);
  }

  function sendExport() {
    if (!ready || !pending || received || !frame) return;
    expectedMarker = `oceanleo-photopea:${id}:${++sequence}`;
    marked = false;
    // UC-6: exact origin in both directions; marker rejects late replies from
    // a timed-out export. See docs/architecture/oceanleo-untrusted-content-isolation.md.
    postToPhotopea(frame.contentWindow,
      `app.echoToOE(${JSON.stringify(expectedMarker)});${PHOTOPEA_PNG_EXPORT_SCRIPT}`,
      PHOTOPEA_ORIGIN);
  }

  async function persist(bytes: ArrayBuffer) {
    try {
      await baseline;
      const result = await (input.saveDocument ?? persistPhotopeaDocument)({
        item: currentItem, siteId: input.siteId, bytes, confirmedDigest,
      });
      if (!result.ok) {
        failedBytes = result.retryExport ? null : bytes;
        roundtrip.settle(result);
        return;
      }
      confirmedDigest = result.digest;
      currentItem = result.item;
      pendingReceipt = pendingReceipt || !result.unchanged;
      if (pendingReceipt) {
        if (input.recordSavedItem && !await input.recordSavedItem(result.item)) {
          throw new Error("图片已上传，但会话还没确认保存，请重试。");
        }
        input.onSaved?.(result.item);
        pendingReceipt = false;
      }
      failedBytes = null;
      roundtrip.settle(result);
    } catch (error) {
      failedBytes = bytes;
      roundtrip.settle({ ok: false, error: error instanceof Error ? error.message : "图片没有存成新版本。" });
    }
  }

  function receive(event: MessageEvent) {
    // UC-6: an origin match alone must never authorize another iframe.
    if (!isPhotopeaFrameSource(event, frame?.contentWindow)) return;
    const message = classifyPhotopeaMessage(event);
    if (message.kind === "script-done" && !ready) {
      ready = true;
      sendExport();
    } else if (message.kind === "log" && pending && message.text === expectedMarker) {
      marked = true;
    } else if (message.kind === "document" && pending && marked && !received) {
      received = true;
      roundtrip.received(); // Export deadline is not the server upload deadline.
      void persist(message.bytes);
    }
  }

  function save(): Promise<LibraryItem> {
    if (pending) return pending;
    if (disposed || !frame) return Promise.reject(new Error("专业编辑尚未准备好，无法导出图片。"));
    received = false;
    marked = false;
    pendingFinal = leaving;
    publish({ phase: "saving", message: "正在导出并保存专业编辑的图片…" });
    pending = roundtrip.expect().then((item) => {
      // Photopea has no dirty/generation feed. A receipt covers this export,
      // not edits made inside the still-visible iframe during/after upload.
      publish(UNCONFIRMED);
      return item;
    }, (error) => {
      publish({ phase: "error", message: error instanceof Error ? error.message : "专业编辑还没确认保存。" });
      throw error;
    }).finally(() => { pending = null; });
    if (leaving && failedBytes) {
      received = true;
      roundtrip.received();
      void persist(failedBytes);
    } else {
      sendExport();
    }
    return pending;
  }

  async function saveFinal(): Promise<LibraryItem> {
    if (pending && !pendingFinal) {
      // An earlier visible export does not cover edits made while it uploaded.
      // Freeze first, finish that request, then capture the final pixels.
      try { await pending; } catch { /* the final export can still succeed */ }
    }
    if (!pendingFinal) failedBytes = null;
    return save();
  }

  function backgroundSave() {
    if (background || disposed) return;
    background = new AdvancedPersistenceController<LibraryItem>({
      maxRetries: 0,
      flushRevision: async () => {
        try {
          let item = await (leaving ? saveFinal() : save());
          if (!anchor || leaving) {
            if (!pendingFinal) item = await saveFinal();
            release();
          }
          return { ok: true, item };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "专业编辑还没确认保存。" };
        }
      },
      recordSavedItem: () => true,
      onStateChange: (next) => {
        if (next === "saved") background = null;
      },
    });
    background.observe({ revision: 1, dirty: true });
    handOff(`photopea:${input.item.artifactId || input.item.key || input.item.id}:${id}`, background);
  }

  function onVisibility() {
    if (ownerDocument?.visibilityState === "hidden") backgroundSave();
  }
  function onPageHide() { backgroundSave(); }

  const session: PhotopeaSession = {
    attach(nextAnchor, options) {
      if (disposed) throw new Error("专业编辑已经关闭，请重新打开。 ");
      attachment += 1;
      anchor = nextAnchor;
      leaving = false;
      if (!frame) {
        ownerDocument = anchor.ownerDocument;
        ownerWindow = ownerDocument.defaultView;
        if (!ownerWindow) throw new Error("专业编辑无法打开。");
        baseline = options.documentDataUrl
          ? toPhotopeaDocumentRef(options.documentDataUrl).then((ref) => { if (ref.ok) confirmedDigest = ref.digest; })
          : Promise.resolve();
        host = ownerDocument.createElement("div");
        host.dataset.photopeaSession = String(id);
        Object.assign(host.style, { position: "fixed", zIndex: "40", overflow: "hidden" });
        frame = ownerDocument.createElement("iframe");
        frame.title = "Photopea";
        // UC-3: preserve the untrusted sandbox; no allow-same-origin.
        frame.setAttribute("sandbox", photopeaFrameSandbox());
        frame.setAttribute("referrerpolicy", "no-referrer");
        frame.dataset.testid = "image-photopea-frame";
        Object.assign(frame.style, { width: "100%", height: "100%", border: "0" });
        frame.src = photopeaLaunchUrl(options);
        host.append(frame);
        ownerWindow.addEventListener("message", receive);
        ownerWindow.addEventListener("pagehide", onPageHide);
        ownerDocument.addEventListener("visibilitychange", onVisibility);
        ownerDocument.body.append(host);
        liveSessions.add(session);
      }
      if (animation !== undefined) ownerWindow?.cancelAnimationFrame(animation);
      host!.style.visibility = "visible";
      host!.style.pointerEvents = "auto";
      host!.removeAttribute("aria-hidden");
      position();
      return () => {
        const detached = ++attachment;
        anchor = null;
        conceal();
        // StrictMode's cleanup/setup pair reattaches synchronously. A real
        // unmount transfers to the existing background failure/retry notice.
        queueMicrotask(() => {
          if (detached !== attachment || anchor || disposed) return;
          leaving = true;
          backgroundSave();
        });
      };
    },
    save,
    leave() {
      leaving = true;
      conceal(); // No further edits can race this final export.
      return saveFinal().then((item) => { release(); return item; }, (error) => {
        leaving = !anchor;
        if (host && anchor) {
          // Once editing resumes, retained failed bytes no longer cover the
          // next leave. Detached retries may still reuse their frozen bytes.
          failedBytes = null;
          pendingFinal = false;
          host.style.visibility = "visible";
          host.style.pointerEvents = "auto";
          host.removeAttribute("aria-hidden");
          position();
        }
        throw error;
      });
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => state,
  };
  return session;
}
