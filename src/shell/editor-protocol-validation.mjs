export function validAssetUrl(value) {
  if (value === undefined) return true;
  if (typeof value !== "string" || !value || value.length > 4_096) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1"))
    );
  } catch {
    return false;
  }
}

export function recordValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

export function boundedString(value, max, required = false) {
  return (
    (value === undefined && !required) ||
    (typeof value === "string" &&
      value.length <= max &&
      (!required || value.length > 0))
  );
}

export function boundedRecord(value, max) {
  if (!recordValue(value)) return false;
  try {
    return JSON.stringify(value).length <= max;
  } catch {
    return false;
  }
}

const MANIFEST_ID_RE = /^[a-z0-9][a-z0-9_.:-]{0,79}$/i;
const PROJECT_ICONS = new Set([
  "add",
  "agent",
  "ai",
  "align-center",
  "align-left",
  "align-right",
  "animate",
  "background",
  "bold",
  "border",
  "bring-forward",
  "crop",
  "color",
  "delete",
  "download",
  "draw",
  "duplicate",
  "effects",
  "elements",
  "file",
  "filter",
  "flip-horizontal",
  "flip-vertical",
  "font",
  "image",
  "italic",
  "layers",
  "library",
  "line",
  "link",
  "lock",
  "materials",
  "more",
  "note",
  "opacity",
  "pages",
  "position",
  "redo",
  "rotate",
  "save",
  "select",
  "send-backward",
  "settings",
  "shape",
  "signature",
  "spacing",
  "table",
  "tasks",
  "templates",
  "text",
  "timeline",
  "underline",
  "undo",
  "unlock",
  "uploads",
]);

export function validRevision(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0;
  }
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function validManifestId(value) {
  return typeof value === "string" && MANIFEST_ID_RE.test(value);
}

function validProjectIcon(value) {
  return value === undefined || PROJECT_ICONS.has(value);
}

function validControlValue(value) {
  return (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length <= 2_000)
  );
}

export function normalizeEditorHistory(value) {
  const history = recordValue(value);
  if (!history) return null;
  if (
    typeof history.canUndo === "boolean" &&
    typeof history.canRedo === "boolean"
  ) {
    if (history.revision !== undefined && !validRevision(history.revision)) {
      return null;
    }
    return {
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      ...(history.revision !== undefined
        ? { revision: history.revision }
        : {}),
    };
  }
  if (
    Number.isSafeInteger(history.undo_depth) &&
    Number(history.undo_depth) >= 0 &&
    Number.isSafeInteger(history.redo_depth) &&
    Number(history.redo_depth) >= 0 &&
    (history.history_version === undefined ||
      validRevision(history.history_version))
  ) {
    return {
      canUndo: Number(history.undo_depth) > 0,
      canRedo: Number(history.redo_depth) > 0,
      ...(history.history_version !== undefined
        ? { revision: history.history_version }
        : {}),
    };
  }
  return null;
}

function validSwatch(value) {
  if (value === undefined) return true;
  if (typeof value !== "string" || value.length > 500) return false;
  return (
    /^#[0-9a-f]{3,8}$/i.test(value) ||
    (/^(?:linear|radial)-gradient\([^;{}]*\)$/i.test(value) &&
      !/url\s*\(/i.test(value))
  );
}

export function validToolManifest(value) {
  if (!Array.isArray(value) || value.length > 24) return false;
  const ids = new Set();
  return value.every((candidate) => {
    const tool = recordValue(candidate);
    if (
      !tool ||
      !validManifestId(tool.id) ||
      ids.has(tool.id) ||
      !boundedString(tool.label, 120, true) ||
      !validProjectIcon(tool.icon) ||
      !validManifestId(tool.controlId) ||
      !Array.isArray(tool.choices) ||
      tool.choices.length === 0 ||
      tool.choices.length > 64
    ) {
      return false;
    }
    ids.add(tool.id);
    const values = new Set();
    return tool.choices.every((candidateChoice) => {
      const choice = recordValue(candidateChoice);
      if (
        !choice ||
        !validControlValue(choice.value) ||
        !boundedString(choice.label, 120, true) ||
        !validSwatch(choice.swatch)
      ) {
        return false;
      }
      const key = JSON.stringify(choice.value);
      if (values.has(key)) return false;
      values.add(key);
      return true;
    });
  });
}

export function validProjectManifest(value) {
  const manifest = recordValue(value);
  if (
    !manifest ||
    !validRevision(manifest.revision) ||
    !Array.isArray(manifest.views) ||
    manifest.views.length > 16 ||
    !Array.isArray(manifest.actions) ||
    manifest.actions.length > 24
  ) {
    return false;
  }
  const ids = new Set();
  let activeViews = 0;
  for (const candidate of manifest.views) {
    const view = recordValue(candidate);
    if (
      !view ||
      !validManifestId(view.id) ||
      ids.has(view.id) ||
      !boundedString(view.label, 120, true) ||
      !validProjectIcon(view.icon) ||
      typeof view.active !== "boolean" ||
      (view.disabled !== undefined && typeof view.disabled !== "boolean")
    ) {
      return false;
    }
    ids.add(view.id);
    if (view.active) activeViews += 1;
  }
  if (manifest.views.length > 0 && activeViews !== 1) return false;
  for (const candidate of manifest.actions) {
    const action = recordValue(candidate);
    if (
      !action ||
      !validManifestId(action.id) ||
      ids.has(action.id) ||
      !boundedString(action.label, 120, true) ||
      !boundedString(action.busyLabel, 120) ||
      !validProjectIcon(action.icon) ||
      (action.variant !== undefined &&
        !["default", "primary", "danger", "icon"].includes(
          String(action.variant),
        )) ||
      (action.disabled !== undefined && typeof action.disabled !== "boolean") ||
      (action.busy !== undefined && typeof action.busy !== "boolean")
    ) {
      return false;
    }
    ids.add(action.id);
  }
  return true;
}

function validRecoveryValue(value, depth = 0, seen = new WeakSet()) {
  if (depth > 24) return false;
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return typeof value !== "string" || value.length <= 4_000_000;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 100_000) return false;
    return value.every((entry) =>
      validRecoveryValue(entry, depth + 1, seen),
    );
  }
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const entries = Object.entries(value);
  if (entries.length > 100_000) return false;
  return entries.every(
    ([key, entry]) =>
      key.length > 0 &&
      key.length <= 300 &&
      key !== "__proto__" &&
      key !== "constructor" &&
      key !== "prototype" &&
      validRecoveryValue(entry, depth + 1, seen),
  );
}

export function isEditorRecoverySnapshot(value) {
  const snapshot = recordValue(value);
  if (
    !snapshot ||
    !validRevision(snapshot.revision) ||
    (snapshot.confirmedRevision !== undefined &&
      !validRevision(snapshot.confirmedRevision)) ||
    (typeof snapshot.revision === "number" &&
      typeof snapshot.confirmedRevision === "number" &&
      snapshot.confirmedRevision > snapshot.revision) ||
    !validRecoveryValue(snapshot.payload)
  ) {
    return false;
  }
  try {
    return JSON.stringify(snapshot.payload).length <= 4_000_000;
  } catch {
    return false;
  }
}

export function validAssetPayload(value) {
  const asset = recordValue(value);
  return Boolean(
    asset &&
      boundedString(asset.id, 256, true) &&
      boundedString(asset.kind, 80, true) &&
      boundedString(asset.title, 300, true) &&
      validAssetUrl(asset.url) &&
      validAssetUrl(asset.previewUrl) &&
      boundedRecord(asset.meta, 20_000) &&
      typeof asset.writable === "boolean",
  );
}
