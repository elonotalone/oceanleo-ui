import { afterEach, describe, expect, test } from "vitest";
import React, { act } from "react";
import { compileModule, dataModule } from "../helpers/module-bench.mjs";
import "../helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const ART = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";
const ROUTE = "/v1/computer-task-sessions/cts_w13/attachments/att_w13";
const image = {
  key: `artifact:${ART}:${REV}`, source: "artifact", id: ART, artifactId: ART, revisionId: REV,
  title: "shot.png", kind: "image", artifactType: "single_file_image", siteId: "oceanleo", favorite: false,
  artifact: { artifactId: ART, revisionId: REV, roles: ["user_upload"], provenance: { sourceKind: "user_upload" } },
  meta: { editable: true },
};
const stubs = {
  "./SplitWorkspace": dataModule("export function SplitWorkspace(){return null;} export function useRightPaneSlot(){return null;}"),
  "./ResultCanvas": dataModule("export function ResultCanvas(){return null;}"),
  "./WorkspaceSession": dataModule("export function WorkspaceSessionProvider({children}){return children;}"),
  "./workspace-session-context": dataModule("export function useOptionalWorkspaceSession(){return null;}"),
  "./workbench-routes": dataModule("export function editorCapabilityFor(item){return {available:item?.meta?.editable===true};}"),
  "../i18n/ui/useUI": dataModule("export function useUI(){return (s)=>s;}"),
  "./artifact-client": dataModule(`export async function getArtifactItem(){return {ok:true,data:${JSON.stringify(image)}};}`),
};
const openerUrl = await compileModule("src/shell/task-attachment-open.ts", stubs);
const { useTaskAttachmentOpener, immediateTaskAttachment, resolveTaskAttachment } = await import(/* @vite-ignore */ openerUrl);
const linkUrl = await compileModule("src/shell/task-attachment-library-link.tsx", stubs);
const { TaskAttachmentLibraryLink } = await import(/* @vite-ignore */ linkUrl);
const stripUrl = await compileModule("src/shell/AttachmentStrip.tsx", {
  ...stubs,
  "./WorkspaceLibrary": dataModule("export function WorkspaceLibrary(){return null;}"),
  "../lib/attachment-url": dataModule("export function useAttachmentDisplayUrl(){return undefined;}"),
});
const { AttachmentStrip } = await import(/* @vite-ignore */ stripUrl);

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
});
async function render(element) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(element));
  return { container, root };
}
async function opener() {
  const shown = [];
  const library = [];
  let open;
  function Host() {
    open = useTaskAttachmentOpener("oceanleo", (target) => shown.push(target), (action) => library.push(action));
    return null;
  }
  await render(React.createElement(Host));
  return { open, shown, library };
}

describe("W13 image attachment clicks", () => {
  test.each([
    ["input before upload", { id: "local", name: "shot.png", mime: "image/png", previewUrl: "blob:https://oceanbizs.com/local" }, false],
    ["upload completed", { id: "uploaded", name: "shot.png", mime: "image/png", libraryItem: image }, true],
    ["sent private reference", { url: "", name: "shot.png", media_type: "image", artifact_id: ART, revision_id: REV }, true],
  ])("%s opens the image preview and only offers Library as an extra action", async (_state, attachment, hasLibrary) => {
    const { open, shown, library } = await opener();
    expect(await open(attachment)).toBe(true);
    expect(library).toEqual([]);
    expect(shown).toHaveLength(1);
    expect(shown[0].mode).toBe("preview");
    expect(shown[0].item.kind).toBe("image");
    const { container } = await render(React.createElement(TaskAttachmentLibraryLink, { item: shown[0].item }));
    const button = container.querySelector("[data-task-attachment-library-link]");
    expect(Boolean(button)).toBe(hasLibrary);
    if (button) {
      expect(button.textContent).toBe("在 Library 中查看");
      await act(async () => button.click());
      expect(library).toEqual([{ version: 1, tab: "mine", itemId: ART, intent: "open", category: "images", filter: "uploaded" }]);
    }
  });

  test("uploading image tile has no preview click target and the opener rejects it", async () => {
    const attachment = { id: "inflight", name: "shot.png", mime: "image/png", previewUrl: "blob:https://oceanbizs.com/inflight", uploading: true };
    const { open, shown, library } = await opener();
    const { container } = await render(React.createElement(AttachmentStrip, { attachments: [attachment], onOpenAttachment: open }));
    const tile = container.querySelector('[data-upload-tile="uploading"]');
    expect(Boolean(tile)).toBe(true);
    const button = tile.querySelector('button[aria-label="shot.png"]');
    expect(Boolean(button)).toBe(false);
    expect(await open(attachment)).toBe(false);
    expect(shown).toEqual([]);
    expect(library).toEqual([]);
  });

  test("image preview mode also applies when a private Library read falls back to a rendition", async () => {
    const target = await resolveTaskAttachment(
      { url: "", name: "shot.png", mime: "image/png", artifact_id: ART, revision_id: REV },
      "oceanleo",
      { loadLibraryItem: async () => null, resolveUrl: async (_ref, purpose) => {
        expect(purpose).toBe("preview");
        return "https://api.example/v1/artifact-renditions/access/image";
      } },
    );
    expect(target.mode).toBe("preview");
    expect(target.item.artifactId).toBe(ART);
    expect(target.item.revisionId).toBe(REV);
    expect(immediateTaskAttachment({ id: "typed", libraryItem: image }).mode).toBe("preview");
  });

  test("Library-picked images retain their existing category without the uploaded filter", async () => {
    const { open, shown, library } = await opener();
    const picked = { ...image, artifact: { ...image.artifact, roles: [], provenance: { sourceKind: "generated" } } };
    await open({ id: "picked", libraryItem: picked });
    const { container } = await render(React.createElement(TaskAttachmentLibraryLink, { item: shown[0].item }));
    await act(async () => container.querySelector("button").click());
    expect(library[0].filter).toBeUndefined();
    expect(library[0].itemId).toBe(ART);
    expect(shown[0].item.meta).toBe(image.meta);
    expect(JSON.stringify(shown[0].item)).toBe(JSON.stringify(picked));
  });

  test.each([
    ["report.pdf", "application/pdf", "pdf"],
    ["notes.md", "text/markdown", "documents"],
    ["plan.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "documents"],
    ["sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "spreadsheets"],
    ["deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "presentations"],
    ["clip.mp4", "video/mp4", "videos"],
    ["memo.mp3", "audio/mpeg", "audio"],
    ["bundle.zip", "application/zip", undefined],
  ])("non-image %s keeps its Library destination", async (name, mime, category) => {
    const { open, shown, library } = await opener();
    expect(await open({ url: "", name, mime, artifact_id: ART, revision_id: REV })).toBe(true);
    expect(shown).toEqual([]);
    expect(library[0].itemId).toBe(ART);
    expect(library[0].category).toBe(category);
  });

  test("uploading non-images remain non-clickable; native image archives preview", async () => {
    const { container } = await render(React.createElement(AttachmentStrip, {
      attachments: [{ id: "pdf", name: "report.pdf", mime: "application/pdf", uploading: true }],
      onOpenAttachment: () => { throw new Error("uploading document must not open"); },
    }));
    expect(Boolean(container.querySelector("button"))).toBe(false);
    const target = await resolveTaskAttachment(
      { url: "", name: "shot.png", native_archive: { download_path: ROUTE, artifact_id: ART, mime: "image/png" } },
      "oceanleo", { loadNativeArchive: async () => "blob:https://oceanbizs.com/native" },
    );
    expect(target.item.kind).toBe("image");
    expect(target.mode).toBe("preview");
  });
});
