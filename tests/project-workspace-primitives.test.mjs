// W07 shared project-workspace primitives.
//
// The contract is intentionally about reusable layout and accessibility:
// consumers own all project data, API calls, routing, and copy.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
const uiTranslationStub = dataModule(
  "export function useUI(){ return (value) => value; }",
);

const primitivesUrl = await compileModule("src/shell/project-workspace.tsx", {
  "../i18n/ui/useUI": uiTranslationStub,
  "react-dom": reactDomUrl,
});
const {
  ProjectWorkspaceFrame,
  ProjectTabNav,
  ProjectToolbar,
  ProjectEmptyState,
  ProjectConfigCard,
  ProjectModal,
} = await import(primitivesUrl);

const source = await readFile(
  resolve("src/shell/project-workspace.tsx"),
  "utf8",
);
const shellIndex = await readFile(resolve("src/shell/index.ts"), "utf8");
const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const apiSnapshot = JSON.parse(
  await readFile(
    resolve("src/architecture/public-api.snapshot.json"),
    "utf8",
  ),
);

function render(Component, props, ...children) {
  return renderToStaticMarkup(
    React.createElement(Component, props, ...children),
  );
}

async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://agent.oceanleo.com/projects/example",
  });
  const { window } = dom;
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return true;
    },
  });

  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else {
        delete globalThis[name];
      }
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame =
    window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const renderRoot = (Component, props) =>
    act(async () => root.render(React.createElement(Component, props)));
  const find = (selector) => window.document.querySelector(selector);
  const findAll = (selector) => [
    ...window.document.querySelectorAll(selector),
  ];
  const click = (selector) => {
    const node = find(selector);
    assert.ok(node, `missing click target: ${selector}`);
    return act(async () =>
      node.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      ),
    );
  };
  const keydown = (target, key) =>
    act(async () =>
      target.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );

  try {
    await run({ window, renderRoot, find, findAll, click, keydown });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    if (previousRequestAnimationFrame === undefined) {
      delete globalThis.requestAnimationFrame;
    } else {
      globalThis.requestAnimationFrame = previousRequestAnimationFrame;
    }
    if (previousCancelAnimationFrame === undefined) {
      delete globalThis.cancelAnimationFrame;
    } else {
      globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("shell exports the six primitives through the existing package entry", () => {
  assert.equal(packageJson.exports["./shell"], "./src/shell/index.ts");
  assert.equal(
    Object.keys(packageJson.exports).filter((key) =>
      key.includes("project-workspace"),
    ).length,
    0,
    "must not add an undeclared deep project-workspace export",
  );

  for (const name of [
    "ProjectWorkspaceFrame",
    "ProjectTabNav",
    "ProjectToolbar",
    "ProjectEmptyState",
    "ProjectConfigCard",
    "ProjectModal",
  ]) {
    assert.match(shellIndex, new RegExp(`\\b${name}\\b`));
    assert.ok(
      apiSnapshot.entrypoints["./shell"].declarations.some(
        (entry) => entry.kind === "named" && entry.name === name,
      ),
      `${name} missing from public API snapshot`,
    );
  }
});

test("workspace frame renders all slots and keeps narrow-screen config reachable", () => {
  const html = render(
    ProjectWorkspaceFrame,
    {
      top: React.createElement("div", null, "Top slot"),
      config: React.createElement(
        "form",
        { "data-config-content": true },
        "Config slot",
      ),
      bottom: React.createElement("div", null, "Bottom slot"),
      mobileConfigLabel: "Open configuration",
      configAriaLabel: "Project configuration",
    },
    React.createElement("article", null, "Main slot"),
  );

  assert.match(html, /data-project-workspace-top/);
  assert.match(html, /data-project-workspace-main/);
  assert.match(html, /data-project-workspace-config/);
  assert.match(html, /data-project-workspace-bottom/);
  assert.match(
    html,
    /lg:grid-cols-\[minmax\(0,1fr\)_clamp\(20rem,24vw,22\.5rem\)\]/,
  );
  const triggerTag = html.match(
    /<button(?=[^>]*data-project-config-trigger)[^>]*>/,
  )?.[0];
  const configTag = html.match(
    /<aside(?=[^>]*data-project-workspace-config)[^>]*>/,
  )?.[0];
  assert.ok(triggerTag);
  assert.match(triggerTag, /aria-controls="[^"]+"/);
  assert.match(triggerTag, /aria-expanded="false"/);
  assert.ok(configTag);
  assert.match(configTag, /role="dialog"/);
  assert.match(configTag, /aria-hidden="true"/);
  assert.equal(
    (html.match(/data-config-content/g) || []).length,
    1,
    "config children must not be duplicated for desktop and mobile",
  );
});

test("mobile config drawer opens, closes with Escape, and restores trigger focus", async () => {
  await withDom(async ({ window, renderRoot, find, click, keydown }) => {
    await renderRoot(
      ProjectWorkspaceFrame,
      {
        top: "Project",
        config: React.createElement("input", {
          "aria-label": "Instruction",
        }),
        mobileConfigLabel: "Configure",
        closeConfigLabel: "Close configuration",
      },
      React.createElement("div", null, "Work"),
    );

    const trigger = find("[data-project-config-trigger]");
    const drawer = find("[data-project-workspace-config]");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(drawer.getAttribute("aria-hidden"), "true");
    assert.ok(drawer.hasAttribute("inert"));

    await click("[data-project-config-trigger]");
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.equal(drawer.hasAttribute("aria-hidden"), false);
    assert.equal(drawer.hasAttribute("inert"), false);
    assert.equal(window.document.body.style.overflow, "hidden");
    assert.equal(
      window.document.activeElement,
      find("[data-project-config-close]"),
    );

    await keydown(window.document, "Escape");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(drawer.getAttribute("aria-hidden"), "true");
    assert.equal(window.document.body.style.overflow, "");
    assert.equal(window.document.activeElement, trigger);
  });
});

test("tab nav exposes ARIA state and keyboard navigation skips disabled tabs", async () => {
  await withDom(async ({ window, renderRoot, find, keydown }) => {
    function Harness() {
      const [active, setActive] = React.useState("activity");
      return React.createElement(ProjectTabNav, {
        ariaLabel: "Project sections",
        tabs: [
          { id: "activity", label: "Activity", panelId: "activity-panel" },
          { id: "disabled", label: "Disabled", disabled: true },
          { id: "plan", label: "Plan", panelId: "plan-panel" },
          { id: "assets", label: "Assets", panelId: "assets-panel" },
        ],
        activeId: active,
        onChange: setActive,
      });
    }

    await renderRoot(Harness);
    const tablist = find("[data-project-tab-nav]");
    assert.equal(tablist.getAttribute("role"), "tablist");
    assert.equal(tablist.getAttribute("aria-label"), "Project sections");
    assert.equal(
      find('[data-project-tab="activity"]').getAttribute("aria-selected"),
      "true",
    );

    const activity = find('[data-project-tab="activity"]');
    activity.focus();
    await keydown(activity, "ArrowRight");
    const plan = find('[data-project-tab="plan"]');
    assert.equal(plan.getAttribute("aria-selected"), "true");
    assert.equal(plan.getAttribute("tabindex"), "0");
    assert.equal(window.document.activeElement, plan);

    await keydown(plan, "End");
    const assets = find('[data-project-tab="assets"]');
    assert.equal(assets.getAttribute("aria-selected"), "true");
    assert.equal(window.document.activeElement, assets);
  });
});

test("toolbar, empty state, and config card render caller-owned slots with native actions", () => {
  const toolbar = render(ProjectToolbar, {
    ariaLabel: "Plan tools",
    search: React.createElement("input", { "aria-label": "Search" }),
    controls: React.createElement("button", { type: "button" }, "Filter"),
  });
  assert.match(toolbar, /role="toolbar"/);
  assert.match(toolbar, /data-project-toolbar-search/);
  assert.match(toolbar, /data-project-toolbar-controls/);
  assert.match(toolbar, /sm:flex-row/);

  const empty = render(ProjectEmptyState, {
    icon: "○",
    title: "Nothing here",
    description: "Caller supplied description",
    action: React.createElement("button", { type: "button" }, "Create"),
  });
  assert.match(empty, /data-project-empty-state/);
  assert.match(empty, /aria-labelledby="[^"]+"/);
  assert.match(empty, /data-project-empty-state-action/);

  const card = render(ProjectConfigCard, {
    title: "Connectors",
    count: 0,
    summary: "Caller supplied summary",
    addAction: { label: "Add", onClick() {} },
    openAction: { label: "Open", onClick() {} },
  });
  assert.match(card, /data-project-config-count[^>]*>0</);
  assert.match(
    card,
    /<button[^>]*type="button"[^>]*data-project-config-action="add"/,
  );
  assert.match(
    card,
    /<button[^>]*type="button"[^>]*data-project-config-action="open"/,
  );
});

test("ProjectModal keeps title, close, footer, Escape, backdrop, and focus semantics", async () => {
  await withDom(async ({ window, renderRoot, find }) => {
    let closed = 0;
    await renderRoot(ProjectModal, {
      title: "Automation",
      closeLabel: "Close automation",
      footer: React.createElement("button", { type: "button" }, "Save"),
      onClose: () => {
        closed += 1;
      },
      children: React.createElement("input", { "aria-label": "Name" }),
    });

    const dialog = find('[role="dialog"][aria-modal="true"]');
    assert.ok(dialog);
    const titleId = dialog.getAttribute("aria-labelledby");
    assert.ok(titleId);
    assert.equal(find(`#${titleId}`).textContent, "Automation");
    assert.ok(find("[data-project-modal-close]"));
    assert.ok(find("[data-project-modal-body]"));
    assert.ok(find("[data-project-modal-footer]"));

    await act(async () => {
      window.document.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((resolveTimer) => setTimeout(resolveTimer, 170));
    });
    assert.equal(closed, 1);

    await act(async () => {
      dialog.dispatchEvent(
        new window.MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((resolveTimer) => setTimeout(resolveTimer, 170));
    });
    assert.equal(closed, 2);
  });
});

test("primitives remain transport- and portal-neutral", () => {
  for (const forbidden of [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\baxios\b/,
    /\/v1\/projects/,
    /\baccessToken\s*\(/,
    /\buseRouter\s*\(/,
    /next\/navigation/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
  assert.match(source, /Modal as SharedModal/);
  assert.doesNotMatch(source, /oceanleo\.com/);
});
