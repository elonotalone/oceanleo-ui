import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";
import {
  DEFAULT_MODEL3D_VIEW,
  model3DSidecarWithoutSource,
  model3DSourceForItem,
} from "../src/shell/media-editors/model3d-workbench-defaults.ts";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const TEXTURE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2M7WQAAAABJRU5ErkJggg==",
  "base64",
);

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/texture.png") {
        response.writeHead(200, {
          "content-type": "image/png",
          "cache-control": "no-store",
        });
        response.end(TEXTURE_PNG);
        return;
      }
      const pathname =
        decodeURIComponent(url.pathname) === "/"
          ? "/tests/model3d-browser-smoke.html"
          : decodeURIComponent(url.pathname);
      const file = resolve(ROOT, `.${pathname}`);
      if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type": MIME[extname(file)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(body);
    } catch (error) {
      response
        .writeHead(error?.code === "ENOENT" ? 404 : 500)
        .end(String(error));
    }
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

test("saved Three editor items reopen the exported GLB, not the stale source", () => {
  const exported = "https://asset.oceanleo.com/user/edited.glb";
  assert.equal(
    model3DSourceForItem({
      key: "creation:edited",
      source: "creation",
      id: "edited-version",
      title: "Edited",
      kind: "threed",
      siteId: "threed",
      url: exported,
      favorite: false,
      meta: {
        editor: "three-gltf-editor-v2",
        model_source_url: "https://example.test/original.glb",
        editor_project_url:
          "https://asset.oceanleo.com/user/edited.sidecar.json",
      },
    }),
    exported,
  );
});

test("Three editor autosave uses the current annotation sidecar", () => {
  const annotations = [{
    id: "annotation-current",
    label: "Current surface note",
    x: 1,
    y: 2,
    z: 3,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    nodePath: "0/1",
  }];
  const sidecar = model3DSidecarWithoutSource(
    {
      ...DEFAULT_MODEL3D_VIEW,
      sourceUrl: "https://example.test/original.glb",
      annotations: [],
    },
    annotations,
  );
  assert.deepEqual(sidecar.annotations, annotations);
  assert.equal("sourceUrl" in sidecar, false);
});

test(
  "Three.js scene interactions survive a real exported GLB round trip",
  { timeout: 60_000 },
  async (t) => {
    const { server, url } = await startServer();
    const browser = await chromium.launch({ headless: true });
    t.after(async () => {
      await browser.close();
      await new Promise((resolveClose) => server.close(resolveClose));
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const response = await page.goto(url, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200);
    await page.waitForFunction(() => window.__MODEL3D_SMOKE_READY__ === true);

    await t.test("runtime gestures coalesce previews and cancel cleanly", async () => {
      const committed = await page.evaluate(() =>
        window.__MODEL3D_RUN_GESTURE_TEST__("commit-transform"),
      );
      assert.deepEqual(committed.preview, {
        edits: 0,
        canUndo: false,
        journalCount: 0,
        x: 1,
      });
      assert.deepEqual(committed.committed, {
        edits: 1,
        revision: 1,
        dirty: true,
        canUndo: true,
        journalCount: 1,
        x: 1,
      });
      const cancelled = await page.evaluate(() =>
        window.__MODEL3D_RUN_GESTURE_TEST__("cancel-material"),
      );
      assert.equal(cancelled.baseColor, "#ffffff");
      assert.notEqual(cancelled.previewColor, cancelled.baseColor);
      assert.equal(cancelled.restoredColor, cancelled.baseColor);
      assert.equal(cancelled.edits, 0);
      assert.equal(cancelled.revision, 0);
      assert.equal(cancelled.dirty, false);
      assert.equal(cancelled.canUndo, false);
      assert.equal(cancelled.journalCount, 0);
    });

    await t.test("failed checkpoint reopens from checkpoint plus journal", async () => {
      const recovery = await page.evaluate(() =>
        window.__MODEL3D_RUN_RECOVERY_TEST__(),
      );
      assert.deepEqual(recovery, {
        checkpointReason: "operation-limit",
        retainedAfterFailure: 64,
        reopenedPosition: 64,
        remainingAfterSuccess: 1,
        remainingPosition: 65,
        undoRetainedAfterCheckpoint: true,
      });
    });

    await t.test("canvas and scene tree select real child nodes", async () => {
      await page.locator("#annotation").click();
      await page.locator("#viewport").click({ position: { x: 260, y: 180 } });
      await page.waitForFunction(
        () => window.__MODEL3D_RUNTIME__ && !JSON.parse(
          document.querySelector("#status").textContent,
        ).annotationPlacementArmed,
      );
      await page.locator("#viewport").click({ position: { x: 260, y: 180 } });
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector("#status").textContent).selected ===
          "EditableCube",
      );
      await page.locator('[data-node-name="EditableCube"]').click();
      const status = JSON.parse(await page.locator("#status").textContent());
      assert.equal(status.selected, "EditableCube");
      assert.equal(status.transformAttached, true);
    });

    await t.test("transform, history and PBR controls mutate owned scene", async () => {
      await page.locator('[data-node-name="AuthoredCamera"]').click();
      await page.locator("#edit-camera").click();
      await page.locator("#add-point-light").click();
      await page.locator("#edit-light").click();
      await page.locator('[data-node-name="EditableCube"]').click();
      await page.locator("#position-x").fill("1.25");
      await page.locator("#apply-position").click();
      await page.locator("#undo").click();
      assert.equal(Number(await page.locator("#position-x").inputValue()), 0);
      await page.locator("#redo").click();
      assert.equal(Number(await page.locator("#position-x").inputValue()), 1.25);
      await page.locator("#mode-rotate").click();
      await page.locator("#material-green").click();
      await page.locator("#texture-map").click();
      await page.waitForFunction(
        () =>
          window.__MODEL3D_TEXTURE_REPLACED__ === true ||
          window.__MODEL3D_SMOKE_ERROR__ !== undefined,
      );
      await page.locator("#animation-time").click();
      await page.evaluate(() => {
        const runtime = window.__MODEL3D_RUNTIME__;
        runtime.setSelectedNode(
          runtime.contentScene.getObjectByName("VisibilityNode").uuid,
        );
        runtime.setNodeVisible(false);
        runtime.setSelectedNode(
          runtime.contentScene.getObjectByName("DeleteNode").uuid,
        );
        runtime.deleteSelected();
        runtime.setSelectedNode(
          runtime.contentScene.getObjectByName("EditableCube").uuid,
        );
      });
      const status = JSON.parse(await page.locator("#status").textContent());
      assert.equal(status.transformMode, "rotate");
      assert.equal(status.transformAttached, true);
    });

    await page.locator("#export").click();
    await page.waitForFunction(
      () =>
        window.__MODEL3D_SMOKE_RESULT__ !== undefined ||
        window.__MODEL3D_SMOKE_ERROR__ !== undefined,
    );
    const failure = await page.evaluate(() => window.__MODEL3D_SMOKE_ERROR__);
    assert.equal(failure, undefined);
    const result = await page.evaluate(() => window.__MODEL3D_SMOKE_RESULT__);
    assert.ok(result.exportedBytes > 1_000);
    assert.ok(
      Math.abs(result.position[0] - 1.25) < 1e-6,
      JSON.stringify(result),
    );
    assert.ok(
      Math.abs(result.animationOnlyPosition[0]) < 1e-6,
      `animation playback leaked into the exported rest pose: ${JSON.stringify(result)}`,
    );
    assert.equal(result.materialColor, "#33aa77");
    assert.ok(Math.abs(result.metalness - 0.65) < 1e-6);
    assert.ok(Math.abs(result.roughness - 0.35) < 1e-6);
    assert.equal(result.texturePreserved, true);
    assert.equal(result.cameraPreserved, true);
    assert.ok(Math.abs(result.cameraFov - 52) < 1e-6);
    assert.equal(result.lightPreserved, true);
    assert.equal(result.pointLightPreserved, true);
    assert.ok(Math.abs(result.pointLightIntensity - 12.5) < 1e-6);
    assert.equal(result.journalCount, 10);
    assert.ok(Math.abs(result.journalReplayPosition[0] - 1.25) < 1e-6);
    assert.equal(result.journalReplayMaterialColor, "#33aa77");
    assert.equal(result.journalReplayTexture, true);
    assert.ok(Math.abs(result.journalReplayCameraFov - 52) < 1e-6);
    assert.ok(
      Math.abs(result.journalReplayPointLightIntensity - 12.5) < 1e-6,
    );
    assert.equal(result.deletedNodeAbsent, true);
    assert.equal(result.visibilityExtraPreserved, true);
    assert.equal(result.journalReplayVisibility, false);
    assert.equal(result.checkpointTargetStable, true);
    assert.ok(Math.abs(result.checkpointReplayPosition[0] - 2.5) < 1e-6);
    assert.equal(result.checkpointVisibility, false);
    assert.equal(result.animationPreserved, true);
    assert.ok(Math.abs(result.playbackTime - 0.5) < 1e-6);
    assert.equal(result.rendererEnvironmentInGlb, false);
    assert.equal(result.annotationCount, 1);
    assert.equal(result.annotationNodesInGlb, 0);
    assert.equal(result.transformAttached, true);
    assert.equal(result.transformMode, "rotate");
    assert.deepEqual(errors, []);
  },
);
