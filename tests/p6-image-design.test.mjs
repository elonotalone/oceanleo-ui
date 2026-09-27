import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  persistPhotopeaDocument,
  toPhotopeaDocumentRef,
} from "../src/shell/advanced-routes/image-pro-handoff.ts";
import { photopeaFrameSandbox } from "../src/shell/image-editor/photopea-mount.ts";
import { UNTRUSTED_FRAME_SANDBOX } from "../src/shell/editor-sandbox-origin.ts";

const route = readFileSync("src/shell/advanced-routes/ImageRoute.tsx", "utf8");
const session = readFileSync("src/shell/image-editor/photopea-session.ts", "utf8");
const handoff = readFileSync("src/shell/advanced-routes/image-pro-handoff.ts", "utf8");
const embedded = readFileSync("src/shell/advanced-routes/EmbeddedRoute.tsx", "utf8");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
  "base64",
);
const bytes = () => Uint8Array.from(png).buffer;
const item = {
  id: "image-p6",
  key: "artifact:image-p6",
  source: "artifact",
  title: "原图",
  kind: "image",
  siteId: "image",
  favorite: false,
  artifactId: "image-p6",
  revisionId: "r1",
  artifactType: "single_file_image",
  artifact: {
    artifactId: "image-p6",
    revisionId: "r1",
    artifactType: "single_file_image",
  },
  meta: {},
  url: "https://cdn.example/image.png",
};
const source = `data:image/png;base64,${png.toString("base64")}`;
const receipt = {
  ok: true,
  item: { ...item, revisionId: "r2" },
  url: "https://cdn.example/new.png",
  artifactId: "image-p6",
  revisionId: "r2",
};

test("切面立刻切走，flush 失败也不锁人、不另写专业面失败文案", () => {
  const start = route.indexOf("  const setEditorMode = useCallback(");
  const end = route.indexOf("\n\n  /**", start);
  const modeSwitch = route.slice(start, end);
  assert.match(modeSwitch, /setPluginModeState\("normal"\)/);
  assert.match(modeSwitch, /saveBeforeNewConversation\(\)/);
  assert.equal(/await photopeaSession\.leave\(/.test(modeSwitch), false);
  assert.equal(/setImportNotice\(/.test(modeSwitch.split('next === "normal"')[1] || ""), false);
  assert.equal(route.includes("专业编辑还没确认保存"), false);
  assert.equal(/status:\s*\n\s*\(showPhotopea \? photopeaStatus\.message/.test(route), false);
});

test("同一条 flush：专业面活着就写 Photopea，云朵 confirmation 可留", () => {
  assert.match(route, /flush: saveBeforeNewConversation/);
  assert.match(route, /if \(showPhotopea \|\| photopeaSession\.active\(\)\)/);
  assert.match(route, /bindProFaceHandoff\(/);
  assert.match(route, /confirmation: photopeaCloud/);
  assert.match(route, /autoSave: !photopeaCloud/);
  assert.match(session, /active: \(\) => Boolean\(frame && !disposed\)/);
});

test("相同字节不新版本；保存仍是同一条 single_file_image", async () => {
  const ref = await toPhotopeaDocumentRef(source);
  let calls = 0;
  const first = await persistPhotopeaDocument({
    item,
    siteId: "image",
    bytes: bytes(),
    confirmedDigest: ref.digest,
    save: async () => {
      calls += 1;
      return receipt;
    },
  });
  assert.equal(calls, 0);
  assert.equal(first.ok, true);
  assert.equal(first.unchanged, true);
  assert.equal(first.item.revisionId, "r1");

  const args = [];
  const saved = await persistPhotopeaDocument({
    item,
    siteId: "image",
    bytes: bytes(),
    save: async (input) => {
      args.push(input);
      return receipt;
    },
  });
  assert.equal(saved.ok, true);
  assert.equal(args[0].title, "原图");
  assert.equal(args[0].item.artifactId, "image-p6");
  assert.equal(args[0].artifactRevision.artifactType, "single_file_image");
  assert.equal(String(args[0].title).includes("编辑版"), false);

  const again = await persistPhotopeaDocument({
    item: saved.item,
    siteId: "image",
    bytes: bytes(),
    confirmedDigest: saved.digest,
    save: async () => {
      calls += 1;
      return receipt;
    },
  });
  assert.equal(calls, 0);
  assert.equal(again.unchanged, true);
});

test("UC-3 / UC-6：Photopea 仍是不可信沙箱，收信仍校验 origin+source", () => {
  assert.equal(photopeaFrameSandbox(), UNTRUSTED_FRAME_SANDBOX);
  assert.equal(photopeaFrameSandbox().includes("allow-same-origin"), false);
  assert.match(session, /setAttribute\("sandbox", photopeaFrameSandbox\(\)\)/);
  assert.match(session, /isPhotopeaFrameSource\(event, frame\?\.contentWindow\)/);
  assert.match(session, /postToPhotopea\(frame.contentWindow,[\s\S]*?PHOTOPEA_ORIGIN\)/);
  assert.equal(/postMessage\([^,]+,\s*["']\*["']\)/.test(session), false);
  assert.match(handoff, /saveToOE\("png"\)/);
});

test("设计 canvas 一份工作文档 schema；website 不假装有第二套专业保存", () => {
  assert.match(embedded, /DESIGN_CANVAS_WORKING_SCHEMA = "oceanleo\.design\.canvas\.v1"/);
  assert.match(embedded, /draftSchema:\s*\n\s*hostedMediaType === "canvas"\s*\n\s*\? DESIGN_CANVAS_WORKING_SCHEMA/);
  assert.equal(/oceanleo\.design\.canvas\.pro\.v1|oceanleo\.design\.edit\.v1/.test(embedded), false);
  assert.match(embedded, /autoSave: hostedMediaType !== "website"/);
  assert.match(embedded, /Pro mode uses this same flush\. Do not add a second confirmation/);
  assert.equal(/confirmation:\s*\{/.test(embedded), false);
  assert.match(embedded, /Switching never waits on a save/);
});
