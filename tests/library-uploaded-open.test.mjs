// ============================================================================
// 10-31: Library "Uploaded" category + chat files open the Library at the file.
// ----------------------------------------------------------------------------
// - isUploadedLibraryItem: typed roles / provenance user_upload, or the legacy
//   meta.library_source === "upload";
// - a file already in the Library (typed libraryItem, sent private ref, computer
//   task archive artifact_id) → Library action {tab:"mine", itemId, intent:"open",
//   category, filter:"uploaded"}; a local blob: tile still uploading → direct preview;
// - the workspace action normalizer keeps `filter: "uploaded"` and drops other values;
// - the computer-task archive sanitizer keeps a UUID artifact_id only.
// ============================================================================

import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const mod = await import(await compileModule("src/shell/task-attachment-open.ts", {
  "./SplitWorkspace": dataModule("export function SplitWorkspace(){ return null; }\nexport function useRightPaneSlot(){ return null; }\n"),
  "./ResultCanvas": dataModule("export function ResultCanvas(){ return null; }\n"),
  "./WorkspaceSession": dataModule("export function WorkspaceSessionProvider({ children }){ return children; }\n"),
  "./workspace-session-context": dataModule("export function useOptionalWorkspaceSession(){ return null; }\n"),
  "./workbench-routes": dataModule("export function editorCapabilityFor(){ return { available: false }; }\n"),
}));
const { taskAttachmentLibraryAction, openTaskWorkspaceLibrary, useTaskAttachmentOpener, uploadLibraryCategory } = mod;
const { isUploadedLibraryItem } = await import(await compileModule("src/shell/library-data.ts"));
const { normalizeWorkspaceAction } = await import(await compileModule("src/shell/workspace-actions.ts"));
const { safeArchivedAttachment } = await import(await compileModule("src/shell/cloud-computer/agent-dialog/message-attachments.ts"));

const ART = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";
const ROUTE = "/v1/computer-task-sessions/cts_abc/attachments/cta_1";
const durable = (artifact = {}, extra = {}) => ({
  key: `artifact:${ART}:${REV}`, source: "artifact", id: ART, artifactId: ART, revisionId: REV, artifactType: "single_file_image",
  title: "shot.png", kind: "image", siteId: "oceanleo", favorite: false, meta: {},
  artifact: { artifactId: ART, revisionId: REV, roles: ["user_upload"], provenance: { sourceKind: "user_upload" }, ...artifact },
  ...extra,
});

test("isUploadedLibraryItem: roles, provenance, or legacy library_source", () => {
  assert.equal(isUploadedLibraryItem(durable()), true);
  assert.equal(isUploadedLibraryItem(durable({ roles: [], provenance: { sourceKind: "user_upload" } })), true);
  assert.equal(isUploadedLibraryItem({ meta: { roles: ["user_upload"] } }), true);
  assert.equal(isUploadedLibraryItem({ meta: { library_source: "upload" } }), true);
  assert.equal(isUploadedLibraryItem(durable({ roles: ["template"], provenance: { sourceKind: "generated" } })), false);
  assert.equal(isUploadedLibraryItem({ meta: { library_source: "asset" } }), false);
});

test("Library action: typed item, sent reference and computer-task archive all open the Library at the file", () => {
  assert.deepEqual(taskAttachmentLibraryAction({ id: "t1", name: "shot.png", mime: "image/png", libraryItem: durable() }), {
    version: 1, tab: "mine", itemId: ART, intent: "open", category: "images", filter: "uploaded",
  });
  assert.deepEqual(taskAttachmentLibraryAction({ url: "", artifact_id: ART, revision_id: REV, name: "r.pdf", mime: "application/pdf" }), {
    version: 1, tab: "mine", itemId: ART, intent: "open", category: "pdf", filter: "uploaded",
  });
  assert.deepEqual(
    taskAttachmentLibraryAction({ url: "", name: "notes.md", native_archive: { download_path: ROUTE, mime: "text/markdown", artifact_id: ART } }),
    { version: 1, tab: "mine", itemId: ART, intent: "open", category: "documents", filter: "uploaded" },
  );
  // A Library pick that is not an upload opens without the Uploaded filter.
  const picked = taskAttachmentLibraryAction({ id: "t2", libraryItem: durable({ roles: [], provenance: { sourceKind: "generated" } }) });
  assert.equal(picked.itemId, ART);
  assert.equal(picked.filter, undefined);
  // Not in the Library yet: local blob tile, archive without artifact_id, non-UUID ids.
  assert.equal(taskAttachmentLibraryAction({ id: "t3", name: "a.png", mime: "image/png", previewUrl: "blob:https://oceanbizs.com/a" }), null);
  assert.equal(taskAttachmentLibraryAction({ url: "", name: "x.zip", native_archive: { download_path: ROUTE } }), null);
  assert.equal(taskAttachmentLibraryAction({ url: "", name: "x", native_archive: { download_path: ROUTE, artifact_id: "nope" } }), null);
  assert.equal(uploadLibraryCategory("application/zip", "x.zip"), undefined);
  assert.equal(uploadLibraryCategory("", "deck.pptx"), "presentations");
});

test("opener: with showLibrary, an uploaded file emits the Library action; a local blob still previews", async () => {
  const shown = [];
  const library = [];
  let open;
  function Host() {
    open = useTaskAttachmentOpener("oceanleo", (target) => shown.push(target.item.key), (action) => library.push(action));
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(React.createElement(Host)));
  assert.equal(await open({ url: "", name: "notes.md", native_archive: { download_path: ROUTE, mime: "text/markdown", artifact_id: ART } }), true);
  assert.equal(await open({ id: "t1", name: "a.png", mime: "image/png", libraryItem: durable() }), true);
  assert.deepEqual(library.map((a) => [a.tab, a.itemId, a.intent, a.filter]), [["mine", ART, "open", "uploaded"], ["mine", ART, "open", "uploaded"]]);
  assert.deepEqual(shown, []);
  assert.equal(await open({ id: "t2", name: "b.png", mime: "image/png", previewUrl: "blob:https://oceanbizs.com/b" }), true);
  assert.deepEqual(shown, ["attachment:t2"]);
  assert.equal(library.length, 2);
  await act(async () => root.unmount());

  const calls = [];
  openTaskWorkspaceLibrary({
    setRightOpen: (v) => calls.push(["open", v]),
    setLibTab: (v) => calls.push(["tab", v]),
    setWorkspaceAction: (v) => calls.push(["action", v.action, typeof v.nonce]),
  }, library[0]);
  assert.deepEqual(calls, [["open", true], ["tab", "mine"], ["action", library[0], "string"]]);
});

test("workspace action normalizer keeps filter:uploaded only; archive sanitizer keeps a UUID artifact_id", () => {
  assert.equal(normalizeWorkspaceAction({ version: 1, tab: "mine", itemId: ART, filter: "uploaded" }).filter, "uploaded");
  assert.equal("filter" in normalizeWorkspaceAction({ version: 1, tab: "mine", filter: "anything" }), false);
  assert.equal("filter" in normalizeWorkspaceAction({ version: 1, tab: "mine" }), false);
  const base = { id: "cta_1", name: "a.png", mime: "image/png", size: 3, download_path: ROUTE };
  assert.equal(safeArchivedAttachment({ ...base, artifact_id: ART }).artifact_id, ART);
  assert.equal("artifact_id" in safeArchivedAttachment({ ...base, artifact_id: "x" }), false);
});
