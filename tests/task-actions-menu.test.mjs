import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;

const menu = await import(await compileModule("src/shell/TaskActionsMenu.tsx", {
  "../contracts/domain-family": dataModule(`export function runtimePageOrigin(){return "https://oceanleo.test";}`),
  "../i18n/ui/useUI": dataModule(`export function useUI(){return (s)=>s;}`),
  "../ui/Toast": dataModule(`export function useToast(){return {success(){}};}`),
  "../ui/menu/FloatingMenu": dataModule(`
    export function FloatingMenu(p){ return p.open ? globalThis.React.createElement("div", {role:"menu"}, p.children) : null; }
    export function FloatingMenuItem(p){ return globalThis.React.createElement("button", {type:"button"}, p.label); }
    export function FloatingMenuSeparator(){ return globalThis.React.createElement("hr"); }
  `),
}));

async function render(props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(menu.TaskActionsMenu, props)));
  return { host, async close(){ await act(async () => root.unmount()); host.remove(); } };
}

test("cloud and computer task headers expose the same action labels", async () => {
  const chatSource = fs.readFileSync(path.resolve("src/shell/AgentChat.tsx"), "utf8");
  const taskPage = fs.readFileSync(path.resolve("../oceanleo/app/tasks/[id]/page.tsx"), "utf8");
  assert.match(chatSource, /taskId && \(\s*<TaskActionsMenu/);
  assert.match(taskPage, /taskActions=\{taskActions\}/);
  assert.match(taskPage, /function RenameTaskDialog/);
  assert.match(taskPage, /event\.key === "Escape"/);
  assert.doesNotMatch(taskPage, /window\.prompt/);
  const props = {
    open: true, onOpenChange(){}, href: "/tasks/123e4567-e89b-12d3-a456-426614174000",
    taskId: "123e4567-e89b-12d3-a456-426614174000", taskTitle: "Quoted", canDelete: true,
  };
  const cloud = await render(props);
  const native = await render({ ...props, href: "/tasks/123e4567-e89b-12d3-a456-426614174001", taskId: "123e4567-e89b-12d3-a456-426614174001" });
  try {
    const labels = (host) => [...host.querySelectorAll("button")].map((node) => node.textContent);
    const expected = ["在新标签打开", "复制链接", "分享", "在新任务中引用", "重命名", "置顶", "收藏", "移动到项目", "删除"];
    assert.deepEqual(labels(cloud.host).slice(-expected.length), expected);
    assert.deepEqual(labels(native.host).slice(-expected.length), expected);
  } finally { await cloud.close(); await native.close(); }
});
