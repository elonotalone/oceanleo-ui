// 工作台货架：没有 All/Mine 开关，pile 默认 all，?pile=mine 仅看收藏。

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

test("WorkspaceDesk 没有 All/Mine 开关，parseWorkspacePile 默认 all", () => {
  assert.doesNotMatch(desk, /WorkspacePileSwitch/);
  assert.doesNotMatch(desk, /tt\("全部"\)/);
  assert.doesNotMatch(desk, /tt\("我的"\)/);
  assert.match(desk, /export type WorkspacePile = "all" \| "mine"/);
  assert.match(desk, /value === "mine" \? "mine" : "all"/);
  assert.match(desk, /favoritesOnly/);
  assert.doesNotMatch(withoutComments(desk), /My workspace/i);
  assert.doesNotMatch(withoutComments(desk), /tt\("Playground"\)/);
});

test("WorkspaceDesk 只挂 PlaygroundDetail，并导出", () => {
  assert.match(desk, /<PlaygroundDetail/);
  assert.doesNotMatch(withoutComments(desk), /<WorkspaceDetail/);
  assert.match(index, /export \{ WorkspaceDesk, parseWorkspacePile \} from "\.\/WorkspaceDesk"/);
});

test("查看选项有仅看收藏；Playground / Workspace 源码无 organization/workflow 分区按钮", () => {
  assert.match(playground, /仅看收藏|favoritesOnly/);
  assert.match(playground, /CollectionFilterSelect/);
  assert.match(workspace, /CollectionFilterSelect/);
  assert.match(playground, /name="section"/);
  assert.match(workspace, /name="section"/);
  assert.doesNotMatch(withoutComments(playground), /label: "organization"/);
  assert.doesNotMatch(withoutComments(playground), /label: "workflow"/);
  assert.doesNotMatch(withoutComments(workspace), /label: "organization"/);
  assert.doesNotMatch(withoutComments(workspace), /label: "workflow"/);
  assert.doesNotMatch(withoutComments(playground), /hasBoard/);
  assert.doesNotMatch(withoutComments(workspace), /id: "organization"/);
  assert.doesNotMatch(withoutComments(workspace), /id: "workflow"/);
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
