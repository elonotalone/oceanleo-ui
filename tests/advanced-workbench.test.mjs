import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("every workspace detail exposes the full-screen advanced workbench", () => {
  const library = source("../src/shell/WorkspaceLibrary.tsx");
  assert.match(library, /const workbenchItem: LibraryItem/);
  assert.match(library, /setAdvancedOpen\(true\)/);
  assert.match(library, /previewContent=\{selected\.content\}/);
  assert.doesNotMatch(
    library,
    /\{selected\.libraryItem && \(\s*<button[\s\S]*?高级功能/,
  );
});

test("advanced workbench routes real content into the portal editor shell", () => {
  const workbench = source("../src/shell/AdvancedContentWorkbench.tsx");
  const shell = source("../src/shell/AdvancedWorkbenchShell.tsx");
  const routeAdapters = [
    source("../src/shell/advanced-routes/VideoTimelineRoute.tsx"),
    source("../src/shell/advanced-routes/OfficeRoute.tsx"),
    source("../src/shell/advanced-routes/EmbeddedRoute.tsx"),
    source("../src/shell/advanced-routes/ImageRoute.tsx"),
    source("../src/shell/advanced-routes/GridRoute.tsx"),
    source("../src/shell/advanced-routes/DeckRoute.tsx"),
    source("../src/shell/advanced-routes/PdfRoute.tsx"),
    source("../src/shell/advanced-routes/Model3DRoute.tsx"),
  ].join("\n");
  const routes = source("../src/shell/workbench-routes.ts");
  assert.match(workbench, /editorRouteFor\(props\.item\)/);
  assert.match(workbench, /dynamic\(/);
  assert.match(workbench, /WorkbenchRouteLoading/);
  assert.match(workbench, /VideoTimelineRoute/);
  assert.match(workbench, /OfficeRoute/);
  assert.match(workbench, /EmbeddedRoute/);
  assert.match(workbench, /AudioRoute/);
  assert.match(workbench, /RichDocRoute/);
  assert.match(workbench, /ImageRoute/);
  assert.match(workbench, /GridRoute/);
  assert.match(workbench, /DeckRoute/);
  assert.match(workbench, /PdfRoute/);
  assert.match(workbench, /Model3DRoute/);
  assert.doesNotMatch(workbench, /LegacyAdvancedContentWorkbench/);
  assert.match(routeAdapters, /AdvancedWorkbenchShell/);
  assert.match(shell, /createPortal\(/);
  assert.match(shell, /fixed inset-0/);
  assert.match(shell, /requestFullscreen\(\)/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /element\.inert = true/);
  assert.match(shell, /event\.key !== "Tab"/);
  assert.match(shell, /id: "agent" as const, label: tt\("Agent"\)/);
  for (const type of [
    "video-timeline",
    "audio",
    "image",
    "pdf",
    "richdoc",
    "grid",
    "deck",
    "threed",
    "embed",
  ]) {
    assert.match(routes, new RegExp(`type: "${type}"`));
  }
});

test("advanced Agent follows the current task instead of forking history", () => {
  const panel = source("../src/shell/AdvancedAgentPanel.tsx");
  const canvas = source("../src/shell/ResultCanvas.tsx");
  assert.match(panel, /setActiveTaskId\(sessionTaskId\)/);
  assert.match(panel, /advancedSession\.taskId/);
  assert.match(panel, /followUp\(activeTaskId, context, attachments\)/);
  assert.match(panel, /item\.url \|\| item\.previewUrl/);
  assert.match(panel, /attachments,/);
  assert.doesNotMatch(panel, /advancedSession\?\.navigate/);
  assert.match(canvas, /taskId \|\| workspaceSession\?\.taskId \|\| null/);
  assert.match(canvas, /taskId=\{effectiveTaskId\}/);
});

test("advanced work is session-backed, deep-linkable and starts a fresh saved conversation", () => {
  const workbench = source("../src/shell/AdvancedContentWorkbench.tsx");
  const panel = source("../src/shell/AdvancedAgentPanel.tsx");
  const history = source("../src/shell/HistoryMasterDetail.tsx");
  const session = source("../src/shell/WorkspaceSession.tsx");
  assert.match(workbench, /advancedSessionAppId/);
  assert.match(workbench, /historySessionHref\(sessionId\)/);
  assert.match(panel, /tt\("新建对话"\)/);
  assert.match(panel, /advancedSession\.startNew\(\)/);
  assert.match(history, /advancedItemFromSession/);
  assert.match(history, /<AdvancedContentWorkbench/);
  assert.match(session, /const startNew = useCallback/);
  assert.doesNotMatch(workbench, /resumeLatest=\{false\}/);
  assert.match(workbench, /taskId === undefined \? workspace\.taskId : taskId/);
  assert.match(workbench, /workspace\.mode === "history"/);
});

test("first advanced edit only ensures history and every mutable route can flush", () => {
  const shell = source("../src/shell/AdvancedWorkbenchShell.tsx");
  const pdf = source("../src/shell/advanced-routes/PdfRoute.tsx");
  const model = source("../src/shell/advanced-routes/Model3DRoute.tsx");
  const dirtyEffect = shell.match(
    /if \(!advancedSession \|\| dirtyRecordedRef\.current\) return;[\s\S]*?\}, \[advancedSession, editorDirty\]\);/,
  )?.[0] || "";
  assert.match(dirtyEffect, /advancedSession\.ensure\(\)/);
  assert.doesNotMatch(dirtyEffect, /onBeforeNewConversation|navigate/);
  assert.match(pdf, /onBeforeNewConversation=\{saveBeforeNewConversation\}/);
  assert.match(model, /onBeforeNewConversation=\{saveBeforeNewConversation\}/);
});

test("advanced split drag captures the pointer and embedded editors stay two-column", () => {
  const shell = source("../src/shell/AdvancedWorkbenchShell.tsx");
  const protocol = source("../src/shell/editor-protocol.ts");
  const embed = source("../src/shell/workbench-embed.tsx");
  assert.match(shell, /setPointerCapture/);
  assert.match(shell, /requestAnimationFrame/);
  assert.match(shell, /cursor-col-resize bg-transparent/);
  assert.match(shell, /editorUsesOwnControls/);
  assert.match(protocol, /set-host-layout/);
  assert.match(embed, /sidePanelVisible/);
  assert.match(embed, /saveId: saveRequestId/);
});

test("code-backed website starters reach the visual editor without a fake project id", () => {
  const routes = source("../src/shell/workbench-routes.ts");
  const embedded = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  const materials = source("../src/shell/MaterialLibrary.tsx");
  assert.match(routes, /if \(!projectId && !starterId\) return \{ type: "none" \}/);
  assert.match(embedded, /starterId \? \{ starterId \} : undefined/);
  assert.match(materials, /workspace-starters/);
  assert.match(materials, /starter_id: starterId/);
  assert.match(materials, /library\/starters\/\$\{encodeURIComponent\(starterId\)\}\/view/);
});

test("late catalog categories stay behind More and editor loads have hard deadlines", () => {
  const library = source("../src/shell/WorkspaceLibrary.tsx");
  const officeClient = source("../src/lib/office-client.ts");
  const officeWorkbench = source("../src/shell/office-editor/OfficeWorkbench.tsx");
  assert.match(library, /primaryCategoryIds/);
  assert.match(library, /setCategoriesExpanded\(\(value\) => !value\)/);
  assert.match(library, /tt\(categoriesExpanded \? "收起" : "更多"\)/);
  assert.match(officeClient, /controller\.abort\(\), 30_000/);
  assert.match(officeClient, /loadOfficeScriptOnce/);
  assert.match(officeClient, /OnlyOffice 脚本加载超时/);
  assert.match(officeWorkbench, /Office 编辑器加载超时，请重试或打开原文件/);
  assert.match(officeWorkbench, /dirtySinceSaveRef\.current/);
});

test("specialist embeds require a trusted origin, frame and instance handshake", () => {
  const protocol = source("../src/shell/editor-protocol.ts");
  const embed = source("../src/shell/workbench-embed.tsx");
  assert.match(protocol, /EDITOR_PROTOCOL = "oceanleo\.editor\.v1"/);
  assert.match(protocol, /record\.instanceId !== instanceId/);
  assert.match(protocol, /hostname\.endsWith\("\.oceanleo\.com"\)/);
  assert.match(embed, /event\.source !== iframeRef\.current\?\.contentWindow/);
  assert.match(embed, /event\.origin !== editorOrigin/);
  assert.match(embed, /type: "open-asset"/);
  assert.match(embed, /type: "save-request"/);
  assert.match(embed, /type: "save-result"/);
  assert.match(embed, /Number\(result\.data\?\.saved \|\| 0\) === 1/);
});

test("editor protocol rejects malformed artifacts and uncorrelated saves", async () => {
  const {
    EDITOR_PROTOCOL,
    asEditorToHostMessage,
    asHostToEditorMessage,
    isTrustedEditorOrigin,
  } = await import("../src/shell/editor-protocol.ts");
  const base = {
    protocol: EDITOR_PROTOCOL,
    instanceId: "instance-1",
    type: "artifact-created",
  };
  assert.equal(
    asEditorToHostMessage({ ...base, url: "javascript:alert(1)" }, "instance-1"),
    null,
  );
  assert.equal(
    asEditorToHostMessage(
      { ...base, url: "https://cdn.example.test/a.png", meta: { ok: true } },
      "wrong-instance",
    ),
    null,
  );
  assert.equal(
    asEditorToHostMessage(
      {
        ...base,
        url: "https://cdn.example.test/a.png",
        meta: { oversized: "x".repeat(20_001) },
      },
      "instance-1",
    ),
    null,
  );
  assert.ok(
    asEditorToHostMessage(
      { ...base, url: "https://cdn.example.test/a.png", saveId: "save-1" },
      "instance-1",
    ),
  );
  assert.equal(
    asHostToEditorMessage(
      {
        protocol: EDITOR_PROTOCOL,
        instanceId: "instance-1",
        type: "save-request",
      },
      "instance-1",
    ),
    null,
  );
  assert.ok(
    asHostToEditorMessage(
      {
        protocol: EDITOR_PROTOCOL,
        instanceId: "instance-1",
        type: "save-request",
        saveId: "host-save-1",
      },
      "instance-1",
    ),
  );
  assert.equal(isTrustedEditorOrigin("https://video.oceanleo.com"), true);
  assert.equal(isTrustedEditorOrigin("https://video.oceanleo.com.evil.test"), false);
});

test("cloud browser can be opened directly and still supports takeover", () => {
  const panel = source("../src/shell/CloudBrowserPanel.tsx");
  const client = source("../src/lib/browser.ts");
  assert.match(panel, /createCloudBrowser\(url, effectiveTaskId \|\| undefined\)/);
  assert.match(panel, /reload\(session\.id\)/);
  assert.match(panel, /driving \? "release" : "takeover"/);
  assert.match(client, /export function createCloudBrowser/);
});

test("full-page library and right workspace share the heterogeneous My Library", () => {
  const artifacts = source("../src/shell/ArtifactLibrary.tsx");
  const mine = source("../src/shell/MyLibrary.tsx");
  const i18n = source("../src/i18n/ui/useUI.ts");
  assert.match(artifacts, /<MyLibrary/);
  assert.match(artifacts, /作品、网站、任务交付物和上传文件统一保存在这里/);
  assert.match(mine, /getDatabaseOverview/);
  assert.match(mine, /onlyFavorites/);
  assert.match(i18n, /\.replaceAll\("文件库", "我的库"\)/);
  assert.match(i18n, /\.replaceAll\("檔案庫", "我的库"\)/);
});

test("embedded workspaces keep SSR and hydration snapshots identical", () => {
  const embed = source("../src/lib/embed.ts");
  assert.match(embed, /useSyncExternalStore\(subscribeUrlFlags, isEmbed, serverFlag\)/);
  assert.match(embed, /useSyncExternalStore\(subscribeUrlFlags, isSolo, serverFlag\)/);
  assert.match(embed, /function serverFlag\(\): boolean \{\s*return false;/);
  assert.doesNotMatch(embed, /useState<boolean>\(\(\) => isEmbed\(\)\)/);
});
