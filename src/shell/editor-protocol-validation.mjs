// [loopback-dev-gate:begin] 网页永远不许直连本机。
// 两道条件同时成立才放行本机地址，缺一即拒：
//  1. 构建期常量：打包器把 `process.env.NODE_ENV` 换成字面量 `"production"`，
//     生产 bundle 里这里收敛成 `return false`，下面的 loopback 分支构建期不可达；
//  2. 页面自身的 origin 也必须在 loopback 上。这一条与任何 flag 无关：
//     `oceanleo.com` 上的脚本（含 XSS）永远不满足它，所以即使 NODE_ENV 被翻掉，
//     线上页面也拿不到通往用户本机的地址。
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function isLoopbackHostname(value) {
  return LOOPBACK_HOSTNAMES.has(
    String(value || "")
      .toLowerCase()
      .replace(/^\[|\]$/g, ""),
  );
}

function localDevLoopbackOpen() {
  if (typeof process === "undefined" || process.env.NODE_ENV === "production") {
    return false;
  }
  return isLoopbackHostname(globalThis.location?.hostname || "");
}
// [loopback-dev-gate:end]

export function validAssetUrl(value) {
  if (value === undefined) return true;
  if (typeof value !== "string" || !value || value.length > 4_096) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" &&
        isLoopbackHostname(parsed.hostname) &&
        localDevLoopbackOpen())
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
    if (view.role !== undefined && view.role !== "page" && view.role !== "artifact") {
      console.error(
        "[oceanleo.editor.v1] discard project-manifest: invalid view.role",
        view.role,
      );
      return false;
    }
    if (!boundedString(view.unavailableReason, 300)) {
      console.error(
        "[oceanleo.editor.v1] discard project-manifest: invalid view.unavailableReason",
        view.unavailableReason,
      );
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
    if (
      action.placement !== undefined &&
      action.placement !== "document" &&
      action.placement !== "download"
    ) {
      console.error(
        "[oceanleo.editor.v1] discard project-manifest: invalid action.placement",
        action.placement,
      );
      return false;
    }
    if (
      action.group !== undefined &&
      action.group !== "edit" &&
      action.group !== "save" &&
      action.group !== "download"
    ) {
      console.error(
        "[oceanleo.editor.v1] discard project-manifest: invalid action.group",
        action.group,
      );
      return false;
    }
    ids.add(action.id);
  }
  return true;
}

/** 既有 init 的可选 chrome 字段。缺省通过；非法值整条丢掉。 */
export function validHostInitChrome(record) {
  if (!record || record.chrome === undefined) return true;
  if (record.chrome === "host") return true;
  console.error(
    "[oceanleo.editor.v1] discard init: invalid chrome",
    record.chrome,
  );
  return false;
}

/**
 * 一条 manifest 动作最终归哪一组（规范 v2 §4）。显式 `group` 优先；
 * 没写时由 `placement` 推：download → "download"，其余 → "edit"。
 * 只看这两个字段，不看 label / id（下载菜单、保存菜单都不许按译文猜）。
 */
export function projectActionGroup(action) {
  if (
    action?.group === "edit" ||
    action?.group === "save" ||
    action?.group === "download"
  ) {
    return action.group;
  }
  return action?.placement === "download" ? "download" : "edit";
}

/**
 * 已通过校验的 project-manifest → 宿主页面行 / 编辑栏 / 保存菜单 / 下载菜单切片。
 * role "artifact" 并进「编辑」；缺省 role 当 "page"。
 * 动作按 `projectActionGroup()` 分三组：`documentActions`（edit，进编辑栏）、
 * `saveActions`（进第一行保存菜单）、`downloadActions`（进第一行下载菜单）。
 * `pro`（可选）→ `proLabel` / `proUnavailableReason`：只认 ≤ 200 字的非空字符串，
 * 其余（缺省、非字符串、超长、空串）一律当没说 = `undefined`。
 */
export function classifyProjectManifest(manifest) {
  const views = Array.isArray(manifest?.views) ? manifest.views : [];
  const actions = Array.isArray(manifest?.actions) ? manifest.actions : [];
  const auxViews = views.filter((view) => view.role !== "artifact");
  const artifactView = views.find((view) => view.role === "artifact") || null;
  const active = views.find((view) => view.active) || null;
  const activeIsAux = Boolean(active && active.role !== "artifact");
  const pro = recordValue(manifest?.pro);
  return {
    auxViews,
    artifactView,
    artifactViewId: artifactView?.id || views[0]?.id || null,
    activePageId: activeIsAux ? active.id : "artifact",
    proLabel: proManifestString(pro?.label),
    proUnavailableReason: proManifestString(pro?.unavailableReason),
    documentActions: actions.filter(
      (action) => projectActionGroup(action) === "edit",
    ),
    saveActions: actions.filter(
      (action) => projectActionGroup(action) === "save",
    ),
    downloadActions: actions.filter(
      (action) => projectActionGroup(action) === "download",
    ),
  };
}

const PRO_MANIFEST_STRING_MAX = 200;

function proManifestString(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= PRO_MANIFEST_STRING_MAX
    ? value
    : undefined;
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

// ═══ 宿主契约 v2（W01，2026-09-03，editor-core-swap）══════════════════════
// 校验器住在这里而不是 `editor-protocol.ts`，理由是硬的：那份文件撞着 600 行
// 拆分闸（`tests/advanced-canva-interactions.test.mjs`），只剩十几行余量。
// 指令白名单的 fail-closed 前置拦截**仍然留在** `editor-protocol.ts`
// （`untrusted-content-sandbox-origin.test.mjs` 盯的就是那两句的字面），
// 下面两个 dispatcher 只在过闸之后才被调用。

/** 契约版本号。`tools-manifest.manifestVersion` 的 2 与它同源。 */
export const HOSTED_EDITOR_CONTRACT_VERSION = "2.0";

const EDITOR_MODES = new Set(["normal", "pro"]);
const REVIEW_DECISIONS = new Set(["accept", "reject"]);
const REVIEW_CHANGE_OPS = new Set(["add", "remove", "update", "move"]);
const AGENT_CHIP_KINDS = new Set([
  "analyze",
  "cleanup",
  "export",
  "extract",
  "generate",
  "layout",
  "restyle",
  "rewrite",
  "summarize",
  "translate",
]);
// 与 `selection-context.ts` 的 KIND_RE 同形，另放行通配 `*`（任意选区）。
const CHIP_SELECTION_KIND_RE = /^(?:\*|[a-z][a-z0-9_-]{0,47})$/i;

/** `tools-manifest` v2 的 chips 字段。缺省 = v1 编辑器，直接放行。 */
export function validAgentChips(value) {
  if (value === undefined) return true;
  // 五层规范 §2：chips ≤ 8。上限写在校验器里，免得每个编辑器各自解释。
  if (!Array.isArray(value) || value.length > 8) return false;
  const ids = new Set();
  return value.every((candidate) => {
    const chip = recordValue(candidate);
    if (
      !chip ||
      !validManifestId(chip.id) ||
      ids.has(chip.id) ||
      !boundedString(chip.label, 120, true) ||
      !AGENT_CHIP_KINDS.has(String(chip.kind)) ||
      !boundedString(chip.prompt, 2_000, true) ||
      !validProjectIcon(chip.icon) ||
      !Array.isArray(chip.appliesTo) ||
      chip.appliesTo.length === 0 ||
      chip.appliesTo.length > 24 ||
      !chip.appliesTo.every(
        (kind) =>
          typeof kind === "string" && CHIP_SELECTION_KIND_RE.test(kind),
      )
    ) {
      return false;
    }
    ids.add(chip.id);
    return true;
  });
}

/**
 * `tools-manifest` 整条消息的校验（revision + tools + v2 的两个可选字段）。
 * 合成一个函数是为了给 `editor-protocol.ts` 省行——它离 600 行拆分闸只剩个位数。
 * v1 编辑器不发 `manifestVersion` / `chips`，两条都走 undefined 直接放行。
 */
export function validToolsManifestMessage(record) {
  return Boolean(
    validRevision(record.revision) &&
      validToolManifest(record.tools) &&
      (record.manifestVersion === undefined || record.manifestVersion === 2) &&
      validAgentChips(record.chips),
  );
}

function validReviewObjectChanges(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    return false;
  }
  return value.every((candidate) => {
    const change = recordValue(candidate);
    return Boolean(
      change &&
        boundedString(change.id, 200, true) &&
        REVIEW_CHANGE_OPS.has(String(change.op)) &&
        boundedString(change.label, 200, true) &&
        boundedString(change.before, 4_000) &&
        boundedString(change.after, 4_000),
    );
  });
}

export function validReviewProposal(value) {
  const proposal = recordValue(value);
  if (!proposal) return false;
  const summary = recordValue(proposal.summary);
  const hasDiff = proposal.diff !== undefined;
  const hasObjects = proposal.objects !== undefined;
  if (
    !boundedString(proposal.proposalId, 128, true) ||
    !validManifestId(proposal.commandId) ||
    !validRevision(proposal.revision) ||
    !summary ||
    !boundedString(summary.before, 2_000, true) ||
    !boundedString(summary.after, 2_000, true) ||
    // diff 与 objects **恰好给一个**：两个都给等于两份会互相矛盾的事实源，
    // 审阅面板就得挑一份信，那时候挑错没人看得出来。
    hasDiff === hasObjects ||
    (hasDiff && !boundedString(proposal.diff, 200_000, true)) ||
    (hasObjects && !validReviewObjectChanges(proposal.objects))
  ) {
    return false;
  }
  return boundedRecord(proposal, 400_000);
}

/**
 * v2 的 editor→host 分支。未知 type 一律回 `null`——与它在
 * `asEditorToHostMessage` 里替换掉的那句 `return null` 逐字等价。
 */
export function contractV2EditorToHost(type, record, normalizeSelection) {
  if (type !== "review-proposal" || !validReviewProposal(record.proposal)) {
    return null;
  }
  const target = record.proposal.targetSelection;
  if (target === null) return record;
  const selection = normalizeSelection(target);
  if (!selection) return null;
  return {
    ...record,
    proposal: { ...record.proposal, targetSelection: selection },
  };
}

/** v2 的 host→editor 分支。同上，未知 type 回 `null`。 */
export function contractV2HostToEditor(type, record) {
  if (type === "set-mode") {
    return EDITOR_MODES.has(String(record.mode)) ? record : null;
  }
  if (type === "hide-chrome") {
    return typeof record.toolbar === "boolean" &&
      typeof record.panels === "boolean"
      ? record
      : null;
  }
  if (type === "review-decision") {
    return boundedString(record.proposalId, 128, true) &&
      REVIEW_DECISIONS.has(String(record.decision))
      ? record
      : null;
  }
  return null;
}
