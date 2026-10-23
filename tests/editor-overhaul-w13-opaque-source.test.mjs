import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { model3DIdentityFromAccessUrl } from "../src/shell/media-editors/model3d-dependency-runtime.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const base = "https://api.dev.oceanleo.com";
const artifact = "1fbbe2f6-38af-416d-a59d-8fe75dbd80d7";
const oldRevision = "aeeaa247-b4ec-4646-8eb5-f122a8b73b76";
const claim = { v: 1, artifact, revision: oldRevision, exp: 1, mode: "source", purpose: "source" };
const urlFor = (payload = claim) => `${base}/v1/artifact-renditions/access/${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

test("expired opaque URLs supply only an exact old-revision hint, never the current head", () => {
  assert.deepEqual(model3DIdentityFromAccessUrl(urlFor(), base, artifact), { artifactId: artifact, revisionId: oldRevision, sourceDigest: "" });
  assert.equal(model3DIdentityFromAccessUrl(urlFor(), base, "8ab73f0a-a2df-4fa8-9954-fe99ed1768e2"), null);
  assert.equal(model3DIdentityFromAccessUrl(urlFor(), base, ""), null);
  for (const url of [urlFor().replace("api.dev.oceanleo.com", "evil.invalid"), urlFor() + "?x=1", urlFor() + "#x",
    urlFor({ ...claim, purpose: "thumbnail" }), urlFor({ ...claim, mode: "preview" }), urlFor({ ...claim, v: 2 }),
    urlFor({ ...claim, revision: "missing" }), urlFor({ ...claim, oversized: "x".repeat(10000) }), `${base}/v1/artifact-renditions/access/not-json.sig`]) {
    assert.equal(model3DIdentityFromAccessUrl(url, base, artifact), null, url);
  }
});

test("loader renews the exact expired checkpoint under authenticated grants without publishing or changing its journal", async () => {
  const { prepareModelRuntimeSource } = await import(await compileModule("src/shell/media-editors/model3d-files.ts", {
    "../../lib/database": dataModule("export const uploadFile = () => { throw Error('unexpected upload'); };"),
    "../../lib/auth/client": dataModule("export const accessToken = async () => 'test-auth';"),
    "../../lib/auth/config": dataModule(`export const GATEWAY_BASE = ${JSON.stringify(base)};`),
    "../../lib/media-proxy": dataModule("export const absoluteMediaUrl = x => x; export const canvasSafeUrl = x => x; export const fetchMediaBlob = () => { throw Error('must renew, not retry expired URL'); };"),
  }));
  const oldFetch = globalThis.fetch;
  const oldWindow = globalThis.window;
  globalThis.window = { location: { href: base } };
  const requests = [];
  let projectionOverrides = {};
  const journal = [{ id: "copy", kind: "presence", target: "clone:1", present: true, spec: { kind: "clone", source: "base:0" } }];
  const before = JSON.stringify(journal);
  const json = Buffer.from('{"asset":{"version":"2.0"},"scenes":[{"nodes":[0]}],"nodes":[{"name":"Cube"}]}'.padEnd(100, " "));
  const header = Buffer.alloc(20); header.write("glTF"); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + json.length, 8);
  header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  globalThis.fetch = async (url, options) => {
    requests.push(String(url)); assert.equal(options?.method || "GET", "GET");
    assert.equal(options.headers.Authorization, "Bearer test-auth");
    if (String(url).includes("/library/items/")) {
      assert.equal(options.credentials, "include");
      assert.equal(new URL(url).searchParams.get("revisionId"), oldRevision);
      return Response.json({ artifactId: artifact, revisionId: oldRevision, sourceFormat: "glb",
        source: { digest: createHash("sha256").update(Buffer.concat([header, json])).digest("hex") }, ...projectionOverrides });
    }
    if (String(url).includes("/source?")) {
      assert.equal(new URL(url).searchParams.get("revisionId"), oldRevision);
      return Response.json({ artifactId: artifact, revisionId: oldRevision, purpose: "source", mode: "source", dependencyPath: "",
        accessUrl: "/v1/artifact-renditions/access/fresh-grant", expiresAt: "2099-01-01T00:00:00Z", format: "glb", mediaType: "model/gltf-binary" });
    }
    assert.equal(String(url), `${base}/v1/artifact-renditions/access/fresh-grant`);
    return new Response(Buffer.concat([header, json]), { headers: { "Content-Type": "model/gltf-binary" } });
  };
  try {
    const prepared = await prepareModelRuntimeSource(urlFor(), undefined, urlFor(), null, artifact);
    assert.equal(prepared.format, "glb"); assert.equal(requests.length, 3);
    assert.equal(JSON.stringify(journal), before);
    prepared.release();
    for (const overrides of [{ revisionId: "393db0c0-de68-41a6-81c3-4fa8829a7997" }, { sourceFormat: "png" }, { source: { digest: "0".repeat(64) } }]) {
      projectionOverrides = overrides;
      await assert.rejects(() => prepareModelRuntimeSource(urlFor(), undefined, urlFor(), null, artifact), /身份无法确认|内容校验失败/);
      assert.equal(JSON.stringify(journal), before);
    }
  } finally { globalThis.fetch = oldFetch; globalThis.window = oldWindow; }
});
