// Node/jsdom behavioral checks only; no browser or visual automation.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act, useState } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { deadlineMs, zonedParts, zonedToInstant } from "../src/shell/bay/form/bay-deadline.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];
const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true, url: "https://test.invalid/bay",
});
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLButtonElement", "Element", "Node", "Event", "MouseEvent"]) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "window" ? window : window[name] });
}
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: window.localStorage });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const stubs = {
  "../../../i18n/ui/useUI": dataModule("export function useUI(){return x=>x}"),
  "next-intl": dataModule("export function useLocale(){return 'en'}"),
};
const { BayDeadlineField } = await import(await compileModule("src/shell/bay/form/BayDeadlineField.tsx", stubs));
const { BayChoice } = await import(await compileModule("src/shell/bay/form/BayChoice.tsx"));
const { BayRevealForm } = await import(await compileModule("src/shell/bay/form/BayRevealForm.tsx", stubs));
const { BayAutoTextarea } = await import(await compileModule("src/shell/bay/form/BayAutoTextarea.tsx"));
const h = React.createElement;

async function mount(Component, props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const rerender = async next => { await act(async () => root.render(h(Component, next))); };
  await rerender(props);
  return { host, rerender, async close() { await act(async () => root.unmount()); host.remove(); } };
}
async function click(node) { assert.ok(node); await act(async () => node.click()); }
async function setInput(node, value) {
  await act(async () => {
    const proto = node.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value);
    node.dispatchEvent(new window.Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
const parts = (year, month, day, hour, minute = 30, second = 5) => ({ year, month, day, hour, minute, second });

test("DST gaps move forward, overlaps choose first occurrence, invalid days are rejected", () => {
  for (const [wall, zone, iso] of [
    [parts(2026, 3, 8, 2), "America/New_York", "2026-03-08T07:30:05.000Z"],
    [parts(2026, 11, 1, 1), "America/New_York", "2026-11-01T05:30:05.000Z"],
    [parts(2026, 3, 29, 1), "Europe/London", "2026-03-29T01:30:05.000Z"],
    [parts(2026, 10, 25, 1), "Europe/London", "2026-10-25T00:30:05.000Z"],
    [parts(2026, 10, 4, 2, 15), "Australia/Lord_Howe", "2026-10-03T15:45:05.000Z"],
    [parts(2011, 12, 30, 12), "Pacific/Apia", "2011-12-30T22:30:05.000Z"],
  ]) assert.equal(new Date(zonedToInstant(wall, zone)).toISOString(), iso);
  assert.ok(Number.isNaN(zonedToInstant(parts(2026, 2, 30, 12), "UTC")));
  assert.ok(Number.isNaN(zonedToInstant(parts(2026, 1, 1, 24), "UTC")));
  assert.equal(deadlineMs("2026-02-30"), null);
  assert.equal(new Date(zonedToInstant(parts(2028, 2, 29, 12), "Asia/Kathmandu")).toISOString(), "2028-02-29T06:45:05.000Z");
});

function ControlledDeadline({ initial, disabled, changes }) {
  const [value, setValue] = useState(initial);
  return h(BayDeadlineField, { value, disabled, onChange: next => { changes.push(next); setValue(next); } });
}

test("calendar leap days and year navigation preserve seconds; timezone switching preserves the instant", async () => {
  localStorage.setItem("oceanleo.bay.deadline-zone", "UTC");
  const changes = [];
  const m = await mount(ControlledDeadline, { initial: "2028-02-28T12:34:56Z", changes });
  try {
    await click(m.host.querySelector("[data-bay-deadline-trigger]"));
    assert.equal(m.host.querySelectorAll("[data-bay-deadline-day]").length, 29);
    await click(m.host.querySelector('[data-bay-deadline-day="29"]'));
    assert.equal(changes.at(-1), "2028-02-29T12:34:56.000Z");
    await setInput(m.host.querySelector("[data-bay-deadline-zone]"), "Asia/Shanghai");
    assert.equal(changes.length, 1, "zone is a viewing/editing preference, not a new instant");
    assert.match(m.host.querySelector("[data-bay-deadline-trigger]").textContent, /2028-02-29 20:34:56 UTC\+8/);
    assert.match(m.host.querySelector("[data-bay-deadline-check]").textContent, /UTC：2028-02-29 12:34:56/);
    assert.equal(localStorage.getItem("oceanleo.bay.deadline-zone"), "Asia/Shanghai");
    // Explicit selection of the device's zone must still exist in the dropdown.
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    assert.ok([...m.host.querySelector("select").options].some(o => o.value === device));
  } finally { await m.close(); }
  const n = await mount(ControlledDeadline, { initial: "2026-12-31T00:00:00Z", changes: [] });
  try {
    await click(n.host.querySelector("[data-bay-deadline-trigger]"));
    await click(n.host.querySelector('[aria-label="下个月"]'));
    assert.match(n.host.querySelector("[data-bay-deadline-month]").textContent, /January 2027/);
    await click(n.host.querySelector('[aria-label="上个月"]'));
    assert.match(n.host.querySelector("[data-bay-deadline-month]").textContent, /December 2026/);
  } finally { await n.close(); }
});

test("HH:MM:SS accepts successive digits, clamps ranges, wraps arrows and pads on blur", async () => {
  localStorage.setItem("oceanleo.bay.deadline-zone", "UTC");
  const changes = [];
  const m = await mount(ControlledDeadline, { initial: "2026-10-20T00:00:00Z", changes });
  try {
    await click(m.host.querySelector("[data-bay-deadline-trigger]"));
    const hour = m.host.querySelector('[aria-label="时"]');
    await setInput(hour, "1");
    assert.equal(hour.value, "1", "must not insert a leading zero before the second digit");
    await setInput(hour, "12");
    assert.equal(changes.at(-1), "2026-10-20T12:00:00.000Z");
    await setInput(hour, "99");
    assert.equal(hour.value, "23");
    await act(async () => hour.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    assert.equal(changes.at(-1), "2026-10-20T00:00:00.000Z");
    await setInput(m.host.querySelector('[aria-label="分"]'), "59");
    await setInput(m.host.querySelector('[aria-label="秒"]'), "7");
    const second = m.host.querySelector('[aria-label="秒"]');
    await act(async () => { second.focus(); second.blur(); });
    assert.equal(second.value, "07");
    assert.equal(changes.at(-1), "2026-10-20T00:59:07.000Z");
    await m.rerender({ initial: "2026-10-20T00:00:00Z", changes, disabled: true });
    assert.equal(m.host.querySelector("fieldset").disabled, true);
    const count = changes.length;
    await click(m.host.querySelector('[data-bay-deadline-day="21"]'));
    await click(m.host.querySelector("[data-bay-deadline-clear]"));
    assert.equal(changes.length, count, "already-open panel must lock when disabled");
  } finally { await m.close(); }
});

test("choices start expanded, collapse after selection and reopen without firing a change", async () => {
  const changes = [];
  function Choice() {
    const [value, setValue] = useState("a");
    return h(BayChoice, { value, collapsible: true, options: [{ value: "a", title: "A" }, { value: "b", title: "B" }],
      onChange: v => { changes.push(v); setValue(v); } });
  }
  const m = await mount(Choice, {});
  try {
    assert.equal(m.host.querySelectorAll("button").length, 2);
    await click(m.host.querySelector('[data-bay-choice-option="b"]'));
    assert.equal(m.host.querySelectorAll("button").length, 1);
    assert.ok(m.host.querySelector("[data-bay-choice-chevron]"));
    await click(m.host.querySelector("button"));
    assert.equal(m.host.querySelectorAll("button").length, 2);
    assert.deepEqual(changes, ["b"]);
    await click(m.host.querySelector('[data-bay-choice-option="a"]'));
    assert.deepEqual(changes, ["b", "a"]);
  } finally { await m.close(); }
});

test("auto textarea fits uncontrolled input, padding/borders, and reopening a hidden group", async () => {
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(node) { this.node = node; }
    disconnect() { this.disconnected = true; }
  };
  let scroll = 48, width = 200, inputEvents = 0, focusEvents = 0;
  const scrollDescriptor = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "scrollHeight");
  const widthDescriptor = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "clientWidth");
  Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", { configurable: true, get() { return this.closest("[hidden]") ? 0 : scroll; } });
  Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return this.closest("[hidden]") ? 0 : width; } });
  const props = { defaultValue: "terms", style: { boxSizing: "border-box", borderTop: "2px solid", borderBottom: "2px solid", paddingTop: "12px", paddingBottom: "12px" },
    onInput: () => inputEvents++, onFocus: () => focusEvents++ };
  const m = await mount(BayAutoTextarea, props);
  try {
    const area = m.host.querySelector("textarea");
    assert.equal(area.style.height, "52px");
    scroll = 96;
    await act(async () => area.dispatchEvent(new window.Event("input", { bubbles: true })));
    assert.equal(area.style.height, "100px");
    assert.equal(inputEvents, 1);
    scroll = 48;
    await act(async () => area.focus());
    assert.equal(area.style.height, "52px");
    assert.equal(focusEvents, 1);
    await m.rerender({ ...props, style: { ...props.style, boxSizing: "content-box" } });
    await act(async () => { width = 100; observers.at(-1).callback(); });
    assert.equal(area.style.height, "24px", "content-box height excludes padding");
  } finally { await m.close(); }
  const groups = [{ id: "terms", label: "Terms", collapsedByDefault: true, items: [{ id: "custom", label: "Custom", done: false, children: h(BayAutoTextarea, { defaultValue: "long terms", style: { boxSizing: "border-box", border: 0 } }) }] }];
  const n = await mount(BayRevealForm, { groups });
  try {
    assert.equal(n.host.querySelector("textarea").style.height, "");
    await click(n.host.querySelector("[data-bay-section-toggle]"));
    await act(async () => observers.at(-1).callback());
    assert.equal(n.host.querySelector("textarea").style.height, "48px");
  } finally {
    await n.close();
    assert.ok(observers.every(o => o.disconnected));
    if (scrollDescriptor) Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", scrollDescriptor);
    else delete window.HTMLElement.prototype.scrollHeight;
    if (widthDescriptor) Object.defineProperty(window.HTMLElement.prototype, "clientWidth", widthDescriptor);
    else delete window.HTMLElement.prototype.clientWidth;
    delete globalThis.ResizeObserver;
  }
});

test("invalid required fields stay mounted and become focusable when a collapsed group is highlighted", async () => {
  const group = { id: "terms", label: "Terms", collapsedByDefault: true, items: [{ id: "days", label: "Days", done: false, required: true, invalid: true, children: h("input", { "data-bay-field": "days" }) }] };
  const m = await mount(BayRevealForm, { groups: [group] });
  try {
    const input = m.host.querySelector("input");
    assert.ok(input.closest("[hidden]"));
    await m.rerender({ groups: [{ ...group, highlight: true, missing: ["Days"] }] });
    assert.equal(input.closest("[hidden]"), null);
    assert.ok(m.host.querySelector("[data-bay-required]"));
    assert.ok(m.host.querySelector("[data-bay-reveal-invalid]"));
    await act(async () => input.focus());
    assert.equal(document.activeElement === input, true);
  } finally { await m.close(); }
});
