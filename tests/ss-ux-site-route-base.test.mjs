// Session / sites wave (contract §2.5): every site console lives at /workspace/<siteKey> on the main site and passes
// its base path through the `route` input. Every URL the console writes or parses must honour that base.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalCatalogAppHref,
  catalogCanonicalRedirect,
  catalogNavigationForChange,
  resolveSiteCatalogRoute,
  resolveSiteCatalogRouteContract,
  workspaceAppAdvancedHref,
  workspaceAppFillHref,
  workspaceTemplateEditHref,
  workspaceTemplatePreviewHref,
} from "../src/shell/site-catalog-controller.ts";
import { workspaceAppHref, workspaceAppIdFromPath } from "../src/shell/workspace-route.ts";
import { siteWorkspaceBase } from "../src/lib/site-path.ts";

const BASE = "/workspace/image";
const ROUTE = { canonicalBasePath: siteWorkspaceBase("image") };
const FULL = { canonicalBasePath: BASE, historyBasePath: "/history", legacyQueryKeys: ["fn", "mode"] };
const known = new Set(["agent", "poster", "logo"]);

test("route contract: partial input keeps the defaults; the full shape is accepted as is", () => {
  assert.equal(siteWorkspaceBase("image"), BASE);
  assert.deepEqual(resolveSiteCatalogRouteContract(ROUTE), FULL);
  assert.deepEqual(resolveSiteCatalogRouteContract(FULL), FULL);
  assert.deepEqual(resolveSiteCatalogRouteContract({ canonicalBasePath: `${BASE}/` }), FULL);
  // Callers that pass nothing keep /workspace.
  assert.deepEqual(resolveSiteCatalogRouteContract(), {
    canonicalBasePath: "/workspace",
    historyBasePath: "/history",
    legacyQueryKeys: ["fn", "mode"],
  });
  // Later inputs win (console: manifest.workspace, then the route prop).
  assert.equal(
    resolveSiteCatalogRouteContract({ canonicalBasePath: "/workspace/law" }, ROUTE).canonicalBasePath,
    BASE,
  );
  // Not a root-relative path → ignored, never an absolute or protocol-relative base.
  for (const bad of ["https://evil.test/workspace", "//evil.test", "workspace/image", ""]) {
    assert.equal(resolveSiteCatalogRouteContract({ canonicalBasePath: bad }).canonicalBasePath, "/workspace", bad);
  }
});

test("app id is the segment after the base path", () => {
  assert.equal(workspaceAppIdFromPath("/workspace/image/poster", ROUTE), "poster");
  assert.equal(workspaceAppIdFromPath("/workspace/image/poster/extra", ROUTE), "poster");
  assert.equal(workspaceAppIdFromPath("/workspace/image", ROUTE), "");
  assert.equal(workspaceAppIdFromPath("/workspace/image/", ROUTE), "");
  assert.equal(workspaceAppIdFromPath("/workspace/video/poster", ROUTE), "");
  // Default base for callers that pass nothing.
  assert.equal(workspaceAppIdFromPath("/workspace/poster"), "poster");
  assert.equal(workspaceAppHref("poster", ROUTE), "/workspace/image/poster");
  assert.equal(workspaceAppHref("", ROUTE), BASE);
});

test("route state, canonical redirect and navigation stay under /workspace/image", () => {
  const atApp = resolveSiteCatalogRoute({ pathname: "/workspace/image/poster", knownAppIds: known, route: ROUTE });
  assert.equal(atApp.pathAppId, "poster");
  assert.equal(atApp.activeAppId, "poster");
  assert.equal(catalogCanonicalRedirect(atApp, "/workspace/image/poster", "", false, ROUTE), null);

  // The site's desk with a legacy query → canonical app path under the site base.
  const legacy = resolveSiteCatalogRoute({
    pathname: BASE,
    search: "?fn=poster&x=1",
    knownAppIds: known,
    route: ROUTE,
  });
  assert.equal(legacy.activeAppId, "poster");
  assert.equal(catalogCanonicalRedirect(legacy, BASE, "?fn=poster&x=1", false, ROUTE), "/workspace/image/poster?x=1");
  // The same query on the main desk is not this console's index → no redirect.
  assert.equal(catalogCanonicalRedirect(legacy, "/workspace", "?fn=poster", false, ROUTE), null);

  const unknown = resolveSiteCatalogRoute({ pathname: "/workspace/image/nope", knownAppIds: known, route: ROUTE });
  assert.equal(unknown.invalidAppId, "nope");

  assert.deepEqual(catalogNavigationForChange("logo", { route: ROUTE, pathname: "/workspace/image/poster" }), {
    kind: "route",
    appId: "logo",
    href: "/workspace/image/logo",
  });
  assert.deepEqual(catalogNavigationForChange("", { route: ROUTE, pathname: "/workspace/image/poster" }), {
    kind: "route",
    appId: "",
    href: BASE,
  });
  assert.equal(canonicalCatalogAppHref("poster", "?app=poster&fill=preset", true, ROUTE), "/workspace/image/poster?fill=preset");
});

test("deep-link builders honour the base", () => {
  assert.equal(workspaceAppFillHref("poster", ROUTE), "/workspace/image/poster?fill=preset");
  assert.equal(workspaceAppAdvancedHref("poster", ROUTE), "/workspace/image/poster?fill=preset&open=advanced");
  assert.equal(workspaceTemplateEditHref("poster", "t1", ROUTE), "/workspace/image/poster?open=template&template=t1");
  assert.equal(
    workspaceTemplatePreviewHref("poster", "a1", ROUTE),
    "/workspace/image/poster?tab=materials&item=a1&mode=preview",
  );
  assert.equal(workspaceAppFillHref("", ROUTE), BASE);
  assert.equal(workspaceTemplatePreviewHref("", "", ROUTE), BASE);
});

test("SiteCatalogConsole takes a route prop that wins over manifest.workspace", async () => {
  const source = await readFile(new URL("../src/shell/SiteCatalogConsole.tsx", import.meta.url), "utf8");
  assert.match(source, /route\?: Partial<OceanLeoWorkspaceRouteContract>;/);
  assert.match(source, /resolveSiteCatalogRouteContract\(manifest\?\.workspace, \{/);
  // Every route-taking call inside the console uses the merged route, never the manifest alone.
  assert.doesNotMatch(source, /manifest\?\.workspace,\s*pathname/);
  assert.doesNotMatch(source, /route: manifest\?\.workspace/);
  assert.equal((source.match(/manifest\?\.workspace/g) || []).length, 2, "only the merge reads the manifest route");
});
