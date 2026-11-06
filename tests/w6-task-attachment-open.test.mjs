// ============================================================================
// W6 (2026-10-31, operator point 3): every file on the task page opens in the
// same right sidebar the home page uses, for every file type.
// ----------------------------------------------------------------------------
// - immediate (same as home): typed libraryItem as is; a local blob: tile at once;
// - a sent private reference reads its Library item back (the viewer re-signs an
//   expired grant itself); unreadable → a fresh rendition URL + the reference;
// - a computer task's inbox file goes through the owner-checked route and is read
//   into a local blob: (no storage host on the page); too big / refused → null;
// - the opener shows only the last click;
// - AgentChat wires the cloud AND native pane (bubble + composer) to one opener,
//   so the native composer never falls back to AttachmentStrip's old PreviewPanel.
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  "./workbench-routes": dataModule("export function editorCapabilityFor(item){ return { available: item?.meta?.editable === true }; }\n"),
}));
const {
  immediateTaskAttachment, resolveTaskAttachment, loadNativeArchiveBlobUrl, nativeArchiveOf,
  useTaskAttachmentOpener, NATIVE_ARCHIVE_PREVIEW_MAX_BYTES,
} = mod;

const ART = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";
const ROUTE = "/v1/computer-task-sessions/cts_abc/attachments/att_1";
const durable = (extra = {}) => ({
  key: `artifact:${ART}:${REV}`, source: "artifact", id: ART, artifactId: ART, revisionId: REV,
  title: "report.pdf", kind: "document", siteId: "oceanleo", favorite: false, meta: {}, ...extra,
});
const never = () => { throw new Error("must not be called"); };

test("immediate: a typed libraryItem opens as is; a local blob tile opens at once; a sent reference waits", () => {
  const typed = durable({ meta: { editable: true } });
  assert.deepEqual(immediateTaskAttachment({ id: "x", libraryItem: typed }), { item: typed, mode: "edit" });
  const tile = immediateTaskAttachment({ id: "a-1", name: "shot.png", mime: "image/png", previewUrl: "blob:https://oceanbizs.com/1", url: "blob:https://oceanbizs.com/1" });
  assert.equal(tile.item.kind, "image");
  assert.equal(tile.item.url, "blob:https://oceanbizs.com/1");
  assert.equal(tile.mode, "preview");
  assert.equal(immediateTaskAttachment({ url: "https://api/v1/artifact-renditions/access/t", artifact_id: ART, revision_id: REV, name: "a.png", mime: "image/png" }), null);
  assert.equal(immediateTaskAttachment({ url: "", name: "notes.md", native_archive: { download_path: ROUTE } }), null);
});

test("sent private reference: the Library item is read back (viewer re-signs; editor when it has one)", async () => {
  const calls = [];
  const target = await resolveTaskAttachment(
    // The bubble hands over its thumbnail grant as `url`; the reference wins.
    { url: "https://api/v1/artifact-renditions/access/thumb", artifact_id: ART, revision_id: REV, name: "report.pdf", mime: "application/pdf" },
    "oceanleo",
    { loadLibraryItem: async (a, r) => { calls.push([a, r]); return durable({ meta: { editable: true } }); }, resolveUrl: never, loadNativeArchive: never },
  );
  assert.deepEqual(calls, [[ART, REV]]);
  assert.equal(target.item.artifactId, ART);
  assert.equal(target.mode, "edit");
});

test("reference not readable: a fresh rendition URL (source for files, preview for images) and the reference kept", async () => {
  const purposes = [];
  const deps = {
    loadLibraryItem: async () => null,
    resolveUrl: async (ref, purpose) => { purposes.push([ref.artifactId, purpose]); return `https://api/v1/artifact-renditions/access/${purpose}`; },
    loadNativeArchive: never,
  };
  const pdf = await resolveTaskAttachment({ url: "", artifact_id: ART, revision_id: REV, name: "report.pdf", mime: "application/pdf" }, "oceanleo", deps);
  assert.equal(pdf.item.kind, "document");
  assert.equal(pdf.item.url, "https://api/v1/artifact-renditions/access/source");
  assert.equal(pdf.item.artifactId, ART, "an expired grant is re-signed from the reference");
  assert.equal(pdf.item.revisionId, REV);
  assert.equal(pdf.mode, "preview");
  const img = await resolveTaskAttachment({ url: "", artifact_id: ART, revision_id: REV, name: "cat.png", media_type: "image" }, "oceanleo", deps);
  assert.equal(img.item.kind, "image");
  assert.deepEqual(purposes, [[ART, "source"], [ART, "preview"]]);
});

test("computer task inbox file: read through the owner-checked route into a blob, every type keeps its kind", async () => {
  const seen = [];
  const deps = { loadLibraryItem: never, resolveUrl: never, loadNativeArchive: async (path, mime) => { seen.push([path, mime]); return "blob:https://oceanbizs.com/inbox"; } };
  const kinds = {
    "report.pdf": ["application/pdf", "document"],
    "plan.docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"],
    "data.xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "sheet"],
    "deck.pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "ppt"],
    "clip.mp4": ["video/mp4", "video"],
    "memo.m4a": ["audio/mp4", "audio"],
    "main.py": ["text/x-python", "document"],
    "bundle.zip": ["application/zip", "document"],
  };
  for (const [name, [mime, kind]] of Object.entries(kinds)) {
    const target = await resolveTaskAttachment({ url: "", name, mime, native_archive: { download_path: ROUTE, size: 1024, mime, name } }, "oceanleo", deps);
    assert.equal(target.item.kind, kind, name);
    assert.equal(target.item.url, "blob:https://oceanbizs.com/inbox", name);
    assert.equal(target.item.meta.mime, mime, `${name}: the viewer picks by the real type`);
    assert.equal(target.mode, "preview");
  }
  assert.equal(seen[0][0], ROUTE);
  // A native composer tile (uploaded, not sent) carries the same copy as `nativeArchive`.
  const tile = await resolveTaskAttachment({ id: "a-2", name: "notes.md", mime: "text/markdown", nativeArchive: { download_path: ROUTE } }, "oceanleo", deps);
  assert.equal(tile.item.url, "blob:https://oceanbizs.com/inbox");
  // Too big to read into the page, refused, or not the owner route → the caller's download fallback.
  assert.equal(await resolveTaskAttachment({ url: "", name: "big.mov", native_archive: { download_path: ROUTE, size: NATIVE_ARCHIVE_PREVIEW_MAX_BYTES + 1 } }, "oceanleo", deps), null);
  assert.equal(await resolveTaskAttachment({ url: "", name: "x.pdf", native_archive: { download_path: ROUTE } }, "oceanleo", { ...deps, loadNativeArchive: async () => null }), null);
  assert.equal(nativeArchiveOf({ url: "", native_archive: { download_path: "https://evil.example/x" } }), null);
  assert.equal(await resolveTaskAttachment({ url: "", name: "x.pdf", native_archive: { download_path: "/v1/other" } }, "oceanleo", deps), null);
});

test("loadNativeArchiveBlobUrl: https only, size-capped, typed by the archive row", async () => {
  const realFetch = globalThis.fetch;
  const realCreate = URL.createObjectURL;
  const made = [];
  URL.createObjectURL = (blob) => { made.push(blob); return "blob:https://oceanbizs.com/made"; };
  try {
    globalThis.fetch = async () => new Response(new Blob(["%PDF-1.7"], { type: "application/octet-stream" }));
    assert.equal(await loadNativeArchiveBlobUrl(ROUTE, "application/pdf", async () => "https://store.example/signed?t=1"), "blob:https://oceanbizs.com/made");
    assert.equal(made[0].type, "application/pdf");
    assert.equal(await loadNativeArchiveBlobUrl(ROUTE, "application/pdf", async () => "http://store.example/x"), null);
    assert.equal(await loadNativeArchiveBlobUrl(ROUTE, "application/pdf", async () => "https://u:p@store.example/x"), null);
    assert.equal(await loadNativeArchiveBlobUrl("/v1/elsewhere", "application/pdf", never), null);
    globalThis.fetch = async () => new Response("", { status: 403 });
    assert.equal(await loadNativeArchiveBlobUrl(ROUTE, "application/pdf", async () => "https://store.example/x"), null);
  } finally {
    globalThis.fetch = realFetch;
    URL.createObjectURL = realCreate;
  }
});

test("legacy public attachment: opened through the gateway proxy, never the storage host", async () => {
  const target = await resolveTaskAttachment({ url: "https://abc.supabase.co/storage/v1/object/public/media-uploads/a.png", name: "a.png", mime: "image/png" }, "oceanleo", { loadLibraryItem: never, resolveUrl: never, loadNativeArchive: never });
  assert.match(target.item.url, /\/v1\/media\/proxy\?url=/);
});

test("opener: an immediate file shows at once; an unopenable earlier click reports false and never replaces the later one", async () => {
  const shown = [];
  let open;
  function Host() {
    open = useTaskAttachmentOpener("oceanleo", (target) => shown.push(target.item.key));
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(React.createElement(Host)));
  assert.equal(await open({ id: "t1", name: "a.png", mime: "image/png", previewUrl: "blob:https://oceanbizs.com/a" }), true);
  assert.deepEqual(shown, ["attachment:t1"]);
  // A slow inbox read overtaken by a local tile click: the tile stays.
  const slow = open({ url: "", name: "x.pdf", mime: "application/pdf", native_archive: { download_path: ROUTE, size: NATIVE_ARCHIVE_PREVIEW_MAX_BYTES + 1 } });
  await open({ id: "t2", name: "b.png", mime: "image/png", previewUrl: "blob:https://oceanbizs.com/b" });
  assert.equal(await slow, false, "too big: the caller keeps its download fallback");
  assert.deepEqual(shown, ["attachment:t1", "attachment:t2"]);
  await act(async () => root.unmount());
});

test("AgentChat: cloud and native panes (bubble + composer) open files through one opener", () => {
  const src = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
  assert.match(src, /const openTaskAttachment = useTaskAttachmentOpener\(/);
  const composers = src.match(/<LeoComposer\b[\s\S]*?\/>/g) || [];
  assert.ok(composers.length >= 2);
  for (const composer of composers) {
    assert.match(composer, /onOpenAttachment=\{openTaskAttachment\}/, "no task composer falls back to AttachmentStrip's PreviewPanel");
  }
  const bubbles = src.match(/<AgentTranscriptBubble\b[\s\S]*?\/>/g) || [];
  assert.ok(bubbles.length >= 2);
  for (const bubble of bubbles) assert.match(bubble, /onOpenAttachment=\{openTaskAttachment\}/);
  // A Library editor thread keeps its editor mounted while an opened file is shown.
  assert.match(src, /fileOverWorkspace \? "hidden" : "h-full"[\s\S]*?\{workspaceContent\}[\s\S]*?\{fileOverWorkspace && right\}/);
  const thread = readFileSync(new URL("../src/shell/native-thread/useNativeThread.ts", import.meta.url), "utf8");
  assert.match(thread, /item\.archive \? \{ nativeArchive: item\.archive \}/);
  const bubble = readFileSync(new URL("../src/shell/AgentTranscriptBubble.tsx", import.meta.url), "utf8");
  assert.match(bubble, /<NativeArchivedAttachment[\s\S]*?onOpen=\{onOpen \? \(\) => onOpen\(attachment\) : undefined\}/);
});
