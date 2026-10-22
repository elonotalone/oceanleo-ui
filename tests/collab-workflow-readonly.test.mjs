// F13：流程图指令面在只读时挡住 Leo 的改图指令；可编辑时与未包装一致。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  VIEW_ONLY_REFUSAL,
  guardPluginSurface,
} from "../src/shell/collab/adapters/visual-readonly.ts";

const src = readFileSync(
  new URL("../src/shell/workflow-carrier/VideoCanvasStage.tsx", import.meta.url),
  "utf8",
);

function fakeSurface() {
  const ran = [];
  const raw = {
    editorId: "workflow",
    describe: () => [
      {
        id: "workflow.add-node",
        label: "加节点",
        summary: "在流程图上加一个节点",
        mutates: true,
      },
    ],
    state: () => ({ revision: 1, nodes: 2 }),
    run: (id, params) => {
      ran.push([id, params]);
      return { ok: true, message: "wrote", revision: 2 };
    },
  };
  return { raw, ran };
}

test("VideoCanvasStage 把流程图指令面交给 guardPluginSurface(collabReadOnly)", () => {
  assert.match(
    src,
    /import \{ guardPluginSurface \} from "\.\.\/collab\/adapters\/visual-readonly"/,
  );
  assert.match(
    src,
    /usePluginCommandSurface\(\s*useMemo\(\s*\(\) =>\s*guardPluginSurface\(/,
  );
  assert.match(
    src,
    /guardPluginSurface\(\s*\{[\s\S]*editorId:\s*WORKFLOW_EDITOR_ID[\s\S]*\},\s*collabReadOnly,/,
  );
  const dependencies = src.match(/collabReadOnly,\s*\),\s*\[([^\]]+)\],\s*\),\s*\);/);
  assert.ok(dependencies, "the guarded surface must retain its own memo dependency list");
  const names = dependencies[1].split(",").map((name) => name.trim()).filter(Boolean);
  for (const name of ["chipsManifest.chips", "editRevision", "graph", "collabReadOnly", "commitGraph"]) {
    assert.ok(names.includes(name), `guarded surface must refresh when ${name} changes`);
  }
});

test("只读：mutates 指令被拒且不调用原 run；非只读原样转发", async () => {
  const blockedPack = fakeSurface();
  const blocked = guardPluginSurface(blockedPack.raw, true);
  const refused = await blocked.run("workflow.add-node", { proposedGraph: { nodes: [] } });
  assert.equal(refused.ok, false);
  assert.equal(refused.message, VIEW_ONLY_REFUSAL);
  assert.deepEqual(blockedPack.ran, [], "只读时不得进入原 run（不生成审阅、不改本地图）");

  const openPack = fakeSurface();
  assert.equal(guardPluginSurface(openPack.raw, false), openPack.raw);
  const forwarded = await guardPluginSurface(openPack.raw, false).run("workflow.add-node", {
    proposedGraph: { nodes: [] },
  });
  assert.deepEqual(openPack.ran, [["workflow.add-node", { proposedGraph: { nodes: [] } }]]);
  assert.equal(forwarded.ok, true);
  assert.equal(forwarded.message, "wrote");
  assert.equal(forwarded.revision, 2);
});
