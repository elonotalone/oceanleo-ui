import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { startW10HarnessServer } from "./w10-harness/serve.mjs";
import { parseDesignDocument } from "./w10-harness/design-canvas-session.mjs";
import { validateDesignDocumentProject } from "../src/shell/image-editor/design-document-schema.ts";
import {
  hostOpenMessage,
  hostSaveAckMessage,
} from "/root/projects/oceanleo-app/editor-runtime/protocol/editor-session-v1.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "w10-harness/design-document.blank.v1.json");
const EVIDENCE_DIR =
  "/root/projects/oceanleo-app/docs/react-client-rebuild/evidence/W10/design-canvas";
const SAVED = join(EVIDENCE_DIR, "design-document.saved.v1.json");
const REOPENED = join(EVIDENCE_DIR, "design-document.reopened.v1.json");
const EXPORT_PNG = join(EVIDENCE_DIR, "design-canvas.export.png");
const EVIDENCE = join(EVIDENCE_DIR, "offline.json");
const PLAYWRIGHT = join(HERE, "../node_modules/playwright-core/index.mjs");

const ATTACK_TEXT =
  '标题<script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">';
const EDITED_TEXT = "离线改过的设计标题 · W10";

async function launchPage(origin) {
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const blocked = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      blocked.push(url);
      await route.abort();
      return;
    }
    const local = parsed.hostname === "127.0.0.1" && parsed.origin === origin;
    if (!local) {
      blocked.push(url);
      await route.abort();
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  await page.goto(`${origin}/w10-harness/design-canvas.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => window.__oceanleoReady === true, null, {
    timeout: 15_000,
  });
  return { browser, page, blocked };
}

function pngMagic(bytes) {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

test("blank design-document.v1 fixture passes the carrier schema", async () => {
  const fixture = JSON.parse(await readFile(FIXTURE, "utf8"));
  const validation = validateDesignDocumentProject(fixture);
  assert.equal(validation.ok, true, JSON.stringify(validation.ok ? [] : validation.errors));
  assert.equal(fixture.document.elements.length, 20);
});

test("design-canvas load/mutate/undo/save/reopen/export while remote sites are blocked", {
  timeout: 120_000,
}, async (t) => {
  const hosted = await startW10HarnessServer();
  t.after(() => hosted.close());
  const fixture = JSON.parse(await readFile(FIXTURE, "utf8"));
  const first = await launchPage(hosted.origin);
  const { browser, page, blocked } = first;
  t.after(() => browser.close());

  const opened = await page.evaluate(
    ({ message }) => window.__oceanleoEditor.open(message),
    {
      message: hostOpenMessage({
        sessionId: "sess-design-offline",
        documentId: "doc-design-offline",
        schema: "oceanleo.design-document.v1",
        revision: "rev-0",
        payload: fixture,
        origin: hosted.origin,
      }),
    },
  );
  assert.equal(opened.objectCount, 20);
  assert.equal(opened.title, "本地设计稿 W10");

  await page.evaluate((text) => window.__oceanleoEditor.setTitle(text), ATTACK_TEXT);
  const afterAttack = await page.evaluate(() => window.__oceanleoEditor.getState());
  assert.equal(afterAttack.title, ATTACK_TEXT);
  assert.equal(
    await page.evaluate(() => window.__pwned),
    undefined,
    "user HTML in a text object must not run in the trusted editor",
  );

  await page.evaluate((text) => window.__oceanleoEditor.setTitle(text), EDITED_TEXT);
  const edited = await page.evaluate(() => window.__oceanleoEditor.getState());
  assert.equal(edited.title, EDITED_TEXT);
  assert.equal(edited.dirty, true);

  await page.evaluate(() => window.__oceanleoEditor.undo());
  const undone = await page.evaluate(() => window.__oceanleoEditor.getState());
  assert.equal(undone.title, ATTACK_TEXT);
  await page.evaluate(() => window.__oceanleoEditor.redo());
  const redone = await page.evaluate(() => window.__oceanleoEditor.getState());
  assert.equal(redone.title, EDITED_TEXT);

  const remoteProbe = await page.evaluate(async () => {
    const targets = [
      "https://oceanleo.com/",
      "https://slides.oceanleo.app/",
      "https://design.oceanleo.com/embed/editor",
    ];
    const results = [];
    for (const url of targets) {
      try {
        await fetch(url, { mode: "no-cors" });
        results.push({ url, reached: true });
      } catch (error) {
        results.push({
          url,
          reached: false,
          error: String(error && error.message),
        });
      }
    }
    return results;
  });
  assert.ok(
    remoteProbe.every((row) => row.reached === false),
    `remote sites must stay blocked: ${JSON.stringify(remoteProbe)}`,
  );

  const saveMessage = await page.evaluate(
    (requestId) => window.__oceanleoEditor.requestSave(requestId),
    "save-1",
  );
  assert.equal(saveMessage.type, "save");
  const savedProject = parseDesignDocument(saveMessage.payload);
  assert.ok(savedProject);
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(SAVED, JSON.stringify(savedProject, null, 2));

  const acked = await page.evaluate(
    ({ message }) => window.__oceanleoEditor.ackSave(message),
    {
      message: hostSaveAckMessage({
        sessionId: "sess-design-offline",
        requestId: "save-1",
        revision: "rev-1",
        origin: hosted.origin,
      }),
    },
  );
  assert.equal(acked.dirty, false);
  assert.equal(acked.confirmedRevision, "rev-1");

  const dataUrl = await page.evaluate(() => window.__oceanleoEditor.exportPng());
  assert.match(dataUrl, /^data:image\/png;base64,/);
  const png = Buffer.from(dataUrl.split(",")[1], "base64");
  assert.equal(pngMagic(png), true);
  await writeFile(EXPORT_PNG, png);

  await browser.close();

  const second = await launchPage(hosted.origin);
  const { browser: browser2, page: page2, blocked: blocked2 } = second;
  t.after(() => browser2.close());
  const disk = JSON.parse(await readFile(SAVED, "utf8"));
  const reopened = await page2.evaluate(
    ({ message }) => window.__oceanleoEditor.open(message),
    {
      message: hostOpenMessage({
        sessionId: "sess-design-reopen",
        documentId: "doc-design-offline",
        schema: "oceanleo.design-document.v1",
        revision: "rev-1",
        payload: disk,
        origin: hosted.origin,
      }),
    },
  );
  assert.equal(reopened.title, EDITED_TEXT);
  assert.equal(reopened.objectCount, 20);
  await writeFile(REOPENED, JSON.stringify(reopened.project, null, 2));

  const evidence = {
    editorId: "design-canvas",
    core: "fabric@6.9.1",
    protocol: "oceanleo.editor-session.v1",
    schema: "oceanleo.design-document.v1",
    origin: hosted.origin,
    load: { revision: "rev-0", objectCount: 20 },
    mutate: { title: EDITED_TEXT, userScriptExecuted: false },
    undoRedo: { undoneTitle: ATTACK_TEXT, redoneTitle: EDITED_TEXT },
    save: { path: SAVED, revision: "rev-1", dirtyAfterAck: false },
    reopen: { path: REOPENED, title: reopened.title, objectCount: reopened.objectCount },
    export: { path: EXPORT_PNG, bytes: png.length, pngMagic: true },
    remoteBlocked: [
      ...new Set([...blocked, ...blocked2, ...remoteProbe.map((row) => row.url)]),
    ],
    remoteProbe,
  };
  await writeFile(EVIDENCE, JSON.stringify(evidence, null, 2));
  assert.ok(evidence.export.pngMagic);
});
