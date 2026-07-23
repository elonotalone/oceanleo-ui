import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("workspace files leave the library list and take over the fixed main canvas", () => {
  const library = source("../src/shell/WorkspaceLibrary.tsx");
  const canvas = source("../src/shell/ResultCanvas.tsx");
  assert.match(library, /const workbenchItem: LibraryItem/);
  assert.match(library, /artifactActionMatrix/);
  assert.match(library, /Primary card activation is quiet preview/);
  assert.match(library, /onEdit=\{editItem\}/);
  assert.match(library, /onOpenEntry\(entry\)/);
  assert.doesNotMatch(library, /<AdvancedContentWorkbench/);
  assert.match(canvas, /<AdvancedContentWorkbench/);
  assert.match(canvas, /activeCanvasEntry/);
  assert.match(canvas, /activeCanvasMode === "edit"/);
  assert.match(canvas, /<WorkspaceEntryCanvas/);
  assert.doesNotMatch(library, /advancedFeatureHrefForItem/);
  assert.doesNotMatch(library, /router\.push\(href\)/);
});

test("typed routes render real content in the inline App-library editor shell", () => {
  const workbench = source("../src/shell/AdvancedContentWorkbench.tsx");
  const shell = [
    source("../src/shell/AdvancedWorkbenchShell.tsx"),
    source("../src/shell/InlineAdvancedWorkbenchShell.tsx"),
    source("../src/shell/FloatingContextToolbar.tsx"),
    source("../src/shell/AdvancedStageControls.tsx"),
  ].join("\n");
  const routeAdapters = [
    source("../src/shell/advanced-routes/VideoTimelineRoute.tsx"),
    source("../src/shell/advanced-routes/EmbeddedRoute.tsx"),
    source("../src/shell/advanced-routes/ImageRoute.tsx"),
    source("../src/shell/advanced-routes/GridRoute.tsx"),
    source("../src/shell/advanced-routes/DeckRoute.tsx"),
    source("../src/shell/advanced-routes/PdfRoute.tsx"),
    source("../src/shell/advanced-routes/Model3DRoute.tsx"),
    source("../src/shell/advanced-routes/ChartRoute.tsx"),
  ].join("\n");
  const routes =
    source("../src/shell/workbench-routes.ts") +
    source("../src/shell/workbench-capability-registry.ts");
  assert.match(workbench, /editorRouteFor\(props\.item\)/);
  assert.match(workbench, /dynamic\(/);
  assert.match(workbench, /WorkbenchRouteLoading/);
  assert.match(workbench, /VideoTimelineRoute/);
  assert.doesNotMatch(workbench, /\bOfficeRoute\b|case "office"/);
  assert.match(workbench, /EmbeddedRoute/);
  assert.match(workbench, /AudioRoute/);
  assert.match(workbench, /RichDocRoute/);
  assert.match(workbench, /ImageRoute/);
  assert.match(workbench, /GridRoute/);
  assert.match(workbench, /DeckRoute/);
  assert.match(workbench, /PdfRoute/);
  assert.match(workbench, /Model3DRoute/);
  assert.match(workbench, /ChartRoute/);
  assert.doesNotMatch(workbench, /LegacyAdvancedContentWorkbench/);
  assert.match(routeAdapters, /AdvancedWorkbenchShell/);
  assert.match(shell, /data-inline-editor/);
  assert.match(shell, /const showWorkspaceDetail = workspacePane\?\.showDetail/);
  assert.match(shell, /<AdvancedWorkbenchStage/);
  assert.match(shell, /requestFullscreen\(\)/);
  assert.match(shell, /createPortal\(/);
  assert.match(shell, /data-workspace-floating-toolbar/);
  assert.doesNotMatch(shell, /aria-modal="true"/);
  assert.doesNotMatch(shell, /id: "tasks"/);
  assert.doesNotMatch(shell, /id: "uploads"/);
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

test("inline editors reuse the current App Agent instead of mounting another chat", () => {
  const panel = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const canvas = source("../src/shell/ResultCanvas.tsx");
  assert.doesNotMatch(panel, /AdvancedAgentPanel/);
  assert.doesNotMatch(panel, /LeoComposer/);
  assert.doesNotMatch(panel, /followUp\(/);
  assert.match(panel, /showWorkspaceDetail\(\{/);
  assert.match(canvas, /taskId \|\| workspaceSession\?\.taskId \|\| null/);
  assert.match(canvas, /taskId=\{effectiveTaskId\}/);
});

test("inline editing reuses App history while retired URLs only redirect", () => {
  const workbench = source("../src/shell/AdvancedContentWorkbench.tsx");
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const history = source("../src/shell/HistoryMasterDetail.tsx");
  const pages = source("../src/shell/AdvancedFeaturePages.tsx");
  assert.match(workbench, /if \(props\.embedded\)/);
  assert.match(workbench, /inheritedWorkspace/);
  assert.match(workbench, /withInlineEditorHistoryHead/);
  assert.match(workbench, /workspace\.saveSnapshot/);
  assert.match(workbench, /onSavedItem/);
  assert.doesNotMatch(shell, /startNew/);
  assert.doesNotMatch(shell, /新建任务/);
  assert.match(pages, /router\.replace\("\/"\)/);
  assert.match(history, /historySessionHref\(entry\.id\)/);
  assert.doesNotMatch(history, /advancedFeatureHref/);
});

test("retired direct advanced routes return to the App surface", () => {
  const pages = source("../src/shell/AdvancedFeaturePages.tsx");
  const exportedSurface = pages.split("function LegacyAdvancedFeatureRoute")[0];
  assert.match(exportedSurface, /高级编辑已融入 App 的生成与库/);
  assert.match(exportedSurface, /router\.replace\("\/"\)/);
  assert.doesNotMatch(exportedSurface, /<MyLibrary/);
});

test("first inline edit ensures App history and every mutable route can flush", () => {
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const pdf = source("../src/shell/advanced-routes/PdfRoute.tsx");
  const model = source("../src/shell/advanced-routes/Model3DRoute.tsx");
  const dirtyEffect = shell.match(
    /if \(!advancedSession \|\| dirtyRecordedRef\.current\) return;[\s\S]*?\}, \[advancedSession, editorDirty\]\);/,
  )?.[0] || "";
  assert.match(dirtyEffect, /advancedSession\.ensure\(\)/);
  assert.doesNotMatch(dirtyEffect, /onBeforeNewConversation|navigate/);
  assert.match(pdf, /flush: saveBeforeNewConversation/);
  assert.match(model, /flush: saveBeforeNewConversation/);
});

test("library panels are static while embedded editors stay isolated", () => {
  const shell = [
    source("../src/shell/SplitWorkspace.tsx"),
    source("../src/shell/InlineAdvancedWorkbenchShell.tsx"),
  ].join("\n");
  const protocol =
    source("../src/shell/editor-protocol.ts") +
    source("../src/shell/editor-protocol-types.ts");
  const embed =
    source("../src/shell/workbench-embed.tsx") +
    source("../src/shell/use-embed-editor-messages.ts");
  assert.match(shell, /registerLibraryPanel/);
  assert.match(shell, /openLibraryPanel/);
  assert.doesNotMatch(shell, /libraryDockDragging|libraryDockStartXRef/);
  assert.match(shell, /adapter\.nativeChrome\?\.viewport/);
  assert.match(shell, /clearDetail/);
  assert.match(protocol, /set-host-layout/);
  assert.match(embed, /sidePanelVisible/);
  assert.match(embed, /hostOwnsChrome: true/);
  assert.match(embed, /saveId: saveRequestId/);
});

test("code-backed website starters reach the visual editor without a fake project id", () => {
  const routes = source("../src/shell/workbench-routes.ts");
  const embedParams = source("../src/shell/website-embed-params.ts");
  const materials =
    source("../src/shell/MaterialLibrary.tsx") +
    source("../src/shell/material-library-controller.ts") +
    source("../src/shell/material-library-view.tsx");
  assert.match(
    routes,
    /if \(!projectId && !starterId && !githubRepo\) \{[\s\S]*?return unavailable\(/,
  );
  assert.match(embedParams, /params\.starterId = starterId/);
  assert.match(embedParams, /params\.githubRepo = githubRepo/);
  assert.match(embedParams, /const identity = stableArtifactIdentity\(item\)/);
  assert.match(embedParams, /params\.artifactId = identity\.artifactId/);
  assert.match(embedParams, /params\.revisionId = identity\.revisionId/);
  assert.match(materials, /workspace-starters/);
  assert.match(materials, /starter_id: starterId/);
  assert.match(materials, /library\/starters\/\$\{encodeURIComponent\(starterId\)\}\/view/);
});

test("advanced material browsing never navigates out of the current workbench", () => {
  const shell = [
    source("../src/shell/AdvancedWorkbenchShell.tsx"),
    source("../src/shell/InlineEditorMaterialPanel.tsx"),
  ].join("\n");
  const materials =
    source("../src/shell/MaterialLibrary.tsx") +
    source("../src/shell/material-library-view.tsx");
  assert.match(shell, /allowAdvancedOnSelect=\{false\}/);
  assert.match(
    materials,
    /allowAdvanced=\{allowAdvancedOnSelect\}/,
  );
  assert.match(materials, /materialActionEvidence/);
});

test("advanced materials click to center and drag to the exact canvas point", () => {
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const library = source("../src/shell/WorkspaceLibrary.tsx");
  const provider = source("../src/shell/workbench-material-provider.tsx");
  const registry = source("../src/shell/workbench-material-registry.ts");
  const deck = source("../src/shell/advanced-routes/DeckRoute.tsx");
  const timeline = source(
    "../src/shell/advanced-routes/VideoTimelineRoute.tsx",
  );
  const timelineArea = source("../src/shell/video-editor/TimelineArea.tsx");
  const embedded = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  assert.match(library, /primaryMaterialAction/);
  assert.match(library, /activateEntry/);
  assert.match(library, /materialActionPendingRef/);
  assert.match(library, /materialActionPendingRef\.current = false/);
  assert.doesNotMatch(
    library,
    /if \(!onMaterialAction \|\| materialActionState\) return/,
  );
  assert.match(library, /draggable: enabled/);
  assert.match(library, /dataTransfer\.setData/);
  assert.match(registry, /source: "click" \| "drop"/);
  assert.match(shell, /source: "drop"/);
  assert.match(shell, /clientX: event\.clientX/);
  assert.match(shell, /clientY: event\.clientY/);
  assert.match(shell, /requestedMaterialAction/);
  assert.match(shell, /activeMaterialAction/);
  assert.match(deck, /editor\.insertImageElement/);
  assert.match(timeline, /timelineInsertionMs\(placement, editor\.playheadMs\)/);
  assert.match(timelineArea, /data-video-timeline-content/);
  assert.match(embedded, /setMaterialInsertion/);
  assert.match(
    embedded,
    /materialResolversRef\.current\.delete\(commandId\);[\s\S]*?current\?\.commandId === commandId \? null/,
  );
  assert.match(embedded, /onMaterialResult/);
  assert.doesNotMatch(embedded, /editorToolbox=/);
  assert.match(
    embedded,
    /\}, \[\s*designComposite,\s*designSourceReceipt,\s*hostedMediaType,\s*\]\);/,
  );
  assert.doesNotMatch(
    embedded,
    /\}, \[route\]\);\s*useWorkbenchMaterialAdapter/,
  );
  assert.match(provider, /const adapterRef = useRef\(adapter\)/);
  assert.match(provider, /Register a stable proxy/);
  assert.match(provider, /useWorkbenchMaterialScope/);
  assert.match(registry, /beginWorkbenchMaterialDrag/);
});

test("the shared property bar dispatches direct, dropdown and drawer controls", () => {
  const toolbar =
    source("../src/shell/SelectionToolbar.tsx") +
    source("../src/shell/SelectionToolbarButtonControl.tsx") +
    source("../src/shell/SelectionToolbarNumberControl.tsx") +
    source("../src/shell/SelectionToolbarSelectControl.tsx") +
    source("../src/shell/selection-inspector-host.tsx");
  const inspector = source("../src/shell/SelectionInspectorPanel.tsx");
  const context =
    source("../src/shell/selection-context.ts") +
    source("../src/shell/selection-context-types.ts");
  assert.match(toolbar, /control\.kind === "action" \|\| control\.kind === "panel"/);
  assert.match(toolbar, /control\.panelAction/);
  assert.match(toolbar, /aria-haspopup="listbox"/);
  assert.match(toolbar, /role="option"/);
  assert.match(toolbar, /control\.kind === "toggle"/);
  assert.match(toolbar, /type="color"/);
  assert.doesNotMatch(toolbar, /type="range"/);
  assert.doesNotMatch(toolbar, /overflow-x-auto/);
  assert.match(toolbar, /scrollbar-width:none/);
  assert.match(toolbar, /aria-expanded/);
  assert.match(inspector, /type="range"/);
  assert.match(inspector, /<textarea/);
  assert.match(toolbar, /openTransientPanel/);
  assert.match(toolbar, /data-selection-inspector-fallback/);
  assert.match(context, /"panel"/);
  assert.match(context, /panelId\?: string/);
  assert.match(context, /panelAction\?: SelectionPanelAction/);
});

test("live inspector panels refresh through a guarded store without render loops", () => {
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const store = source("../src/shell/live-react-node.tsx");
  const host = source("../src/shell/selection-inspector-host.tsx");
  assert.match(store, /Object\.is\(store\.node, node\)/);
  assert.match(shell, /updateTransientPanel/);
  assert.match(shell, /publishLiveReactNode\(liveHeaderStoreRef\.current, actionBar\)/);
  assert.match(host, /layout\.updateTransientPanel/);
  assert.doesNotMatch(shell, /store\.listeners\.forEach[\s\S]*useLayoutEffect\(\(\) => \{/);
});

test("late catalog categories stay behind More and native Office routes use the compact edit bar", () => {
  const library = source("../src/shell/WorkspaceLibrary.tsx");
  const officeClient = source("../src/lib/office-client.ts");
  const workbench = source("../src/shell/AdvancedContentWorkbench.tsx");
  const actionBar = source("../src/shell/AdvancedWorkspaceActionBar.tsx");
  assert.match(library, /primaryCategoryIds/);
  assert.match(library, /setCategoriesExpanded\(\(value\) => !value\)/);
  assert.match(library, /tt\(categoriesExpanded \? "收起" : "更多"\)/);
  assert.match(officeClient, /lightweightOfficeRouteForExtension/);
  assert.doesNotMatch(workbench, /\bOfficeRoute\b|case "office"/);
  for (const route of ["RichDocRoute", "GridRoute", "DeckRoute"]) {
    const contents = source(`../src/shell/advanced-routes/${route}.tsx`);
    assert.match(
      contents,
      /useOfficeArtifactSource\((?:item|openedItemRef\.current)\)/,
      route,
    );
    assert.doesNotMatch(contents, /nativeChrome/, route);
  }
  assert.match(actionBar, /role="toolbar"/);
  assert.match(actionBar, /className="flex h-8/);
  assert.match(actionBar, /adapter\.directDownload/);
});

test("specialist embeds require a trusted origin, frame and instance handshake", () => {
  const protocol =
    source("../src/shell/editor-protocol.ts") +
    source("../src/shell/editor-protocol-types.ts");
  const embed =
    source("../src/shell/workbench-embed.tsx") +
    source("../src/shell/use-embed-editor-messages.ts");
  const shell =
    source("../src/shell/InlineAdvancedWorkbenchShell.tsx") +
    source("../src/shell/FloatingContextToolbar.tsx");
  const embeddedRoute = source(
    "../src/shell/advanced-routes/EmbeddedRoute.tsx",
  );
  assert.match(protocol, /EDITOR_PROTOCOL = "oceanleo\.editor\.v1"/);
  assert.match(protocol, /record\.instanceId !== instanceId/);
  assert.match(protocol, /hostname\.endsWith\("\.oceanleo\.com"\)/);
  assert.match(embed, /event\.source !== iframeRef\.current\?\.contentWindow/);
  assert.match(embed, /event\.origin !== editorOrigin/);
  assert.match(embed, /\{ \.\.\.message, protocol: EDITOR_PROTOCOL, instanceId \}/);
  assert.match(embed, /asHostToEditorMessage\(envelope, instanceId\)/);
  assert.match(embed, /selectionGateRef\.current\.accept/);
  assert.match(
    embed,
    /item\.meta\.draft === true && !item\.url && !item\.previewUrl/,
  );
  assert.match(embed, /type: "open-asset"/);
  assert.match(embed, /type: "save-request"/);
  assert.match(embed, /type: "save-result"/);
  assert.match(embed, /type: "selection-command"/);
  assert.match(embed, /type: "material-insert"/);
  assert.match(embed, /message\.type === "material-result"/);
  assert.match(embed, /message\.type === "selection-changed"/);
  assert.match(embed, /getBoundingClientRect/);
  assert.match(embed, /frameLoaded/);
  assert.match(embed, /setAttempt\(\(value\) => value \+ 1\)/);
  assert.match(embed, /重新加载编辑器/);
  assert.doesNotMatch(embed, /在新窗口打开编辑器/);
  assert.doesNotMatch(embed, /target="_blank"/);
  assert.match(shell, /data-advanced-context-row/);
  assert.match(shell, /adapter\.renderContextToolbar\(layoutState\)/);
  assert.match(shell, /\{contextToolbar\}/);
  assert.match(
    shell,
    /const clearWorkspaceDetail = workspacePane\?\.clearDetail/,
  );
  assert.match(
    shell,
    /\(\) => \(\) => clearWorkspaceDetail\?\.\(ownerIdRef\.current\)/,
  );
  assert.doesNotMatch(
    shell,
    /\(\) => \(\) => workspacePane\?\.clearDetail\(ownerIdRef\.current\)/,
  );
  assert.match(embeddedRoute, /renderContextToolbar: \(\{ openDrawer \}\)/);
  assert.match(embeddedRoute, /onOpenPanel=\{openDrawer\}/);
  assert.doesNotMatch(shell, /-translate-y-full/);
  assert.match(embed, /Number\(result\.data\?\.saved \|\| 0\) === 1/);
});

test("editor protocol rejects malformed artifacts and uncorrelated saves", async () => {
  const {
    EDITOR_PROTOCOL,
    asEditorToHostMessage,
    asHostToEditorMessage,
    buildEditorEmbedUrl,
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
  const materialInsert = {
    protocol: EDITOR_PROTOCOL,
    instanceId: "instance-1",
    type: "material-insert",
    insertion: {
      commandId: "material-1",
      action: "insert",
      material: {
        id: "asset-1",
        kind: "image",
        title: "海报人物",
        url: "https://cdn.example.test/a.png",
        meta: {},
        writable: false,
      },
      point: { x: 480, y: 320 },
    },
  };
  assert.ok(asHostToEditorMessage(materialInsert, "instance-1"));
  assert.equal(
    asHostToEditorMessage(
      {
        ...materialInsert,
        insertion: {
          ...materialInsert.insertion,
          point: { x: Number.POSITIVE_INFINITY, y: 0 },
        },
      },
      "instance-1",
    ),
    null,
  );
  assert.ok(
    asEditorToHostMessage(
      {
        protocol: EDITOR_PROTOCOL,
        instanceId: "instance-1",
        type: "material-result",
        commandId: "material-1",
        ok: true,
      },
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
  assert.ok(
    asHostToEditorMessage(
      {
        protocol: EDITOR_PROTOCOL,
        instanceId: "instance-1",
        type: "save-result",
        ok: true,
        message: "saved",
        saveId: "host-save-1",
        artifactId: "11111111-1111-4111-8111-111111111111",
        revisionId: "22222222-2222-4222-8222-222222222222",
      },
      "instance-1",
    ),
  );
  assert.equal(
    asHostToEditorMessage(
      {
        protocol: EDITOR_PROTOCOL,
        instanceId: "instance-1",
        type: "save-result",
        ok: true,
        message: "saved",
        artifactId: "x".repeat(301),
      },
      "instance-1",
    ),
    null,
  );
  assert.equal(isTrustedEditorOrigin("https://video.oceanleo.com"), true);
  assert.equal(isTrustedEditorOrigin("https://video.oceanleo.com/path"), false);
  assert.equal(isTrustedEditorOrigin("https://video.oceanleo.com.evil.test"), false);
  assert.equal(isTrustedEditorOrigin("http://video.oceanleo.com"), false);
  assert.equal(
    asHostToEditorMessage(
      {
        protocol: EDITOR_PROTOCOL,
        instanceId: "instance-1",
        type: "viewport-command",
        commandId: "zoom-and-fit",
        value: 80,
        fit: true,
      },
      "instance-1",
    ),
    null,
  );
  assert.equal(
    asHostToEditorMessage(
      {
        protocol: EDITOR_PROTOCOL,
        instanceId: "instance-1",
        type: "open-asset",
        asset: {
          id: "asset-1",
          kind: "image",
          title: "Poster",
          meta: {},
          writable: "yes",
        },
      },
      "instance-1",
    ),
    null,
  );
  const embedUrl = new URL(
    buildEditorEmbedUrl("https://design.oceanleo.com/embed/editor", {
      instanceId: "instance-1",
      hostOrigin: "https://oceanleo.com",
      extra: { instance: "attacker", mode: "design" },
    }),
  );
  assert.equal(embedUrl.searchParams.get("instance"), "instance-1");
  assert.equal(embedUrl.searchParams.get("mode"), "design");
  assert.throws(() =>
    buildEditorEmbedUrl("https://evil.test/editor", {
      instanceId: "instance-1",
      hostOrigin: "https://oceanleo.com",
    }),
  );
});

test("cloud browser creates a fresh Google session and negotiates strict native-window v3", () => {
  const panel =
    source("../src/shell/CloudBrowserPanel.tsx") +
    source("../src/shell/cloud-browser-controls.tsx") +
    source("../src/shell/cloud-browser-live.ts") +
    source("../src/shell/cloud-browser-transport.ts") +
    source("../src/shell/cloud-browser-transport-actions.ts") +
    source("../src/shell/cloud-browser-protocol.ts") +
    source("../src/shell/cloud-browser-session-data.ts") +
    source("../src/shell/cloud-browser-wire.ts");
  const client = source("../src/lib/browser.ts");
  assert.match(
    panel,
    /createCloudBrowser\(\s*DEFAULT_BROWSER_URL,\s*\)/,
  );
  assert.doesNotMatch(
    panel,
    /createCloudBrowser\(\s*DEFAULT_BROWSER_URL,\s*effectiveTaskId/,
  );
  assert.match(panel, /reload\(created\.id\)/);
  assert.match(panel, /cloudBrowserAuthMessage/);
  assert.match(panel, /cloudBrowserV3Message/);
  assert.match(panel, /cloudBrowserV3FrameReceipt/);
  assert.match(panel, /native-chrome-window/);
  assert.match(panel, /transportStateRef\.current !== "streaming"/);
  assert.doesNotMatch(panel, /v2Envelope|legacyDrivingRef|protocol_versions/);
  assert.match(panel, /socket\.binaryType = "blob"/);
  assert.match(panel, /event\.data instanceof Blob/);
  assert.match(panel, /createImageBitmap/);
  assert.match(panel, /bitmap\?\.close\(\)/);
  assert.match(client, /export function createCloudBrowser/);
  assert.match(client, /protocol_version: 3/);
});

test("full-page library and right workspace share the heterogeneous My Library", () => {
  const artifacts = source("../src/shell/ArtifactLibrary.tsx");
  const mine = source("../src/shell/MyLibrary.tsx");
  const advancedShell = source("../src/shell/InlineEditorMaterialPanel.tsx");
  const i18n = source("../src/i18n/ui/useUI.ts");
  assert.match(artifacts, /<MyLibrary/);
  assert.match(artifacts, /作品、网站、任务交付物和上传文件统一保存在这里/);
  assert.match(mine, /listMyArtifacts/);
  assert.match(mine, /limit: 100/);
  assert.match(mine, /ownerPrincipalId/);
  assert.doesNotMatch(mine, /searchArtifactLibrary/);
  assert.match(mine, /onlyFavorites/);
  assert.match(mine, /isDurableLibraryItem/);
  assert.match(mine, /retireArtifact/);
  assert.match(mine, /uploadFile/);
  assert.match(mine, /ensureArtifact/);
  assert.doesNotMatch(advancedShell, /itemFilter=\{\(candidate\) =>/);
  assert.doesNotMatch(advancedShell, /advancedFeatureHrefForItem/);
  assert.match(advancedShell, /<MaterialLibrary/);
  assert.doesNotMatch(mine, /user_creations|agent_artifacts/);
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
