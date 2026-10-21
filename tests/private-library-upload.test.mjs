import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const moduleUrl = await compileModule("src/lib/database.ts", {
  "./auth/client": dataModule('export async function accessToken(){return "owner-test-token";}'),
  "./auth/config": dataModule('export const GATEWAY_BASE="https://gateway.test";'),
  "./upload/chunked": dataModule(`
    export function deriveUploadIdentity(){throw new Error("private files must not use public upload flow");}
    export function identityIsTrustworthy(){return false;}
    export async function readResumeTicket(){return null;}
    export async function writeResumeTicket(){}
    export async function deleteResumeTicket(){}
  `),
});
const { uploadFile, gatewayErrorMessage } = await import(moduleUrl);

async function withFetch(status, run) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(status === 200
      ? { ok: true, file: { id: "a1", artifact_id: "a1", url: "" } }
      : { detail: "private storage unavailable" }), { status });
  };
  try { await run(calls); } finally { globalThis.fetch = previous; }
}

test("private files above 8 MiB use only the private owner-authenticated route", async () => {
  await withFetch(200, async (calls) => {
    const file = new File([new Uint8Array(9 * 1024 * 1024)], "filing.pdf", { type: "application/pdf" });
    const result = await uploadFile(file, { privateUpload: true });
    assert.equal(result.ok, true);
    assert.equal(result.data.file.artifact_id, "a1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://gateway.test/v1/database/private-upload");
    assert.equal(calls[0].init.credentials, "include");
    assert.equal(calls[0].init.headers.Authorization, "Bearer owner-test-token");
  });
});

test("private upload failure never falls back to a public route", async () => {
  await withFetch(502, async (calls) => {
    const result = await uploadFile(new File(["private"], "filing.md"), { privateUpload: true });
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://gateway.test/v1/database/private-upload");
  });
});

test("catalog 400 envelope is the upload error, not HTTP 400", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        code: "invalid-request",
        message: "invalid idempotency key",
        details: {},
        requestId: "req-1",
      }),
      { status: 400 },
    );
  try {
    const result = await uploadFile(new File(["private"], "my file.md"), {
      privateUpload: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.error, "invalid idempotency key");
    assert.equal(
      gatewayErrorMessage(
        { code: "invalid-request", message: "invalid idempotency key" },
        400,
      ),
      "invalid idempotency key",
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("private files exceeding 20 MiB fail before a network request", async () => {
  await withFetch(200, async (calls) => {
    const file = new File([new Uint8Array(20 * 1024 * 1024 + 1)], "large.pdf");
    const result = await uploadFile(file, { privateUpload: true });
    assert.equal(result.ok, false);
    assert.equal(result.status, 413);
    assert.equal(calls.length, 0);
  });
});
