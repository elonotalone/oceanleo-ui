import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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
