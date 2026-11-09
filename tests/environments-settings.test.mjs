import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { document, window } from "./helpers/remote-desktop-dom.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const ui = dataModule(`export function useUI() { return (text, vars) => String(text).replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{"+key+"}")); }`);
const parts = dataModule(`export const CARD = "card"; export const CARD_DESC = "desc"; export const CARD_TITLE = "title"; export const QUIET = "quiet";`);
const api = dataModule(`
  export const environmentApi = {
    async listEnvironments() { return globalThis.__envBench.catalog; },
    async installEnvironment(_computerId, itemId) { globalThis.__envBench.installs.push(itemId); return globalThis.__envBench.job; },
    async getEnvironmentInstallJob() { return globalThis.__envBench.job; },
    async detectEnvironments() { globalThis.__envBench.detects += 1; return { found: ["node"], missing: ["flutter"] }; },
    async askAgentToInstall(_computerId, itemId) { globalThis.__envBench.agents.push(itemId); return { task_id: "task-1" }; },
  };
`);
const { EnvironmentCard } = await import(await compileModule("src/pages/settings/server-environments/EnvironmentCard.tsx", {
  "../../../i18n/ui/useUI": ui,
  "../personalization/parts": parts,
  "./api": api,
}));

function bench(job = { job_id: "job-1", item_id: "node", status: "failed", lines: ["下载中"], error_tail: ["checksum mismatch"], started_at: "", finished_at: "" }) {
  globalThis.__envBench = {
    installs: [], agents: [], detects: 0,
    catalog: { groups: [{ id: "website", title: "网站", items: [{ id: "node", title: "Node.js LTS + pnpm", summary: "构建网站", version: "v22", size_mb: 180, installed: false }] }] },
    job,
  };
  return globalThis.__envBench;
}

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function mount(props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(EnvironmentCard, props)));
  await flush();
  return { host, cleanup: () => { act(() => root.unmount()); host.remove(); } };
}

test("settings card exposes loading, install failure, progress tail, agent handoff and detection states", async () => {
  const state = bench();
  const view = await mount({ computerId: "computer-1", online: true });
  try {
    assert.match(view.host.textContent, /Node\.js LTS \+ pnpm/);
    const install = [...view.host.querySelectorAll("button")].find((node) => node.textContent.trim() === "安装");
    assert.ok(install);
    await act(async () => install.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await flush();
    assert.match(view.host.textContent, /checksum mismatch/);
    const handoff = [...view.host.querySelectorAll("button")].find((node) => node.textContent.trim() === "让 agent 处理");
    assert.ok(handoff);
    await act(async () => handoff.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await flush();
    assert.deepEqual(state.agents, ["node"]);
    const input = view.host.querySelector("input");
    input.value = "/srv/project";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await flush();
    const detect = [...view.host.querySelectorAll("button")].find((node) => node.textContent.trim() === "检测");
    assert.ok(detect);
    await act(async () => detect.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await flush();
    assert.equal(state.detects, 1);
    assert.match(view.host.textContent, /已找到 1 项/);
  } finally { view.cleanup(); }
});

test("server settings owns the development environment card and copy includes iOS guidance", () => {
  const panel = readFileSync(new URL("../src/pages/settings/ServerSettingsPanel.tsx", import.meta.url), "utf8");
  const copy = readFileSync(new URL("../src/i18n/ui/messages/environments-copy.ts", import.meta.url), "utf8");
  assert.match(panel, /<EnvironmentCard/);
  assert.match(copy, /iOS builds require a Mac/);
  assert.match(copy, /EAS CLI/);
  assert.doesNotMatch(copy, /expo-cli/);
  assert.match(copy, /让 agent 处理/);
});
