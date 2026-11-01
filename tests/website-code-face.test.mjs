import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  WEBSITE_PROJECT_SCHEMA,
  websiteCodeProjectFromText,
} from "../src/shell/website-platform/website-code-project.ts";
import { websitePreviewFrameUrl } from "../src/lib/website-platform-api.ts";

const route = readFileSync(new URL("../src/shell/advanced-routes/WebsiteLocalRoute.tsx", import.meta.url), "utf8");
const panels = readFileSync(new URL("../src/shell/website-platform/WebsiteWorkbenchPanels.tsx", import.meta.url), "utf8");
const face = readFileSync(new URL("../src/shell/website-platform/WebsiteCodeFace.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/website-platform-api.ts", import.meta.url), "utf8");

// The Library entry the create flow registers (backend artifact_materialize
// `_prepare_website_artifact_package`): a git/code project manifest.
const createFlowEntry = JSON.stringify({
  schema: "website-source@1",
  projectSchema: WEBSITE_PROJECT_SCHEMA,
  sourceFormat: "website-source@1",
  projectId: "f75afb8a-954f-40bb-8bf8-d87689aefd50",
  projectRevisionId: "877db68f-01bd-4fb4-84c0-0f2d529f759c",
  sourceTreeSha256: "a".repeat(64),
  pages: [{ id: "home", path: "/", sourcePath: "index.html" }],
  sections: [{ id: "source-tree", type: "source-tree", fileCount: 3 }],
  files: [
    { path: "README.md", sha256: "b".repeat(64), byteSize: 10, mediaType: "text/markdown", fileMode: 33188, binary: false },
    { path: "index.html", sha256: "c".repeat(64), byteSize: 10, mediaType: "text/html", fileMode: 33188, binary: false },
    { path: "styles.css", sha256: "d".repeat(64), byteSize: 10, mediaType: "text/css", fileMode: 33188, binary: false },
  ],
});

test("a create-flow website is recognised as a code project, not a visual website-source", () => {
  const code = websiteCodeProjectFromText(createFlowEntry);
  assert.deepEqual(code, {
    projectId: "f75afb8a-954f-40bb-8bf8-d87689aefd50",
    fileCount: 3,
    entryPath: "index.html",
  });
  // Visual site documents and junk stay on the visual path.
  assert.equal(websiteCodeProjectFromText(JSON.stringify({ format: "website-source", pages: [] })), null);
  assert.equal(websiteCodeProjectFromText("not json " + WEBSITE_PROJECT_SCHEMA), null);
  assert.equal(
    websiteCodeProjectFromText(createFlowEntry.replace("f75afb8a-954f-40bb-8bf8-d87689aefd50", "../x")),
    null,
  );
});

test("the editor opens code websites on the code face before any §3.1 failure is shown", () => {
  const detect = route.indexOf("websiteCodeProjectFromText(entryText)");
  const envelope = route.indexOf("websiteSiteEnvelopeFromText(entryText)");
  const error = route.indexOf("setRemoteError(result.error)");
  assert.ok(detect > 0 && detect < envelope && envelope < error, "code detection runs before the visual fallbacks and the error");
  assert.match(route, /<WebsiteCodeFace projectId=\{codeProjectId\} \/>/);
  for (const page of ["history", "publish", "database", "storage", "dashboard", "settings"]) {
    assert.match(route, new RegExp(`\\["${page}", "`));
  }
  // Source + preview side by side, both the shared panels.
  assert.match(face, /panel="code"/);
  assert.match(face, /panel="preview"/);
  assert.match(face, /onCommit=/);
});

test("the preview pane frames only the public user-content host and always offers a new tab", () => {
  assert.equal(
    websitePreviewFrameUrl({ tier: "static", url: "https://s-6bca2bf5a18f7e3496c98d1a101f4822.ws.oceanleo.app" }),
    "https://s-6bca2bf5a18f7e3496c98d1a101f4822.ws.oceanleo.app/",
  );
  assert.equal(
    websitePreviewFrameUrl({ tier: "sandbox", url: "https://p3300-b8cde193f6ea02a314b6e432d160eb71.ws.oceanleo.app" }),
    "https://p3300-b8cde193f6ea02a314b6e432d160eb71.ws.oceanleo.app/",
  );
  // The authenticated API route cannot be framed (no bearer header in an iframe).
  assert.equal(
    websitePreviewFrameUrl({ url: "https://api.oceanbizs.com/v1/website-projects/p/preview/static/c/index.html" }),
    "",
  );
  assert.equal(websitePreviewFrameUrl({ url: "p3300-b8cde193f6ea02a314b6e432d160eb71.ws.oceanleo.app" }), "");
  assert.equal(websitePreviewFrameUrl({ url: "http://s-1.ws.oceanleo.app" }), "");
  assert.equal(websitePreviewFrameUrl({ url: "https://evil-oceanleo.app" }), "");

  assert.doesNotMatch(panels, /websiteStaticPreviewUrl/);
  assert.doesNotMatch(api, /export function websiteStaticPreviewUrl/);
  assert.match(panels, /在新标签页打开预览/);
  assert.match(panels, /target="_blank"/);
  assert.match(panels, /rel="noopener noreferrer"/);
  // One preview route for every stack.
  assert.match(api, /\/preview`,\n\s+\{ method: "POST"/);
  assert.doesNotMatch(api, /\/sessions`/);
});

test("files stored as base64 still open as text in the code editor", async () => {
  const { websiteFileText } = await import("../src/lib/website-platform-api.ts");
  const html = "<h1>蓝色海洋</h1>";
  const b64 = Buffer.from(html, "utf8").toString("base64");
  assert.deepEqual(websiteFileText({ path: "index.html", content_base64: b64, is_binary: true }), { text: html, binary: false });
  assert.deepEqual(websiteFileText({ path: "index.html", content: "x" }), { text: "x", binary: false });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]).toString("base64");
  assert.deepEqual(websiteFileText({ path: "logo.png", content_base64: png }), { text: "", binary: true });
  assert.match(panels, /websiteFileText\(file\)/);
});
