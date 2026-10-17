import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const advancedStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AdvancedContentWorkbench() {
    return React.createElement("div", { "data-advanced-stub": "1" });
  }
`);
const localeStubUrl = dataModule(`
  export const LOCALES = ["zh", "en"];
  export function useLocale() { return "zh"; }
`);
const authClientStubUrl = dataModule(`
  export function browserClient() { return null; }
  export async function accessToken() { return null; }
  export const AUTH_STATE_EVENT = "oceanleo-auth-state";
`);

const hostUrl = await compileModule("src/client-ui/local/library-host.tsx", {
  "../../i18n/ui/useUI": uiStubUrl,
  "../../i18n/config": localeStubUrl,
  "../../shell/AdvancedContentWorkbench": advancedStubUrl,
  "../../lib/auth/client": authClientStubUrl,
});
const { LocalLibraryHost } = await import(hostUrl);

const portalLibraryPage = readFileSync(
  "/root/projects/oceanleo/app/library/page.tsx",
  "utf8",
);
const sharedSurface = readFileSync(
  "src/client-ui/surfaces/library-page.tsx",
  "utf8",
);

test("portal /library and local host mount the same ArtifactLibrary surface", () => {
  assert.match(portalLibraryPage, /from "@oceanleo\/ui\/shell"/);
  assert.match(portalLibraryPage, /<ArtifactLibrary accent="#0ea5e9" \/>/);
  assert.match(sharedSurface, /from "\.\.\/\.\.\/shell\/ArtifactLibrary"/);
  assert.match(sharedSurface, /<ArtifactLibrary \{\.\.\.props\} \/>/);
  assert.equal(sharedSurface.includes("function FakeLibrary"), false);
});

test("local memory host renders the real My Library page, not a mock", () => {
  const markup = renderToStaticMarkup(
    React.createElement(LocalLibraryHost, { accent: "#0ea5e9" }),
  );
  assert.match(markup, /我的库/);
  assert.match(markup, /正在加载我的库/);
  assert.match(markup, /搜索我的作品、收藏素材、网站、交付物和上传文件/);
  assert.equal(markup.includes("data-advanced-stub"), false);
  assert.equal(markup.includes("mock-library"), false);
  assert.ok(markup.length > 500, `real library markup should be substantial, got ${markup.length}`);
});
