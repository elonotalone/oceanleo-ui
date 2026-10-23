import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

test("private media dependency uses the authenticated gateway and a bounded media read", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const mediaReads = [];
  globalThis.__w16MediaIO = { read: async (...args) => { mediaReads.push(args); return new Blob(["verified"]); } };
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify({ accessUrl: "https://gateway.test/v1/private-media/receipt" }));
  };
  try {
    const subject = await import(await compileModule("src/shell/workflow-carrier/video-project-media-io.ts", {
      "../../lib/auth/client": dataModule("export const accessToken = async () => 'test-session';"),
      "../../lib/auth/config": dataModule("export const GATEWAY_BASE = 'https://gateway.test';"),
      "../../lib/media-proxy": dataModule("export const fetchMediaBlob = (...args) => globalThis.__w16MediaIO.read(...args);"),
      "../artifact-client": dataModule("export const refreshArtifactRendition = () => {}; export const stageArtifactBlob = () => {};"),
    }));
    const controller = new AbortController();
    await subject.videoDependencyBlob({ artifactId: "root", revisionId: "r1", path: "assets/clip.wav" }, controller.signal);
    assert.equal(calls[0][0], "https://gateway.test/v1/artifacts/root/revisions/r1/source-dependencies/assets/clip.wav");
    assert.equal(calls[0][1].credentials, "include");
    assert.equal(calls[0][1].headers.Authorization, "Bearer test-session");
    assert.equal(mediaReads[0][1].maxBytes, 20 * 1024 * 1024);
    assert.equal(mediaReads[0][1].signal, controller.signal);
    globalThis.fetch = async () => new Response(JSON.stringify({ accessUrl: "https://untrusted.test/clip" }));
    await assert.rejects(subject.videoDependencyBlob({ artifactId: "root", revisionId: "r1", path: "assets/clip.wav" }, controller.signal), /不在私有网关/);
    assert.equal(mediaReads.length, 1, "foreign access URL is never read");
  } finally {
    globalThis.fetch = previousFetch;
    delete globalThis.__w16MediaIO;
  }
});

test("Undo/Redo retains verified media URLs until the editor closes", async () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  const emitted = [];
  let fetches = 0;
  let effects = [];
  let ref;
  globalThis.__w16Media = {
    effect(callback) { effects.push(callback); },
    ref(value) { return ref ||= { current: value }; },
    async read() { fetches++; return new Blob(["image"]); },
  };
  URL.createObjectURL = () => "blob:verified-media";
  URL.revokeObjectURL = url => revoked.push(url);
  try {
    const subject = await import(await compileModule("src/shell/workflow-carrier/use-video-project-media.ts", {
      react: dataModule("export const useRef = value => globalThis.__w16Media.ref(value); export const useEffect = callback => globalThis.__w16Media.effect(callback);"),
      "./video-project-media-io": dataModule("export const videoDependencyBlob = (...args) => globalThis.__w16Media.read(...args);"),
    }));
    const render = assets => {
      effects = [];
      subject.useVideoProjectMedia({ assets }, (id, url) => emitted.push([id, url]), () => assert.fail("must not lose verified media"));
      return effects;
    };
    const asset = { contentDigest: "a".repeat(64), sourceDependency: { path: "assets/one" } };
    const first = render({ one: asset });
    const close = first[0]();
    const cleanupFirst = first[1]();
    await new Promise(resolve => setImmediate(resolve));
    cleanupFirst();
    const undo = render({});
    const cleanupUndo = undo[1]();
    cleanupUndo();
    const redo = render({ one: { contentDigest: asset.contentDigest, url: "project-assets:u/private/staging" } });
    redo[1]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fetches, 1);
    assert.deepEqual(emitted.at(-1), ["one", "blob:verified-media"]);
    assert.deepEqual(revoked, [], "history transitions must not invalidate the restored node's URL");
    close();
    assert.deepEqual(revoked, ["blob:verified-media"]);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    delete globalThis.__w16Media;
  }
});
