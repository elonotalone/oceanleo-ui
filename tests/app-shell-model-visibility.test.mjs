import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compileModule(relativePath, replacements) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries({
    react: reactUrl,
    ...replacements,
  })) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    })
    .outputText.replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return `${dataModule(compiled)}#${encodeURIComponent(relativePath)}`;
}

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const iconsStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  function Icon(props) {
    return React.createElement("svg", { ...props, "aria-hidden": "true" });
  }
  export const IconCheck = Icon;
  export const IconChevronDown = Icon;
  export const IconGift = Icon;
  export const IconPanel = Icon;
  export const IconSearch = Icon;
`);
const accountStubUrl = dataModule(`
  export const MODEL_GROUP_CHANGED_EVENT = "model-groups-changed";
  export async function getModelGroups() {
    return { ok: false, status: 401 };
  }
  export async function setActiveModelGroup() {
    return { ok: false, status: 401 };
  }
`);
const modelPickerUrl = await compileModule("src/shell/ModelPicker.tsx", {
  "../lib/auth/account": accountStubUrl,
  "./icons": iconsStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
});

const navigationStubUrl = dataModule(`
  let pathname = "/";
  let search = "";
  export function setRoute(nextPathname, nextSearch = "") {
    pathname = nextPathname;
    search = nextSearch;
  }
  export function usePathname() {
    return pathname;
  }
  export function useSearchParams() {
    return new URLSearchParams(search);
  }
`);
const navigation = await import(navigationStubUrl);
const linkStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ children, href, ...props }) {
    return React.createElement("a", { ...props, href }, children);
  }
`);
const workspaceSelectionStubUrl = dataModule(`
  export function WorkspaceSelectionProvider({ children }) {
    return children;
  }
`);
const themeStubUrl = dataModule(`
  export function ThemeSwitcher() {
    return null;
  }
`);
const languageStubUrl = dataModule(`
  export function LanguageSwitcher() {
    return null;
  }
`);
const localeStubUrl = dataModule(`
  export const LOCALES = [
    "de", "en", "es", "es-419", "fr", "it", "pt-BR", "pt-PT", "vi",
    "tr", "zh", "zh-TW", "ja", "ko", "ar", "th", "hi"
  ];
`);
const presenceStubUrl = dataModule(`
  export function usePresenceHeartbeat() {}
`);
const appShellUrl = await compileModule("src/shell/AppShell.tsx", {
  "next/link": linkStubUrl,
  "next/navigation": navigationStubUrl,
  "./ModelPicker": modelPickerUrl,
  "./icons": iconsStubUrl,
  "./WorkspaceSelection": workspaceSelectionStubUrl,
  "../theme": themeStubUrl,
  "../i18n/LanguageSwitcher": languageStubUrl,
  "../i18n/config": localeStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "../lib/presence": presenceStubUrl,
});
const { AppShell, shouldShowModelPicker } = await import(appShellUrl);

const brand = {
  name: "Test",
  logo: React.createElement("span", null, "T"),
  accent: "#2563eb",
};

function renderShell(pathname, search, layout = "sidebar", extraProps = {}) {
  navigation.setRoute(pathname, search);
  return renderToStaticMarkup(
    React.createElement(
      AppShell,
      { brand, layout, ...extraProps },
      React.createElement("section", { "aria-label": "Route content" }, "Body"),
    ),
  );
}

function count(markup, token) {
  return markup.split(token).length - 1;
}

function modelPickerAccessibleName(markup) {
  const title = 'title="选择全站通用的模型组合"';
  const titleIndex = markup.indexOf(title);
  assert.ok(titleIndex >= 0, "model picker button keeps its accessible title");
  const buttonStart = markup.lastIndexOf("<button", titleIndex);
  const buttonEnd = markup.indexOf("</button>", titleIndex);
  assert.ok(buttonStart >= 0 && buttonEnd > titleIndex);
  return markup
    .slice(buttonStart, buttonEnd)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const visibilityCases = [
  ["/", "", true, "site root"],
  ["/home", "", true, "home"],
  ["/apps", "", true, "App card directory"],
  ["/workspace", "", true, "workspace directory"],
  ["/history", "?status=running", true, "history list filter"],
  ["/library", "?fn=", true, "library with an empty fn selection"],
  ["/", "?fn=%20", true, "root with a whitespace-only fn selection"],
  ["/zh-TW/history", "?task=", true, "locale history with empty task"],
  ["/pt-BR/workspace", "", true, "locale workspace directory"],
  ["/", "?embed=0&solo=false", true, "explicitly disabled embed flags"],
  ["/", "?fn=poster", false, "legacy root function runtime"],
  ["/", "?function=poster", false, "named function runtime"],
  ["/", "?mode=poster", false, "legacy mode function runtime"],
  ["/workspace/poster", "", false, "canonical app runtime"],
  ["/en/workspace/poster", "", false, "locale canonical app runtime"],
  ["/history", "?task=task-1", false, "legacy history task detail"],
  ["/history/session-1", "", false, "canonical history detail"],
  ["/library", "?session=session-1", false, "library session detail"],
  ["/workspace", "?app=poster", false, "workspace app selection"],
  ["/workspace", "?function=poster", false, "workspace function selection"],
  ["/", "?embed=1", false, "embedded runtime"],
  ["/", "?solo", false, "bare solo runtime flag"],
  ["/advanced", "", false, "advanced editor entry"],
  ["/en/advanced/image_editing", "", false, "locale advanced editor"],
  ["/apps/poster", "", false, "nested concrete app detail"],
];

test("model picker visibility is table-driven by route and search context", () => {
  for (const [pathname, search, expected, label] of visibilityCases) {
    assert.equal(
      shouldShowModelPicker(pathname, search),
      expected,
      `${label}: ${pathname}${search}`,
    );
  }
});

test("sidebar and topbar render one accessible picker only on directories", () => {
  for (const layout of ["sidebar", "topbar"]) {
    const visible = renderShell("/workspace", "", layout);
    assert.equal(count(visible, "data-oceanleo-model-picker-slot"), 1);
    assert.match(modelPickerAccessibleName(visible), /模型组合/);

    const hidden = renderShell("/workspace/poster", "", layout);
    assert.equal(count(hidden, "data-oceanleo-model-picker-slot"), 0);
    assert.doesNotMatch(hidden, /选择全站通用的模型组合/);
  }
});

test("nested AppShells preserve one route-aware picker owner", () => {
  navigation.setRoute("/", "");
  const visible = renderToStaticMarkup(
    React.createElement(
      AppShell,
      { brand },
      React.createElement(
        AppShell,
        { brand: { ...brand, name: "Nested" }, layout: "topbar" },
        React.createElement("section", { "aria-label": "Nested content" }, "Nested body"),
      ),
    ),
  );
  assert.equal(count(visible, "data-oceanleo-shell"), 1);
  assert.equal(count(visible, "data-oceanleo-model-picker-slot"), 1);
  assert.match(visible, /Nested body/);

  navigation.setRoute("/history/task-1", "");
  const hidden = renderToStaticMarkup(
    React.createElement(
      AppShell,
      { brand },
      React.createElement(
        AppShell,
        { brand: { ...brand, name: "Nested" } },
        React.createElement("section", { "aria-label": "Nested content" }, "Nested body"),
      ),
    ),
  );
  assert.equal(count(hidden, "data-oceanleo-shell"), 1);
  assert.equal(count(hidden, "data-oceanleo-model-picker-slot"), 0);
  assert.match(hidden, /Nested body/);
});

test("hidden sidebar picker reserves no header-tools row", () => {
  const runtime = renderShell("/workspace/poster", "");
  assert.doesNotMatch(runtime, /data-oceanleo-model-picker-slot/);
  assert.doesNotMatch(runtime, /data-oceanleo-header-tools/);

  const manualOverride = renderShell("/", "", "sidebar", {
    hideHeader: true,
  });
  assert.doesNotMatch(manualOverride, /data-oceanleo-model-picker-slot/);
  assert.doesNotMatch(manualOverride, /data-oceanleo-header-tools/);

  const topbarOverride = renderShell("/", "", "topbar", {
    hideHeader: true,
  });
  assert.doesNotMatch(topbarOverride, /data-oceanleo-model-picker-slot/);
});
