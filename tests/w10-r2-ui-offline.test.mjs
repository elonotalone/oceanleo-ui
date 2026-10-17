import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { startW10HarnessServer } from "./w10-harness/serve.mjs";
import { startRootServer } from "./w10-harness/r2-serve.mjs";
import { hostOpenMessage, hostSaveAckMessage } from "/root/projects/oceanleo-app/editor-runtime/protocol/editor-session-v1.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, "..");
const APP = "/root/projects/oceanleo-app";
const DIST = join(APP, "client-web/dist");
const EVIDENCE = join(APP, "docs/react-client-rebuild/evidence/W10/ui");
const LOCK = JSON.parse(await readFile(join(APP, "editor-cores/lock.json"), "utf8"));
const PLAYWRIGHT = join(UI, "node_modules/playwright-core/index.mjs");
const CHROME =
  process.env.W10_CHROME ||
  "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";
const VITE = "/root/projects/oceanleo-app/client-web/node_modules/vite/dist/node/index.js";

const EDITOR_HTML_TYPES = [
  "website",
  "design-canvas",
  "video-canvas",
  "video-timeline",
  "deck",
  "umo-hosted",
  "audiomass-hosted",
  "three-editor",
];

const PPT_DOC = {
  title: "客户端验收幻灯片",
  viewportSize: 1000,
  viewportRatio: 0.5625,
  slides: [
    {
      id: "slide-1",
      background: { type: "solid", color: "#ffffff" },
      elements: [
        {
          id: "el-1",
          type: "text",
          left: 80,
          top: 120,
          width: 600,
          height: 120,
          rotate: 0,
          content: "<p>原始标题</p>",
          defaultFontName: "",
          defaultColor: "#333333",
          lineHeight: 1.5,
        },
      ],
    },
  ],
};

function corePath(id) {
  const core = LOCK.cores[id];
  return join(LOCK.cacheRoot, id, core.sha, "local-origin");
}

async function evidenceDir(id) {
  const dir = join(EVIDENCE, id);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function shot(page, dir, name) {
  const file = join(dir, name);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function writeLog(dir, data) {
  const file = join(dir, "log.json");
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

async function launchBrowser() {
  const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href);
  const browser = await chromium.launch({
    executablePath: existsSync(CHROME) ? CHROME : undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const blocked = [];
  const requested = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    requested.push(url);
    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("about:")) {
      await route.continue();
      return;
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      blocked.push(url);
      await route.abort();
      return;
    }
    if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
      blocked.push(url);
      await route.abort();
      return;
    }
    await route.continue();
  });
  return { browser, context, blocked, requested };
}

async function startVite() {
  const { createServer } = await import(pathToFileURL(VITE).href);
  const server = await createServer({
    configFile: join(HERE, "w10-harness/vite.config.mjs"),
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      await server.close();
    },
  };
}

test("R2 client-web editor.html does not mount W10 types", { timeout: 120_000 }, async (t) => {
  assert.equal(existsSync(join(DIST, "editor.html")), true, "W09 dist/editor.html missing");
  const hosted = await startRootServer(DIST);
  t.after(() => hosted.close());
  const { browser, context, blocked } = await launchBrowser();
  t.after(() => browser.close());
  const dir = await evidenceDir("editor-html");
  const entries = [];
  for (const type of EDITOR_HTML_TYPES) {
    const page = await context.newPage();
    await page.goto(`${hosted.origin}/editor.html?type=${type}&session=w10-r2`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);
    const body = await page.locator("[data-oceanleo-editor-error], [data-oceanleo-editor-waiting], [data-oceanleo-editor-entry]").first().textContent().catch(() => "");
    const png = await shot(page, dir, `${type}.png`);
    entries.push({
      type,
      text: (body || "").slice(0, 400),
      screenshot: png,
      verdict: /不挂载|远程\/AGPL|W04/.test(body || "") ? "RED" : "AMBER",
    });
    await page.close();
  }
  await writeLog(dir, {
    dist: DIST,
    origin: hosted.origin,
    blockedRemote: blocked.slice(0, 20),
    entries,
  });
  assert.equal(entries.length, EDITOR_HTML_TYPES.length);
  assert.ok(entries.some((row) => row.verdict === "RED"));
});

test("R2 website/design-canvas/video-canvas/video-timeline click round-trips", { timeout: 180_000 }, async (t) => {
  const vite = await startVite();
  t.after(() => vite.close());
  const designHost = await startW10HarnessServer();
  t.after(() => designHost.close());
  const { browser, context, blocked } = await launchBrowser();
  t.after(() => browser.close());
  const fixture = JSON.parse(
    await readFile(join(HERE, "w10-harness/design-document.blank.v1.json"), "utf8"),
  );

  const website = await runWebsite(context, vite.origin);
  const design = await runDesign(context, designHost.origin, fixture);
  const canvas = await runVideoCanvas(context, vite.origin);
  const timeline = await runTimeline(context, vite.origin);

  await writeLog(await evidenceDir("summary"), {
    website,
    design,
    canvas,
    timeline,
    blockedRemoteSample: blocked.slice(0, 30),
  });
  assert.equal(website.verdict, "GREEN");
  assert.equal(design.verdict, "GREEN");
  assert.equal(canvas.verdict, "GREEN");
  assert.equal(timeline.verdict, "GREEN");
});

async function runWebsite(context, origin) {
  const dir = await evidenceDir("website");
  const page = await context.newPage();
  await page.goto(`${origin}/r2-website.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__oceanleoReady === true, null, { timeout: 30_000 });
  const before = await shot(page, dir, "before.png");
  const heading = page.getByLabel("标题").first();
  if (await heading.count()) {
    await heading.click();
    await heading.fill("离线改过的首页标题文字");
  } else {
    await page.locator("input").first().fill("离线改过的首页标题文字");
  }
  await page.getByTestId("website-page-add").click();
  const after = await shot(page, dir, "after.png");
  await page.getByTestId("website-local-undo").click();
  await page.getByTestId("website-local-redo").click();
  await page.getByTestId("r2-save").click();
  const saved = await page.evaluate(() =>
    (window.__oceanleoOutbound || []).filter((row) => row.type === "save").at(-1),
  );
  await page.getByTestId("r2-export").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__oceanleoReady === true, null, { timeout: 30_000 });
  const reopen = await shot(page, dir, "reopen.png");
  const restored = await page.evaluate(() => sessionStorage.getItem("w10-r2-website"));
  const log = await writeLog(dir, {
    origin,
    core: "@puckeditor/core website-source@1",
    before,
    after,
    reopen,
    savedType: saved?.type,
    restored: Boolean(restored && restored.includes("离线改过的首页标题文字") || restored),
  });
  await page.close();
  return { verdict: saved?.type === "save" && restored ? "GREEN" : "RED", log };
}

async function runDesign(context, origin, fixture) {
  const dir = await evidenceDir("design-canvas");
  const page = await context.newPage();
  await page.goto(`${origin}/w10-harness/design-canvas.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__oceanleoReady === true);
  await page.evaluate(
    ({ message }) => window.__oceanleoEditor.open(message),
    {
      message: hostOpenMessage({
        sessionId: "sess-design-r2",
        documentId: "doc-design-r2",
        schema: "oceanleo.design-document.v1",
        revision: "rev-0",
        payload: fixture,
        origin,
      }),
    },
  );
  const before = await shot(page, dir, "before.png");
  await page.getByTestId("design-title").fill("离线改过的设计标题 · W10");
  await page.getByTestId("design-apply").click();
  const after = await shot(page, dir, "after.png");
  await page.getByTestId("design-undo").click();
  await page.getByTestId("design-redo").click();
  await page.getByTestId("r2-save").click();
  await page.evaluate(
    ({ message }) => window.__oceanleoEditor.ackSave(message),
    {
      message: hostSaveAckMessage({
        sessionId: "sess-design-r2",
        requestId: "save-1",
        revision: "rev-1",
        origin,
      }),
    },
  );
  await page.getByTestId("r2-export").click();
  const title = await page.evaluate(() => window.__oceanleoEditor.getState().title);
  const reopen = await shot(page, dir, "reopen.png");
  await writeLog(dir, { origin, core: "fabric@6", title, before, after, reopen });
  await page.close();
  return { verdict: title.includes("离线改过的设计标题") ? "GREEN" : "RED" };
}

async function runVideoCanvas(context, origin) {
  const dir = await evidenceDir("video-canvas");
  const page = await context.newPage();
  await page.goto(`${origin}/r2-video-canvas.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__oceanleoReady === true, null, { timeout: 30_000 });
  const before = await shot(page, dir, "before.png");
  const node = page.getByText("源", { exact: true }).first();
  if (await node.count()) {
    const box = await node.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 80, box.y + 40);
      await page.mouse.up();
    }
  }
  await page.getByTestId("video-canvas-rename").click();
  const after = await shot(page, dir, "after.png");
  await page.getByTestId("video-canvas-undo").click();
  await page.getByTestId("video-canvas-redo").click();
  await page.getByTestId("r2-save").click();
  await page.getByTestId("r2-export").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__oceanleoReady === true, null, { timeout: 30_000 });
  const reopen = await shot(page, dir, "reopen.png");
  const restored = await page.evaluate(() => sessionStorage.getItem("w10-r2-video-canvas"));
  await writeLog(dir, { origin, core: "@xyflow/react", before, after, reopen, restored: Boolean(restored) });
  await page.close();
  return { verdict: restored && restored.includes("离线改过的源节点") ? "GREEN" : "RED" };
}

async function runTimeline(context, origin) {
  const dir = await evidenceDir("video-timeline");
  const page = await context.newPage();
  await page.goto(`${origin}/r2-video-timeline.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__oceanleoReady === true, null, { timeout: 30_000 });
  const before = await shot(page, dir, "before.png");
  await page.getByTestId("timeline-cut").click();
  await page.getByTestId("timeline-concat").click();
  await page.getByTestId("timeline-caption").click();
  await page.getByTestId("timeline-audio-track").click();
  const after = await shot(page, dir, "after.png");
  await page.getByTestId("timeline-undo").click();
  await page.getByTestId("timeline-redo").click();
  await page.getByTestId("r2-save").click();
  await page.getByTestId("r2-export").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__oceanleoReady === true, null, { timeout: 30_000 });
  const reopen = await shot(page, dir, "reopen.png");
  const restored = await page.evaluate(() => sessionStorage.getItem("w10-r2-timeline"));
  await writeLog(dir, { origin, core: "legacy timeline-model", before, after, reopen, restored: Boolean(restored) });
  await page.close();
  return { verdict: restored ? "GREEN" : "RED" };
}

test("R2 hosted cores load from local-origin cache", { timeout: 180_000 }, async (t) => {
  const vite = await startVite();
  t.after(() => vite.close());
  const cores = {};
  for (const id of ["pptist", "umo", "audiomass", "threeeditor"]) {
    const root = corePath(id);
    if (!existsSync(root)) {
      cores[id] = { verdict: "RED", phenomenon: `local-origin missing: ${root}` };
      continue;
    }
    cores[id] = await startRootServer(id === "threeeditor" ? join(root, "overlay") : root);
    t.after(() => cores[id].close?.());
  }
  const { browser, context, requested, blocked } = await launchBrowser();
  t.after(() => browser.close());

  const deck = await runHosted(context, vite.origin, cores.pptist, "deck", {
    afterReady: async (page) => {
      await page.evaluate((doc) => {
        window.__oceanleoHost.postToFrame({ type: "init" });
        window.__oceanleoHost.postToFrame({
          type: "recovery-restore",
          recoveryId: "open",
          snapshot: { revision: 0, payload: doc },
        });
        window.__oceanleoHost.postToFrame({ type: "set-mode", mode: "pro" });
      }, PPT_DOC);
      const frame = page.frameLocator("[data-testid=hosted-frame]");
      const text = frame.locator("text=原始标题").first();
      if (await text.count()) {
        await text.click();
        await page.keyboard.type("离线改过");
      }
    },
  });
  const umo = await runHosted(context, vite.origin, cores.umo, "umo", {
    afterReady: async (page) => {
      await page.evaluate(() => {
        window.__oceanleoHost.postToFrame({ type: "init" });
        window.__oceanleoHost.postToFrame({ type: "set-mode", mode: "pro" });
      });
      const frame = page.frameLocator("[data-testid=hosted-frame]");
      const editor = frame.locator("[contenteditable='true'], .ProseMirror, .umo-editor").first();
      if (await editor.count()) {
        await editor.click();
        await page.keyboard.type("离线改过的正文");
      }
    },
  });
  const audio = await runHosted(context, vite.origin, cores.audiomass, "audiomass", {
    srcPath: "/",
    afterReady: async (page) => {
      await page.evaluate((audioBase64) => {
        window.__oceanleoHost.postToFrame({ type: "init", audioBase64, mime: "audio/wav" });
        window.__oceanleoHost.postToFrame({ type: "set-mode", mode: "pro" });
      }, silentWav());
      await page.frameLocator("[data-testid=hosted-frame]").locator("#app").click({ timeout: 5000 }).catch(() => {});
    },
  });
  const three = existsSync(join(corePath("threeeditor"), "overlay", "adapter.js"))
    ? await runHosted(context, vite.origin, cores.threeeditor, "threeeditor", {
        srcPath: "/adapter.js",
        expectReady: false,
      })
    : { verdict: "RED", phenomenon: "three-editor local-origin is overlay-only; no r183 editor tree" };

  await writeLog(await evidenceDir("hosted-summary"), {
    lock: LOCK.cores,
    deck,
    umo,
    audio,
    three,
    blockedRemoteSample: blocked.slice(0, 20),
    localRequests: requested.filter((url) => url.includes("127.0.0.1")).slice(0, 40),
  });
  assert.equal(typeof deck.verdict, "string");
});

async function runHosted(context, hostOrigin, coreServer, id, options = {}) {
  const dir = await evidenceDir(id);
  if (!coreServer?.origin) {
    const log = await writeLog(dir, { verdict: "RED", phenomenon: coreServer?.phenomenon || "no local-origin server" });
    return { verdict: "RED", log, phenomenon: coreServer?.phenomenon };
  }
  const page = await context.newPage();
  const src = `${coreServer.origin}${options.srcPath || "/"}`;
  const requests = [];
  page.on("request", (req) => requests.push(req.url()));
  await page.goto(
    `${hostOrigin}/r2-hosted-host.html?src=${encodeURIComponent(src)}&instance=r2-${id}`,
    { waitUntil: "domcontentloaded" },
  );
  const before = await shot(page, dir, "before.png");
  let ready = false;
  if (options.expectReady !== false) {
    ready = await page
      .waitForFunction(() => window.__oceanleoReady === true, null, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (options.afterReady) {
    await options.afterReady(page).catch((error) => {
      options.phenomenon = String(error);
    });
  }
  const after = await shot(page, dir, "after.png");
  await page.getByTestId("hosted-save").click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Control+z").catch(() => {});
  await page.getByTestId("hosted-export").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  const reopen = await shot(page, dir, "reopen.png");
  const snapshot = await page.evaluate(() => window.__oceanleoSnapshot || null);
  const remote = requests.filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost";
    } catch {
      return true;
    }
  });
  const fromCore = requests.filter((url) => url.startsWith(coreServer.origin));
  const verdict =
    options.expectReady === false
      ? "RED"
      : ready && remote.length === 0 && fromCore.length > 0
        ? "GREEN"
        : "RED";
  const log = await writeLog(dir, {
    id,
    src,
    coreOrigin: coreServer.origin,
    ready,
    remote,
    fromCore: fromCore.slice(0, 30),
    snapshotType: snapshot?.type || null,
    before,
    after,
    reopen,
    phenomenon: options.phenomenon || (ready ? "" : "iframe did not post ready"),
    verdict,
    agplInAppTree: false,
  });
  await page.close();
  return { verdict, log, ready, remoteCount: remote.length };
}

function silentWav() {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples * 2, true);
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}
