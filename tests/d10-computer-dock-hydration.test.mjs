import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const savedCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (savedCanvas) require.cache[canvasEntry] = savedCanvas;
else delete require.cache[canvasEntry];
const apiStub = dataModule(`
  export const cloudComputerApi = { listComputers() { return new Promise(() => {}); } };
  export const isMountable = () => true;
  export const readMountedComputerId = () => typeof window === "undefined" ? "" : window.localStorage.getItem("mounted-id") || "";
  export const readMountedComputerName = () => typeof window === "undefined" ? "" : window.localStorage.getItem("mounted-name") || "";
  export function writeMountedComputerId(value) { window.localStorage.setItem("mounted-id", value || ""); }
  export function writeMountedComputerName(value) { window.localStorage.setItem("mounted-name", value || ""); }
`);
const dialogs = dataModule("export function CreateComputerDialog() { return null; } export function ConnectServerDialog() { return null; }");
const { ComputerDock } = await import(await compileModule("src/shell/cloud-computer/ComputerDock.tsx", {
  "../../lib/cloud-computer-api": apiStub,
  "../../i18n/ui/useUI": dataModule("export function useUI() { return value => value; }"),
  "../../contracts/domain-family": dataModule('export function currentDomainFamily() { return "com"; }'),
  "./server-page/href": dataModule('export function devicesCloudHref() { return "/devices"; } export function serverPageHref(id) { return "/server/" + id; }'),
  "next/navigation": dataModule("export function useRouter() { return { push() {} }; }"),
  "./CreateComputerDialog": dialogs,
  "./ConnectServerDialog": dialogs,
  "../anchored-popover": dataModule("export function AnchoredPopover() { return null; }"),
}));
const { useCloudComputers } = await import(await compileModule("src/shell/cloud-computer/useCloudComputers.ts", {
  "../../lib/cloud-computer-api": apiStub,
}));

test("D10: hydration first frame neither reads nor renders the browser list cache", async () => {
  const frames = [];
  let cacheReads = 0;
  function Probe() {
    const { computers, loading } = useCloudComputers();
    const frame = { ids: computers.map(item => item.id), loading, cacheReads };
    frames.push(frame);
    return React.createElement("span", null, loading ? "Loading" : frame.ids.join(","));
  }
  const element = React.createElement(Probe);
  const html = renderToString(element);
  const serverFrame = frames[0];
  assert.deepEqual(serverFrame, { ids: [], loading: true, cacheReads: 0 });
  const dom = new JSDOM(`<div id="root">${html}</div>`, { url: "https://hydration.test/" });
  dom.window.sessionStorage.setItem("oceanleo.computers.list.v1", JSON.stringify([{
    id: "cached-pc", name: "Cached PC", source: "byo", status: "active", edition: "com",
    node_online: true, enrolled_at: "t", confirmed_at: "t", created_at: "t", updated_at: "t",
  }]));
  const storageGetItem = dom.window.Storage.prototype.getItem;
  dom.window.Storage.prototype.getItem = function (key) {
    if (this === dom.window.sessionStorage && key === "oceanleo.computers.list.v1") cacheReads++;
    return storageGetItem.call(this, key);
  };
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  let root;
  try {
    frames.length = 0;
    const { hydrateRoot } = await import("react-dom/client");
    const host = dom.window.document.getElementById("root");
    await act(async () => { root = hydrateRoot(host, element, { onRecoverableError: error => errors.push(String(error)) }); });
    assert.deepEqual(frames[0], serverFrame, "hydration starts with the same state as SSR without reading storage");
    assert.deepEqual(frames.at(-1).ids, ["cached-pc"]);
    assert.equal(frames.at(-1).loading, false, "cached data must appear without waiting for the pending API request");
    assert.equal(cacheReads, 1);
    assert.equal(host.textContent, "cached-pc");
    assert.deepEqual(errors, []);
  } finally {
    if (root) await act(async () => root.unmount());
    console.error = originalError;
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

for (const cached of [false, true]) {
  test(`D10: ComputerDock hydrates with a remembered name${cached ? " and a cached computer list" : ""}`, async () => {
    // SSR cannot read browser storage. Hydration sees it but must first render SSR's placeholder.
    const element = React.createElement(ComputerDock);
    const html = renderToString(element);
    const dom = new JSDOM(`<div id="root">${html}</div>`, { url: "https://hydration.test/" });
    dom.window.localStorage.setItem("mounted-id", "pc-1");
    dom.window.localStorage.setItem("mounted-name", "Remembered PC");
    if (cached) {
      dom.window.sessionStorage.setItem("oceanleo.computers.list.v1", JSON.stringify([{
        id: "pc-1", name: "Remembered PC", source: "aliyun", status: "running",
        edition: "com", node_online: true, enrolled_at: "2026-09-26T00:00:00Z", confirmed_at: "2026-09-26T00:00:00Z",
        created_at: "2026-09-26T00:00:00Z", updated_at: "2026-09-26T00:00:00Z",
      }]));
    }
    const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args.map(String).join(" "));
    let root;
    try {
      const { hydrateRoot } = await import("react-dom/client");
      const host = dom.window.document.getElementById("root");
      await act(async () => { root = hydrateRoot(host, element, { onRecoverableError: error => errors.push(String(error)) }); });
      assert.deepEqual(errors, [], "browser-only storage must not change the first hydration render");
      assert.match(host.textContent, /Remembered PC/, "restore the remembered name after mounting even while the network waits");
      assert.equal(Boolean(host.querySelector("[data-oceanleo-cc-dock-waiting]")), !cached);
      assert.equal(Boolean(host.querySelector("[data-oceanleo-cc-dock-mounted]")), cached);
      assert.equal(host.textContent.includes("接入云电脑"), false);
    } finally {
      if (root) await act(async () => root.unmount());
      console.error = originalError;
      dom.window.close();
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
}
