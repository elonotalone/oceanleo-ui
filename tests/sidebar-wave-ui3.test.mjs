import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.scrollTo = () => {};
window.matchMedia = (media) => ({ matches: true, media, addEventListener(){}, removeEventListener(){} });
// jsdom 20 cannot parse @starting-style. Supply the stylesheet marker;
// this suite exercises interaction, focus and layout classes, not CSS animation.
const style = document.createElement("style");
style.id = "leo-overlay-motion";
document.head.append(style);
const stubs = {
  "../i18n/ui/useUI": dataModule("export function useUI(){return s=>s}"),
  "../ui/Toast": dataModule("export function useToast(){return {success(){}}}"),
};
const menuUrl = await compileModule("src/shell/TaskActionsMenu.tsx", stubs);
const { TaskActionsMenu } = await import(menuUrl);
const { HistoryRowMenu } = await import(await compileModule("src/shell/HistoryRowActions.tsx", {
  "./TaskActionsMenu": menuUrl,
  "../i18n/ui/useUI": stubs["../i18n/ui/useUI"],
  "../lib/auth/client": dataModule("export function browserClient(){return null}"),
}));
const { ProjectWorkspaceFrame } = await import(await compileModule("src/shell/project-workspace.tsx", {
  "./collection-chrome": dataModule('export const COLLECTION_ACTION_BTN_PRIMARY = "";'),
}));
async function mounted(run) {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async node => act(async () => root.render(node));
  const click = async node => act(async () => node.click());
  try { await run({host, render, click}); }
  finally {
    await act(async () => root.unmount());
    host.remove();
    console.error = original;
    assert.deepEqual(errors, [], "console.error must remain empty");
  }
}
function MenuHarness({row = false}) {
  const [open, onOpenChange] = React.useState(false);
  return React.createElement(row ? HistoryRowMenu : TaskActionsMenu, {
    open, onOpenChange, href: "/tasks/example", ...(row ? {} : {variant: "header"}),
  });
}
test("header menu stays visible and opens the real shared menu", async () => {
  await mounted(async ({host, render, click}) => {
    await render(React.createElement(MenuHarness));
    const button = host.querySelector("button");
    assert.equal(button.classList.contains("opacity-0"), false);
    assert.ok(button.classList.contains("p-1.5"));
    await click(button);
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.ok(document.querySelector('[role="menu"]'));
    assert.ok(document.querySelector('[role="menuitem"]'));
  });
});
test("My Tasks row retains hover-reveal trigger", async () => {
  await mounted(async ({host, render}) => {
    await render(React.createElement(MenuHarness, {row: true}));
    const button = host.querySelector("button");
    assert.ok(button.classList.contains("opacity-0"));
    assert.ok(button.classList.contains("group-hover:opacity-100"));
  });
});
test("compact desktop frame opens existing drawer and restores focus on Escape", async () => {
  await mounted(async ({host, render, click}) => {
    await render(React.createElement(ProjectWorkspaceFrame, {compact: true, config: "Settings"}, "Tasks"));
    const button = host.querySelector("[data-project-config-trigger]");
    const drawer = host.querySelector("aside");
    assert.equal(host.querySelector("[data-project-workspace-body]").className.includes("lg:grid-cols"), false);
    assert.equal(button.classList.contains("lg:hidden"), false);
    assert.equal(drawer.getAttribute("role"), "dialog");
    assert.ok(drawer.hasAttribute("inert"));
    await click(button);
    assert.equal(drawer.hasAttribute("inert"), false);
    assert.equal(document.body.style.overflow, "hidden");
    assert.equal(document.activeElement, host.querySelector("[data-project-config-close]"));
    await act(async () => document.dispatchEvent(new window.KeyboardEvent("keydown", {key: "Escape", bubbles: true})));
    assert.ok(drawer.hasAttribute("inert"));
    assert.equal(document.activeElement, button);
  });
});
test("default desktop frame keeps two-column markup and compact toggles safely", async () => {
  await mounted(async ({host, render}) => {
    const frame = compact => React.createElement(ProjectWorkspaceFrame, {compact, config: "Settings"}, "Tasks");
    await render(frame(undefined));
    assert.ok(host.querySelector("[data-project-workspace-body]").className.includes("lg:grid-cols"));
    assert.ok(host.querySelector("[data-project-config-trigger]").classList.contains("lg:hidden"));
    assert.equal(host.querySelector("aside").getAttribute("role"), "complementary");
    await render(frame(true));
    assert.equal(host.querySelector("aside").getAttribute("role"), "dialog");
    await render(frame(false));
    assert.equal(host.querySelector("aside").getAttribute("role"), "complementary");
  });
});
