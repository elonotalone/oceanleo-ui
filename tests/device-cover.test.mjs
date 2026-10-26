import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { document, window } from "./helpers/remote-desktop-dom.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const ui = dataModule(`export function useUI() { return (text) => text; }`);
const { DeviceCover } = await import(await compileModule("src/pages/devices/DeviceCover.tsx", { "../../i18n/ui/useUI": ui }));
const { parseDeviceCover } = await import(await compileModule("src/api/device-settings.ts"));
const now = Math.floor(Date.now() / 1000);
const wallpaper = { state: "available", image: "data:image/jpeg;base64,/9j/2Q==", width: 960, height: 600, observed_at: now };
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => {}); };

test("cover parser rejects public URLs, SVG, paths, oversized data and false dimensions", () => {
  assert.deepEqual(parseDeviceCover(wallpaper), wallpaper);
  for (const invalid of [{ image: "https://public.invalid/private.jpg" }, { image: "file:///private.jpg" },
    { image: "data:image/svg+xml;base64,/9j/2Q==" }, { image: "data:image/jpeg;base64,/9j/" + "A".repeat(262144) },
    { width: 961 }, { height: 0 }, { observed_at: now + 1000 }]) {
    assert.equal(parseDeviceCover({ ...wallpaper, ...invalid }), null);
  }
});

test("cover reads wallpaper only on an online computer, retains timestamp offline, clears on signout", async () => {
  const calls = [];
  const client = { async startOperation(id, payload, signal) { calls.push({ id, payload, signal }); return { ok: true, data: { state: "succeeded", result: { cover: wallpaper } } }; } };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  async function render(availability, props = {}) { await act(async () => root.render(React.createElement(DeviceCover, { deviceId: "mac", client, availability, ...props }))); await flush(); }
  try {
    await render("offline");
    assert.equal(calls.length, 0);
    assert.match(host.textContent, /暂无桌面壁纸/);
    await render("online");
    assert.deepEqual(calls.map(({ id, payload }) => [id, payload]), [["mac", { kind: "cover.read" }]]);
    assert.equal(host.querySelector("img").getAttribute("src"), wallpaper.image);
    assert.equal(host.querySelector("time").getAttribute("datetime"), new Date(now * 1000).toISOString());
    await render("offline");
    assert.equal(host.querySelector("[data-device-cover-state]").getAttribute("data-device-cover-state"), "last-known");
    assert.match(host.textContent, /上次壁纸/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].signal.aborted, true);
    await render("signed_out");
    assert.equal(host.querySelector("img"), null);
    assert.equal(calls.length, 1);
    await render("online", { phone: true });
    assert.equal(calls.length, 1, "phones never request wallpaper/desktop capabilities");
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test("late cover from a different target cannot replace the current target", async () => {
  let finish;
  const client = { startOperation(id) { return id === "old" ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve({ ok: true, data: { state: "succeeded", result: { cover: { state: "unavailable", reason: "headless", observed_at: now } } } }); } };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(DeviceCover, { deviceId: "old", client, availability: "online" })));
    await act(async () => root.render(React.createElement(DeviceCover, { deviceId: "new", client, availability: "online" })));
    await act(async () => finish({ ok: true, data: { state: "succeeded", result: { cover: wallpaper } } }));
    await flush();
    assert.equal(host.querySelector("img"), null);
    assert.match(host.textContent, /此设备没有桌面壁纸/);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
