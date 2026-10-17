import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

const navigationStubUrl = dataModule(`
  let pathname = "/library";
  let search = "";
  export function usePathname() { return pathname; }
  export function useSearchParams() { return new URLSearchParams(search); }
  export function useRouter() {
    return {
      push(href) { pathname = String(href).split("?")[0]; },
      replace(href) { this.push(href); },
      prefetch() {}, back() {}, forward() {}, refresh() {},
    };
  }
`);
const linkStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ children, href, ...props }) {
    return React.createElement("a", { ...props, href, "data-host-link": "web" }, children);
  }
`);

const webUrl = await compileModule("src/client-ui/web.ts", {
  "next/link": linkStubUrl,
  "next/navigation": navigationStubUrl,
});
const { NextWebHostProvider, useClientHost } = await import(webUrl);

function Probe() {
  const host = useClientHost();
  return React.createElement(
    "div",
    {
      "data-platform": host.environment.platform,
      "data-api": host.environment.apiEndpoint,
      "data-path": host.navigation.pathname,
    },
    host.environment.apiEndpoint || "empty-endpoint",
  );
}

test("web adapter injects Next navigation and does not guess API from hostname", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      NextWebHostProvider,
      { apiEndpoint: "https://api.dev.oceanleo.com" },
      React.createElement(Probe),
    ),
  );
  assert.match(markup, /data-platform="web"/);
  assert.match(markup, /data-path="\/library"/);
  assert.match(markup, /data-api="https:\/\/api\.dev\.oceanleo\.com"/);
  assert.equal(markup.includes("hostname"), false);
});

test("web adapter empty endpoint keeps existing web clients (main-site behavior)", () => {
  const markup = renderToStaticMarkup(
    React.createElement(NextWebHostProvider, null, React.createElement(Probe)),
  );
  assert.match(markup, /empty-endpoint/);
  assert.match(markup, /data-api=""/);
});
