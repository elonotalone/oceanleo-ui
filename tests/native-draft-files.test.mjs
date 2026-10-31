// 2026-10-31 A1 follow-up: a homepage computer chat (Claude Code / Codex) holds its
// files in the tab until the task session exists; they are kept in IndexedDB so a
// refresh brings them back, and cleared once the first prompt goes out.

import assert from "node:assert/strict";
import test from "node:test";

// Minimal in-memory IndexedDB: open → onupgradeneeded/onsuccess; one store; get/put/delete.
function installFakeIndexedDb() {
  const data = new Map();
  const later = (fn) => setTimeout(fn, 0);
  globalThis.indexedDB = {
    open() {
      const req = {};
      later(() => {
        const db = {
          createObjectStore() {},
          close() {},
          transaction() {
            const tx = {};
            const done = () => later(() => tx.oncomplete?.());
            tx.objectStore = () => ({
              get(key) { const r = { result: data.get(key) }; done(); return r; },
              put(value, key) { data.set(key, value); const r = { result: key }; done(); return r; },
              delete(key) { data.delete(key); const r = { result: undefined }; done(); return r; },
            });
            return tx;
          },
        };
        req.result = db;
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  return data;
}

test("native draft files: write, read back as Files, clear", async () => {
  const data = installFakeIndexedDb();
  const mod = await import("../src/shell/native-draft-files.ts");
  const a = new File(["aa"], "a.png", { type: "image/png" });
  const b = new File(["bbb"], "b.pdf", { type: "application/pdf" });
  await mod.writeNativeDraftFiles("home:u1", [a, b]);
  const back = await mod.readNativeDraftFiles("home:u1");
  assert.deepEqual(back.map((f) => f.name), ["a.png", "b.pdf"]);
  assert.equal(await back[1].text(), "bbb");
  // An empty list deletes the record (nothing restores after the last tile is removed).
  await mod.writeNativeDraftFiles("home:u1", []);
  assert.equal(data.has("home:u1"), false);
  await mod.writeNativeDraftFiles("home:u1", [a]);
  await mod.clearNativeDraftFiles("home:u1");
  assert.deepEqual(await mod.readNativeDraftFiles("home:u1"), []);
  delete globalThis.indexedDB;
});

test("native draft files: no IndexedDB → nothing stored, nothing thrown", async () => {
  delete globalThis.indexedDB;
  const mod = await import("../src/shell/native-draft-files.ts");
  await mod.writeNativeDraftFiles("home:u2", [new File(["x"], "x.txt")]);
  assert.deepEqual(await mod.readNativeDraftFiles("home:u2"), []);
});

test("library pick into a computer chat needs a private reference", async () => {
  const mod = await import("../src/shell/native-draft-files.ts");
  assert.equal(await mod.libraryAttachmentFile({ name: "x.png" }), null);
});
