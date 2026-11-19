import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import React, {act} from "react";
import {document, window} from "./helpers/remote-desktop-dom.mjs";
import {compileModule, dataModule} from "./helpers/module-bench.mjs";
import {LOCALES} from "../src/i18n/config.ts";
import {UI_MESSAGES} from "../src/i18n/ui/messages/index.ts";

const {createRoot} = await import("react-dom/client");
const {DeviceSettingsSection, DeviceSettingsPanel} = await import(await compileModule("src/pages/settings/DeviceSettingsSection.tsx", {
  "../../i18n/ui/useUI": dataModule('export function useUI() { return (key) => globalThis.__dsCopy[key] ?? key; }'),
}));
const {CARD, CARD_DESC, FIELD} = await import(await compileModule("src/pages/settings/personalization/parts.tsx"));
const device = {device_id: "layout-mac", device_name: "My Mac", platform: "macos", availability: "online"};
const second = {...device, device_id: "layout-pc", device_name: "My PC"};
const server = {id: "layout-cloud", name: "Cloud test", source: "aliyun", status: "stopped", node_online: false};
const allowance = {enabled: false, currency: "USD", monthly_cap_minor: 10000, max_hourly_minor: null, max_servers: null, committed_minor: 2000, remaining_minor: 8000};
const settings = {controller_id: "viewer", availability: "online", preferences_available: true, controllers: [], roots: [], preferences: {default_task_directory: "/work", task_folders: ["/work/project"]}, remote_access: {enabled: true, input_allowed: true, agent_control_allowed: true, agent_always_ask: true, expires_at: null}};
const settingsClient = {getSettings: async () => ({ok: true, data: structuredClone(settings)})};
const serverClient = {listComputers: async () => ({items: [server]}), getServerAllowance: async () => allowance, listComputerEvents: async () => ({items: []})};
const pageProps = {client: {listDevices: async () => ({ok: true, data: [device, second]})}, settingsClient, serverClient, currentUser: async () => ({known: true, userId: "layout-test"})};
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => {}); };

async function mount(Component = DeviceSettingsSection, props = pageProps) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  await flush();
  return {host, cleanup() {act(() => root.unmount()); host.remove();}};
}
async function click(node) {
  assert.ok(node);
  await act(async () => node.dispatchEvent(new window.MouseEvent("click", {bubbles: true})));
  await flush();
}

test.beforeEach((t) => {
  globalThis.__dsCopy = UI_MESSAGES.zh;
  window.history.replaceState(null, "", "/settings/devices");
  t.mock.method(globalThis, "fetch", async () => { assert.fail("layout tests must never contact a real service"); });
  t.mock.method(console, "error", (...args) => {assert.fail(args.map(String).join(" "));});
});
test.afterEach(() => {delete globalThis.__dsCopy;});

test("all 17 locales render settings cards with at most one hint sentence and shared controls", async () => {
  for (const locale of LOCALES) {
    globalThis.__dsCopy = UI_MESSAGES[locale];
    const view = await mount();
    try {
      const cards = [...view.host.querySelectorAll("section")].filter((node) => node.className === CARD);
      assert.equal(cards.length, 5, locale);
      for (const card of cards) {
        const hints = [...card.querySelectorAll("p")].filter((node) => node.className === CARD_DESC);
        assert.ok(hints.length <= 1, `${locale}: ${card.querySelector("h3")?.textContent}`);
        for (const hint of hints) assert.ok((hint.textContent.match(/[.!?。！？।]/gu) ?? []).length <= 1, `${locale}: ${hint.textContent}`);
      }
      assert.equal(view.host.querySelectorAll("select").length, 0, locale);
      assert.equal(view.host.querySelectorAll('[data-device-access-settings] [role="switch"]').length, 4);
      const numberInputs = [...view.host.querySelectorAll('input[type="number"]')];
      assert.equal(numberInputs.length, 3);
      for (const input of numberInputs) {
        assert.ok(input.className.startsWith(FIELD), locale);
        assert.ok(input.closest("label").classList.contains("border-neutral-200"), locale);
      }
      for (const control of view.host.querySelectorAll('[data-device-access-settings] [role="switch"]')) {
        assert.ok(control.parentElement.classList.contains("border-neutral-200"), locale);
        assert.ok(control.parentElement.classList.contains("justify-between"), locale);
      }
    } finally {view.cleanup();}
  }
});

for (const [availability, ready, expected] of [["offline", true, "这台电脑不在线。"], ["signed_out", true, "这台电脑尚未登录。"], ["online", false, "等待设备同步…"]]) {
  test(`${availability}/${ready}: availability warning appears once for access and folders`, async () => {
    const view = await mount(DeviceSettingsPanel, {device, availability, client: {getSettings: async () => ({ok: true, data: {...settings, availability, preferences_available: ready}})}, onControl() {}, onRename: async () => true, onRevoke() {}});
    try {
      assert.equal(view.host.textContent.split(expected).length - 1, 1);
      assert.equal(view.host.querySelector('[role="status"]').textContent, expected);
      assert.equal(view.host.querySelector('[data-device-access-settings] [aria-label="每次询问"]').disabled, true);
      assert.equal(view.host.querySelector('[aria-label="允许远程 Agent 控制"]').disabled, false, "withdrawal remains available");
    } finally {view.cleanup();}
  });
}

test("an offline error keeps read recovery and the last confirmed access state", async () => {
  const view = await mount(DeviceSettingsPanel, {device, availability: "offline", client: {...settingsClient, startOperation: async () => ({ok: false, error: "device_offline"})}, onControl() {}, onRename: async () => true, onRevoke() {}});
  try {
    await click(view.host.querySelector('[aria-label="允许远程 Agent 控制"]'));
    assert.ok(view.host.querySelector('[data-auto-recovery="temporary"][aria-busy="true"]'));
    assert.equal(view.host.querySelector('[data-auto-recovery] button'), null);
    assert.equal(view.host.querySelector('[aria-label="允许远程 Agent 控制"]').getAttribute("aria-checked"), "true");
  } finally {view.cleanup();}
});

test("the shared device picker switches devices and cloud servers, preserving URL selection", async () => {
  const view = await mount();
  try {
    const trigger = () => view.host.querySelector('[data-collection-filter="device-settings-device"]');
    assert.equal(trigger().getAttribute("aria-haspopup"), "listbox");
    assert.ok(trigger().parentElement.classList.contains("[&>button]:max-w-full"), "long names stay within the control side of the settings row");
    await click(trigger());
    let menu = document.querySelector('[role="listbox"]');
    assert.ok(menu);
    assert.match(menu.textContent, /云电脑 · Cloud test/);
    await click([...menu.querySelectorAll('[role="option"]')].find((node) => node.textContent.includes("My PC")));
    assert.equal(new URL(window.location.href).searchParams.get("device"), second.device_id);
    assert.ok(view.host.querySelector('[data-device-settings-panel="layout-pc"]'));
    assert.equal(document.querySelector('[role="listbox"]'), null);
    await act(async () => trigger().dispatchEvent(new window.KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true})));
    await flush();
    menu = document.querySelector('[role="listbox"]');
    assert.ok(menu);
    const search = menu.querySelector("input");
    assert.ok(search);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(search, "Cloud test");
      search.dispatchEvent(new window.Event("input", {bubbles: true}));
    });
    await flush();
    assert.equal(menu.querySelectorAll('[role="option"]').length, 1);
    await act(async () => search.dispatchEvent(new window.KeyboardEvent("keydown", {key: "Enter", bubbles: true})));
    await flush();
    assert.equal(new URL(window.location.href).searchParams.get("device"), server.id);
    assert.ok(view.host.querySelector('[data-server-settings="layout-cloud"]'));
    assert.equal(view.host.querySelector('[data-device-settings-panel]'), null);
    assert.equal(document.activeElement, trigger());
  } finally {view.cleanup();}
});

test("retired hints are absent from every locale and their source dictionaries", () => {
  const removed = [
    "管理每台设备的访问权限、Agent 控制和任务文件夹。",
    "自己的账号访问这台设备会直接连接。远程访问和云端助手的权限在这里设置。",
    "开启即表示同意，直到你关闭。关闭后撤销权限，离线设备会在重新连接后同步。",
    "开启后，Agent 每次申请都会在这台电脑上等待确认。",
    "只有你能授权预算。Agent 可在额度内购买、开停机和续费；释放仍由你确认。",
    "按量和抢占式按每月最多 744 小时预留，包含固定 1 Mbps 带宽。停机仍保留磁盘预算；包月按完整期限一次预留。关闭授权后不再允许新的购买和续费，已有费用继续保留。",
  ];
  for (const locale of LOCALES) {
    for (const key of removed) assert.equal(Object.hasOwn(UI_MESSAGES[locale], key), false, `${locale}: ${key}`);
    assert.ok(UI_MESSAGES[locale]["仅你能授权预算，释放服务器仍需你确认。"], locale);
  }
  for (const file of ["device-experience-copy.ts", "build-1103-gap-copy.ts", "purchase-copy.ts", "server-allowance-copy-a.ts", "server-allowance-copy-b.ts"]) {
    const source = readFileSync(new URL(`../src/i18n/ui/messages/${file}`, import.meta.url), "utf8");
    for (const key of removed) assert.ok(!source.includes(key), `${file}: ${key}`);
  }
});
