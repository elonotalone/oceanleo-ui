import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const moduleUrl = await compileModule("src/lib/database.ts", {
  "./auth/client": dataModule(`
    export async function accessToken(){
      const tokens = globalThis.__uploadRecoveryTokens;
      return tokens?.length ? tokens.shift() : "owner-test-token";
    }
  `),
  "./auth/config": dataModule('export const GATEWAY_BASE="https://gateway.test";'),
  "./upload/chunked": dataModule(`
    export async function deriveUploadIdentity(){
      return { idempotencyKey: "upload:v1:home:test", identity: null };
    }
    export function identityIsTrustworthy(){return false;}
    export async function readResumeTicket(){return null;}
    export async function writeResumeTicket(){}
    export async function deleteResumeTicket(){}
  `),
});
const { uploadFile } = await import(moduleUrl);

function privateFile() {
  return new File(["owner-only bytes"], "filing.pdf", { type: "application/pdf" });
}

function installFetch(handler) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  return {
    calls,
    restore() {
      if (previous === undefined) delete globalThis.fetch;
      else globalThis.fetch = previous;
    },
  };
}

function installXhr(handler) {
  const previous = globalThis.XMLHttpRequest;
  const calls = [];
  class FakeXhr {
    constructor() {
      this.upload = {};
      this.headers = {};
      this.status = 0;
      this.responseText = "";
      calls.push(this);
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name, value) {
      this.headers[name] = value;
    }
    abort() {
      this.onabort?.();
    }
    send(body) {
      this.body = body;
      Promise.resolve(handler(this, body, calls.length)).catch(() => this.onerror?.());
    }
  }
  globalThis.XMLHttpRequest = FakeXhr;
  return {
    calls,
    restore() {
      if (previous === undefined) delete globalThis.XMLHttpRequest;
      else globalThis.XMLHttpRequest = previous;
    },
  };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const success = (id = "artifact-1") => ({
  ok: true,
  file: { id, artifact_id: id, url: "" },
});

test("ambiguous fetch failure retries the same private request without duplicate registration", async () => {
  const registrations = new Map();
  const transport = installFetch(async (url, init, attempt) => {
    assert.equal(url, "https://gateway.test/v1/database/private-upload");
    const key = init.body.get("idempotency_key");
    const uploaded = init.body.get("file");
    const bytes = Buffer.from(await uploaded.arrayBuffer()).toString("hex");
    const identity = `${key}:${bytes}`;
    if (!registrations.has(identity)) {
      registrations.set(identity, { id: "artifact-1", registrations: 1 });
    }
    // Model the gateway committing successfully before its response is lost.
    if (attempt === 1) throw new TypeError("connection reset after commit");
    return json(success(registrations.get(identity).id));
  });
  try {
    const result = await uploadFile(privateFile(), {
      privateUpload: true,
      idempotencyKey: "library-upload-content-bound",
      siteId: "home",
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.file.id, "artifact-1");
    assert.equal(transport.calls.length, 2);
    assert.equal(registrations.size, 1);
    assert.equal([...registrations.values()][0].registrations, 1);
    assert.deepEqual(
      transport.calls.map(({ url }) => url),
      [
        "https://gateway.test/v1/database/private-upload",
        "https://gateway.test/v1/database/private-upload",
      ],
    );
    assert.deepEqual(
      transport.calls.map(({ init }) => init.body.get("idempotency_key")),
      ["library-upload-content-bound", "library-upload-content-bound"],
    );
    assert.ok(transport.calls.every(({ init }) => init.credentials === "include"));
    assert.ok(
      transport.calls.every(({ init }) => init.headers.Authorization === "Bearer owner-test-token"),
    );
  } finally {
    transport.restore();
  }
});

test("XHR 503 then success replays the same private multipart body and identity", async () => {
  const registrations = new Map();
  const transport = installXhr((request, body, attempt) => {
    assert.equal(request.url, "https://gateway.test/v1/database/private-upload");
    assert.equal(request.method, "POST");
    assert.equal(request.withCredentials, true);
    assert.equal(request.headers.Authorization, "Bearer owner-test-token");
    assert.equal(request.headers["Content-Type"], undefined, "browser owns multipart boundary");
    const identity = `${body.get("idempotency_key")}:${body.get("file").name}`;
    if (!registrations.has(identity)) registrations.set(identity, "artifact-xhr");
    request.status = attempt === 1 ? 503 : 200;
    request.responseText = JSON.stringify(
      attempt === 1
        ? { detail: "temporary gateway failure after registration" }
        : success(registrations.get(identity)),
    );
    request.onload?.();
  });
  try {
    const result = await uploadFile(privateFile(), {
      privateUpload: true,
      idempotencyKey: "library-upload-xhr-key",
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.file.id, "artifact-xhr");
    assert.equal(transport.calls.length, 2);
    assert.equal(registrations.size, 1);
    assert.equal(transport.calls[0].body, transport.calls[1].body);
    assert.deepEqual(
      transport.calls.map(({ body }) => body.get("idempotency_key")),
      ["library-upload-xhr-key", "library-upload-xhr-key"],
    );
  } finally {
    transport.restore();
  }
});

test("one 401 re-reads the access token and retries once with the stable key", async () => {
  globalThis.__uploadRecoveryTokens = ["stale-owner-token", "fresh-owner-token"];
  const transport = installFetch(async (_url, _init, attempt) =>
    attempt === 1
      ? json({ detail: "expired access token" }, 401)
      : json(success("artifact-refreshed")),
  );
  try {
    const result = await uploadFile(privateFile(), {
      privateUpload: true,
      idempotencyKey: "library-upload-auth-key",
    });
    assert.equal(result.ok, true);
    assert.equal(transport.calls.length, 2);
    assert.deepEqual(
      transport.calls.map(({ init }) => init.headers.Authorization),
      ["Bearer stale-owner-token", "Bearer fresh-owner-token"],
    );
    assert.deepEqual(
      transport.calls.map(({ init }) => init.body.get("idempotency_key")),
      ["library-upload-auth-key", "library-upload-auth-key"],
    );
  } finally {
    delete globalThis.__uploadRecoveryTokens;
    transport.restore();
  }
});

test("transient failures stop after three attempts and remain explicitly retryable", async () => {
  const transport = installFetch(async () => json({ detail: "gateway unavailable" }, 503));
  try {
    const result = await uploadFile(privateFile(), {
      privateUpload: true,
      idempotencyKey: "library-upload-bounded-key",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.retryable, true);
    assert.equal(transport.calls.length, 3);
    assert.ok(transport.calls.every(({ url }) => url.endsWith("/v1/database/private-upload")));
  } finally {
    transport.restore();
  }
});

test("large upload init transport failure uses file-upload wording", async () => {
  const transport = installFetch(async () => {
    throw new TypeError("network unavailable");
  });
  try {
    const media = new File(
      [new Uint8Array(8 * 1024 * 1024 + 1)],
      "media.mp4",
      { type: "video/mp4" },
    );
    const result = await uploadFile(media, {
      idempotencyKey: "large-upload-stable-key",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.equal(result.retryable, true);
    assert.equal(result.error, "文件上传服务暂时无法连接，请重试");
    assert.equal(transport.calls.length, 3);
    assert.ok(transport.calls.every(({ url }) => url.endsWith("/v1/media/upload/init")));
  } finally {
    transport.restore();
  }
});

test("definitive 4xx is not replayed or marked retryable", async () => {
  const transport = installFetch(async () => json({ detail: "file content rejected" }, 422));
  try {
    const result = await uploadFile(privateFile(), {
      privateUpload: true,
      idempotencyKey: "library-upload-4xx-key",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 422);
    assert.equal(result.retryable, false);
    assert.equal(transport.calls.length, 1);
  } finally {
    transport.restore();
  }
});

test("XHR timeout is transient but explicit abort never retries", async () => {
  const timeoutTransport = installXhr((request, _body, attempt) => {
    if (attempt === 1) request.ontimeout?.();
    else {
      request.status = 200;
      request.responseText = JSON.stringify(success("artifact-after-timeout"));
      request.onload?.();
    }
  });
  try {
    const result = await uploadFile(privateFile(), {
      privateUpload: true,
      idempotencyKey: "library-upload-timeout-key",
    });
    assert.equal(result.ok, true);
    assert.equal(timeoutTransport.calls.length, 2);
  } finally {
    timeoutTransport.restore();
  }

  const controller = new AbortController();
  const abortTransport = installXhr((request) => controller.abort());
  try {
    const result = await uploadFile(privateFile(), {
      privateUpload: true,
      idempotencyKey: "library-upload-abort-key",
      signal: controller.signal,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "上传已取消");
    assert.equal(result.status, 0);
    assert.equal(result.retryable, false);
    assert.equal(abortTransport.calls.length, 1);
  } finally {
    abortTransport.restore();
  }
});
