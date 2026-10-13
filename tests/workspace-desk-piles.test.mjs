// 工作台两堆：页顶开关是「全部」「我的」，pile 只有 all|mine，侧栏不再画 playground。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { navEntries } from "../src/shell/nav-source/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
function source(rel) {
  return readFileSync(join(here, "..", srcPath(rel)), "utf8");
}
function srcPath(rel) {
  return rel.startsWith("src/") ? rel : join("src", rel);
}

const desk = source("src/shell/WorkspaceDesk.tsx");
const playground = source("src/shell/Playground.tsx");
const workspace = source("src/shell/WorkspaceMasterDetail.tsx");
const index = source("src/shell/index.ts");

function withoutComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("WorkspaceDesk 开关文案是「全部」「我的」，没有 My workspace", () => {
  assert.match(desk, /tt\("全部"\)/);
  assert.match(desk, /tt\("我的"\)/);
  assert.match(desk, /export type WorkspacePile = "all" \| "mine"/);
  assert.match(desk, /value === "all" \? "all" : "mine"/);
  assert.doesNotMatch(withoutComments(desk), /My workspace/i);
  assert.doesNotMatch(withoutComments(desk), /tt\("Playground"\)/);
});

test("WorkspaceDesk 挂 PlaygroundDetail / WorkspaceDetail，并导出", () => {
  assert.match(desk, /<PlaygroundDetail/);
  assert.match(desk, /<WorkspaceDetail/);
  assert.match(desk, /pile === "all"|resolved === "all"/);
  assert.match(index, /export \{ WorkspaceDesk, parseWorkspacePile \} from "\.\/WorkspaceDesk"/);
});

test("两份 detail 页标题是工作台，不再自称 Playground", () => {
  assert.match(playground, /tt\("工作台"\)/);
  assert.doesNotMatch(withoutComments(playground), /tt\("Playground"\)/);
  assert.match(workspace, /tt\("工作台"\)/);
  assert.doesNotMatch(withoutComments(workspace), /去 Playground/);
  assert.doesNotMatch(withoutComments(workspace), /addAgentHref = "\/playground"/);
});

test("侧栏默认集合没有 playground；withPlayground 开了也不出", () => {
  for (const scope of ["workspace", "portal"]) {
    const defaults = navEntries(scope).map((e) => e.id);
    assert.ok(!defaults.includes("playground"), `${scope} 默认`);
    const forced = navEntries(scope, { withPlayground: true }).map((e) => e.id);
    assert.ok(!forced.includes("playground"), `${scope} withPlayground: true`);
  }
});
