import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import test from "node:test";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const stage = readFileSync("src/shell/video-editor/VideoDesigncomboStage.tsx", "utf8");
const registry = readFileSync("src/client-editor-adapters/registry.ts", "utf8");
const EVIDENCE_DIR =
  "/root/projects/oceanleo-app/docs/react-client-rebuild/evidence/W10/video-timeline";

test("full OpenVideo / designcombo core is not a ui dependency", () => {
  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
  };
  for (const name of Object.keys(deps)) {
    assert.equal(name.startsWith("@designcombo/"), false, name);
    assert.equal(name.startsWith("@openvideo/"), false, name);
  }
  assert.match(stage, /without @openvideo\/engine-pixi/);
  assert.match(registry, /Full designcombo package is not a ui dependency/);
});

test("video-timeline complete core is RED; legacy timeline stays", async () => {
  const evidence = {
    editorId: "video-timeline",
    verdict: "RED",
    core: "legacy timeline in oceanleo-ui; OpenVideo host facade only",
    license: "OpenVideo License — free tier is personal / companies of ≤3 people",
    reason:
      "OceanLeo cannot distribute the full designcombo/OpenVideo engine in the client under the free tier. @designcombo/* and @openvideo/engine-pixi are not ui dependencies. Existing local legacy timeline remains the complete offline editor.",
    nextHost: "src/shell/video-editor/VideoDesigncomboStage.tsx (facade, not the vendor engine)",
    load: false,
    mutate: false,
    undoRedo: false,
    save: false,
    reopen: false,
    export: false,
  };
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(`${EVIDENCE_DIR}/offline.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(
    `${EVIDENCE_DIR}/license-red.txt`,
    `${evidence.reason}\n`,
  );
  assert.equal(evidence.verdict, "RED");
});
