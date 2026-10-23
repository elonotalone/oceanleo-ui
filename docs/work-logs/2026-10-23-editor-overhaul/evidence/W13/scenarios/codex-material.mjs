import assert from "node:assert/strict";
import { openEditorByItem } from "../../V01/scenarios/_v01-lib.mjs";
import { waitModelReady, clickStageCenter } from "./lib.mjs";
import * as Y from "yjs";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";

export default async function ({ page, helpers, log, shot, args }) {
  const writes = [];
  let sourceGrants = 0;
  const remoteDoc = new Y.Doc();
  page.on("websocket", (socket) => socket.on("framereceived", ({ payload }) => {
    if (typeof payload === "string") return;
    try { const decoder = decoding.createDecoder(new Uint8Array(payload));
      if (decoding.readVarUint(decoder) === 0) syncProtocol.readSyncMessage(decoder, encoding.createEncoder(), remoteDoc, "probe");
    } catch {}
  }));
  page.on("response", (r) => {
    if (r.status() >= 400) {
      log("HTTP error", r.status(), new URL(r.url()).pathname.replace(/\/access\/[^/]+/, "/access/[redacted]"));
      const signed = new URL(r.url()).pathname.split("/access/")[1];
      if (signed) { try { const claim = JSON.parse(Buffer.from(signed.split(".")[0], "base64url").toString());
        log("expired source identity", JSON.stringify({ artifact: claim.artifact, revision: claim.revision, expiry: claim.exp, purpose: claim.purpose })); } catch {} }
    }
    if (r.request().method() === "GET" && /\/artifacts\/[^/]+\/(?:source|revisions\/[^/]+\/renditions\/source)$/.test(new URL(r.url()).pathname)) {
      assert.equal(r.status(), 200); sourceGrants++; log("renewable source grant", r.status());
    }
    if (r.request().method() === "POST" && /\/revisions$/.test(new URL(r.url()).pathname)) {
      writes.push(r.status()); log("revision", r.status());
    }
  });
  const open = async () => {
    assert.ok(await openEditorByItem(page, helpers, "[W13] sample.glb", log, { id: args[0] }));
    try { await waitModelReady(page, log, 90000); } catch (error) {
      const room = remoteDoc.getMap("oceanleo:model3d").toJSON();
      const meta = room.meta || {};
      log("room diagnostic", JSON.stringify({ keys: Object.keys(meta), provenance: meta.provenance ? { artifactId: meta.provenance.artifactId, revisionId: meta.provenance.revisionId, sourceDigest: meta.provenance.sourceDigest } : null,
        operationCount: Object.keys(room.entities || {}).length,
        checkpointKind: String(meta.checkpointUrl || "").includes("/access/") ? "private-access" : "other" }));
      log("cold source diagnostic", JSON.stringify(await page.locator('[data-testid="model3d-stage-backdrop"]').evaluate((element) => {
        const key = Object.keys(element).find((key) => key.startsWith("__reactFiber"));
        let fiber = element[key]; const found = [];
        while (fiber) {
          const editor = fiber.memoizedProps?.editor;
          if (editor?.sourceProvenance && !found.some((entry) => entry.kind === "editor")) found.push({ kind: "editor", artifactId: editor.sourceProvenance.artifactId, revisionId: editor.sourceProvenance.revisionId,
            sourceDigest: editor.sourceProvenance.sourceDigest, loaded: editor.modelLoaded,
            sourceKind: editor.sourceUrl?.includes("/artifact-renditions/access/") ? "private-access" : "other", notice: editor.notice });
          const item = fiber.memoizedProps?.item;
          if (item) found.push({ kind: "item", id: item.id, key: item.key, artifactId: item.artifactId, revisionId: item.revisionId,
            source: item.source, artifactProjectionId: item.artifact?.artifactId, artifactProjectionRevision: item.artifact?.revisionId });
          fiber = fiber.return;
        }
        return found;
      }).catch(() => null)));
      throw error;
    }
    await clickStageCenter(page);
  };
  const material = () => page.locator('[data-selection-control-id="selection-inspector-model-material"] button:visible').first();
  const hex = () => page.getByRole("textbox", { name: /^(基础色|Base color) HEX$/ });
  const inspect = async () => { if (!(await hex().isVisible())) await material().click(); };
  const settle = async (count) => {
    const start = Date.now();
    while (writes.length < count && Date.now() - start < 90000) await page.waitForTimeout(250);
    assert.equal(writes.length, count); assert.ok(writes.every((status) => status === 200));
    await helpers.waitSaved(page, { timeout: 30000 });
  };
  await open(); await inspect();
  if (args[1] === "close-only") {
    const original = await hex().inputValue();
    const close = page.getByRole("button", { name: "Close right pane", exact: true });
    // Native keyboard activation avoids the unrelated development-issues badge
    // overlapping the upper-right pointer target.
    await close.focus(); await close.press("Enter");
    await open(); await inspect();
    assert.equal(await hex().inputValue(), original);
    assert.equal(writes.length, 0);
    assert.ok(sourceGrants > 0, "cold typed open did not renew the authenticated source grant");
    await shot("material-clean-close-reopen");
    log("PASS clean close/reopen without phantom save", original);
    return;
  }
  const original = await hex().inputValue();
  const changed = original.toLowerCase() === "#3388cc" ? "#cc6633" : "#3388cc";
  await hex().fill(changed); await hex().press("Tab");
  await settle(1); await inspect();
  assert.equal((await hex().inputValue()).toLowerCase(), changed);
  assert.equal(await page.locator('[data-testid="model3d-stage-backdrop"]').getAttribute("data-model3d-selected-color"), changed);
  await shot("material-changed-saved");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settle(2);
  await open(); await inspect();
  assert.equal(await hex().inputValue(), original, "undo/reopen did not restore authored material");
  await shot("material-authored-restored");
  const close = page.getByRole("button", { name: "Close right pane", exact: true });
  await close.focus(); await close.press("Enter");
  await open(); await inspect();
  assert.equal(await hex().inputValue(), original);
  assert.equal(writes.length, 2, "clean close/reopen published a phantom revision");
  log("PASS actual material mutation, saved undo and reopen", original, JSON.stringify(writes));
}
