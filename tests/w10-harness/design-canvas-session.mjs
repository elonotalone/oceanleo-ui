import {
  EDITOR_SESSION_PROTOCOL,
  editorSaveMessage,
  parseEditorSessionMessage,
} from "/root/projects/oceanleo-app/editor-runtime/protocol/editor-session-v1.mjs";
import {
  createTrustedEditorContext,
  refuseUserScriptExecution,
} from "/root/projects/oceanleo-app/editor-runtime/isolation/trusted-context.mjs";

export const DESIGN_DOCUMENT_SCHEMA = "oceanleo.design-document.v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function parseDesignDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.schema !== DESIGN_DOCUMENT_SCHEMA) return null;
  if (value.version !== 1) return null;
  if (!value.document || !Array.isArray(value.document.elements)) return null;
  if (value.document.elements.length < 20) return null;
  return clone(value);
}

function titleOf(project) {
  const title = project.document.elements.find((element) => element.id === "title1");
  return title?.text || project.title || "";
}

function emit(listener, message) {
  if (typeof listener === "function") listener(message);
}

export function createDesignCanvasSession(fabric, canvasEl, options = {}) {
  const context = createTrustedEditorContext({ hasIpc: options.hasIpc !== false });
  const origin = options.origin;
  const onMessage = options.onMessage;
  const canvas = new fabric.Canvas(canvasEl, {
    preserveObjectStacking: true,
  });

  let sessionId = "";
  let documentId = "";
  let revision = "";
  let confirmedRevision = "";
  let dirty = false;
  let history = [];
  let historyIndex = -1;
  let pendingSave = null;
  let project = null;

  function paint(next) {
    canvas.clear();
    canvas.setDimensions({
      width: next.document.width,
      height: next.document.height,
    });
    canvas.backgroundColor = next.document.background;
    const sorted = [...next.document.elements].sort((left, right) => left.z - right.z);
    for (const element of sorted) {
      let object = null;
      if (element.type === "rect") {
        object = new fabric.Rect({
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          fill: element.fill || "#1F6FEB",
        });
      } else if (element.type === "ellipse") {
        object = new fabric.Ellipse({
          left: element.x,
          top: element.y,
          rx: element.width / 2,
          ry: element.height / 2,
          fill: element.fill || "#E5484D",
        });
      } else if (element.type === "text") {
        object = new fabric.Textbox(element.text || "", {
          left: element.x,
          top: element.y,
          width: element.width,
          fontSize: element.fontSizePx || 28,
          fill: element.fill || "#1F2328",
        });
      }
      if (!object) continue;
      object.oceanleoId = element.id;
      object.oceanleoKind = element.type;
      canvas.add(object);
    }
    canvas.requestRenderAll();
  }

  function pushHistory(next) {
    history = history.slice(0, historyIndex + 1);
    history.push(clone(next));
    historyIndex = history.length - 1;
    project = next;
    dirty = true;
    emit(onMessage, {
      protocol: EDITOR_SESSION_PROTOCOL,
      type: "changed",
      sessionId,
      dirty: true,
      revision,
      origin,
    });
  }

  function getState() {
    const objects = canvas.getObjects();
    const title = titleOf(project || { document: { elements: [] }, title: "" });
    return {
      objectCount: objects.length,
      title,
      dirty,
      revision,
      confirmedRevision,
      pwned: globalThis.__pwned,
      project,
      schema: DESIGN_DOCUMENT_SCHEMA,
    };
  }

  async function open(message) {
    const parsed = parseEditorSessionMessage(message, {
      direction: "host-to-editor",
      transport: options.transport || "in-process",
      expectedOrigin: origin,
    });
    const loaded = parseDesignDocument(parsed.payload);
    if (!loaded) {
      throw new Error("open payload 不是 oceanleo.design-document.v1");
    }
    if (parsed.schema !== DESIGN_DOCUMENT_SCHEMA) {
      throw new Error("open schema 必须是 oceanleo.design-document.v1");
    }
    sessionId = parsed.sessionId;
    documentId = parsed.documentId;
    revision = parsed.revision;
    confirmedRevision = parsed.revision;
    dirty = false;
    pendingSave = null;
    project = loaded;
    paint(loaded);
    for (const object of canvas.getObjects()) {
      if (typeof object.text === "string") {
        refuseUserScriptExecution(context, object.text);
      }
    }
    history = [clone(loaded)];
    historyIndex = 0;
    emit(onMessage, {
      protocol: EDITOR_SESSION_PROTOCOL,
      type: "ready",
      sessionId,
      origin,
    });
    return getState();
  }

  function setTitle(text) {
    const stored = refuseUserScriptExecution(context, text).stored;
    if (!project) throw new Error("没有打开的设计稿");
    const next = clone(project);
    next.title = stored.length >= 8 ? stored : next.title;
    next.document.elements = next.document.elements.map((element) =>
      element.id === "title1" ? { ...element, text: stored } : element,
    );
    paint(next);
    pushHistory(next);
    return getState();
  }

  function undo() {
    if (historyIndex <= 0) return getState();
    historyIndex -= 1;
    project = clone(history[historyIndex]);
    paint(project);
    dirty = historyIndex > 0;
    emit(onMessage, {
      protocol: EDITOR_SESSION_PROTOCOL,
      type: "dirty",
      sessionId,
      dirty,
      revision,
      origin,
    });
    return getState();
  }

  function redo() {
    if (historyIndex >= history.length - 1) return getState();
    historyIndex += 1;
    project = clone(history[historyIndex]);
    paint(project);
    dirty = true;
    emit(onMessage, {
      protocol: EDITOR_SESSION_PROTOCOL,
      type: "changed",
      sessionId,
      dirty: true,
      revision,
      origin,
    });
    return getState();
  }

  function requestSave(requestId) {
    pendingSave = { requestId, baseRevision: revision };
    const message = editorSaveMessage({
      sessionId,
      requestId,
      documentId,
      schema: DESIGN_DOCUMENT_SCHEMA,
      baseRevision: revision,
      payload: clone(project),
      origin,
    });
    emit(onMessage, message);
    return message;
  }

  function ackSave(message) {
    const parsed = parseEditorSessionMessage(message, {
      direction: "host-to-editor",
      sessionId,
      transport: options.transport || "in-process",
      expectedOrigin: origin,
    });
    if (!pendingSave || pendingSave.requestId !== parsed.requestId) {
      throw new Error("save-ack 对不上未确认的保存请求");
    }
    revision = parsed.revision;
    confirmedRevision = parsed.revision;
    dirty = false;
    pendingSave = null;
    return getState();
  }

  function exportPng() {
    return canvas.toDataURL({ format: "png", multiplier: 1 });
  }

  return {
    open,
    setTitle,
    undo,
    redo,
    requestSave,
    ackSave,
    exportPng,
    getState,
  };
}
