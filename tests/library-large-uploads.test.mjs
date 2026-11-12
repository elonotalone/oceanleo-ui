import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const records = new Map();
globalThis.__luRecovery = records;
const recovery = dataModule(`
export async function readAdvancedRecovery(k){ return globalThis.__luRecovery.get(k) || null; }
export async function writeAdvancedRecovery(r){ globalThis.__luRecovery.set(r.key, structuredClone(r)); }
export async function deleteAdvancedRecovery(k){ globalThis.__luRecovery.delete(k); }
`);
const auth = dataModule('export async function accessToken(){return globalThis.__luToken || "test-owner";}');
async function client() {
  return import(await compileModule("src/lib/library-uploads.ts", {
    "./auth/client": auth,
    "./auth/config": dataModule('export const GATEWAY_BASE="https://gateway.test";'),
    "../shell/advanced-recovery-store": recovery,
  }));
}
const store = new Map();
globalThis.localStorage = { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const session = (offset) => ({ uploadId: "session-1", method: "tus", partSize: 6 * 1024 * 1024, offset, url: "https://storage.test/upload/one", headers: { "x-signature": "grant" } });

// Re-importing the client discards its module memory; only recovery records remain.
test("big private file: create → chunks → pause → page reload → authoritative offset → remaining chunks → complete", async () => {
  records.clear(); store.clear();
  const previous = globalThis.fetch;
  const first = await client();
  const file = new File([new Uint8Array(25 * 1024 * 1024 + 5)], "big.mp4", { type: "video/mp4", lastModified: 123 });
  let offset = 0; let interrupted = false; const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (String(url).endsWith("/v1/library/uploads")) return json(session(0));
    if (String(url).startsWith("https://storage.test")) {
      assert.equal(init.credentials, "omit");
      assert.equal(init.headers.Authorization, undefined, "storage gets no account token");
      assert.equal(init.method, "PATCH");
      assert.equal(Number(init.headers["Upload-Offset"]), offset);
      if (!interrupted && offset > 0) {
        interrupted = true;
        const pending = await first.pendingLibraryUploads();
        first.pauseLibraryUpload(pending[0].key);
        throw new DOMException("paused", "AbortError");
      }
      offset += init.body.size;
      return new Response(null, { status: 204 });
    }
    if (String(url).endsWith("/complete")) { assert.equal(offset, file.size); return json({ file: { id: "art-1", artifact_id: "art-1", revision_id: "rev-1", url: "" } }); }
    return json(session(offset));
  };
  try {
    await assert.rejects(first.uploadLibraryFile(file), /暂停/);
    assert.equal(offset, 6 * 1024 * 1024);
    const reloaded = await client();
    const pending = await reloaded.pendingLibraryUploads();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].state, "paused");
    const result = await reloaded.resumeLibraryUpload(pending[0].key);
    assert.equal(result.artifact_id, "art-1");
    assert.equal((await reloaded.pendingLibraryUploads()).length, 0);
    assert.equal(calls.filter((call) => call.init.method === "POST" && call.url.endsWith("/uploads")).length, 1);
    assert.ok(calls.some((call) => call.url.endsWith("/session-1") && call.init.method === "GET"));
    assert.equal([...records.values()].filter((record) => record.editorId === "library-upload").length, 0);
    const beforeRetry = calls.length;
    const cached = await reloaded.uploadLibraryFile(file);
    assert.equal(cached.artifact_id, "art-1");
    assert.equal(calls.length, beforeRetry, "a composer retry can reuse the completed resumed upload");
  } finally { globalThis.fetch = previous; }
});

test("quota refusal preserves exact byte counts and never sends bytes to storage", async () => {
  records.clear(); store.clear();
  const api = await client(); const old = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return json({ detail: { code: "quota_exceeded", used_bytes: 100, limit_bytes: 110, requested_bytes: 20 } }, 413); };
  try {
    await assert.rejects(api.uploadLibraryFile(new File(["twenty"], "large.dat")), /100 B.*110 B.*20 B/);
    assert.equal(calls, 1);
    assert.equal((await api.pendingLibraryUploads())[0].state, "failed");
  } finally { globalThis.fetch = old; }
});

test("pending uploads cannot cross an account boundary", async () => {
  records.clear(); store.clear();
  const api = await client();
  await api.queueLibraryFile(new File(["private"], "secret.txt"), {});
  const [row] = await api.pendingLibraryUploads();
  globalThis.__luToken = "another-owner";
  try { assert.deepEqual(await api.pendingLibraryUploads(), []); assert.equal(await api.resumeLibraryUpload(row.key), undefined); }
  finally { delete globalThis.__luToken; }
});

test("an ambiguous network failure resumes from server bytes and refreshes an expired storage grant", async () => {
  records.clear(); store.clear();
  const api = await client(); const old = globalThis.fetch;
  let offset = 0; let ambiguous = true; let expired = true; let refreshed = 0;
  const ranges = [];
  const reply = () => ({ ...session(offset), partSize: 3 });
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/v1/library/uploads")) return json(reply());
    if (String(url).startsWith("https://storage.test")) {
      ranges.push(Number(init.headers["Upload-Offset"]));
      assert.equal(Number(init.headers["Upload-Offset"]), offset);
      if (expired) { expired = false; return new Response(null, { status: 403 }); }
      offset += init.body.size;
      if (ambiguous) { ambiguous = false; throw new TypeError("network response lost"); }
      return new Response(null, { status: 204 });
    }
    if (String(url).endsWith("/complete")) return json({ file: { id: "done", artifact_id: "done", url: "" } });
    refreshed++; return json(reply());
  };
  try {
    const result = await api.uploadLibraryFile(new File(["abcdef"], "data.pdf"));
    assert.equal(result.id, "done"); assert.equal(offset, 6); assert.equal(refreshed, 2);
    assert.deepEqual(ranges, [0, 0, 3], "bytes already in storage are not resent after the lost response");
  } finally { globalThis.fetch = old; }
});
