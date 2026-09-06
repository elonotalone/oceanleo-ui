import test from "node:test";
import assert from "node:assert/strict";

import {
  fusionMountPrefix,
  historySessionHref,
  historySessionIdFromPath,
  withFusionMountPrefix,
  workspaceAppHref,
  workspaceAppIdFromPath,
} from "../src/shell/workspace-route.ts";

test("canonical workspace app paths round-trip", () => {
  assert.equal(workspaceAppIdFromPath("/workspace/report-writer"), "report-writer");
  assert.equal(
    workspaceAppIdFromPath("/zh/workspace/%E6%96%87%E6%A1%A3"),
    "文档",
  );
  assert.equal(workspaceAppIdFromPath("/workspace"), "");
  assert.equal(workspaceAppHref("report writer"), "/workspace/report%20writer");
  assert.equal(workspaceAppHref(""), "/workspace");
});

test("canonical history session paths round-trip", () => {
  const id = "63d65496-d260-4bd8-b3ca-bcae8a481572";
  assert.equal(historySessionIdFromPath(`/history/${id}`), id);
  assert.equal(historySessionIdFromPath("/history"), "");
  assert.equal(historySessionHref(id), `/history/${id}`);
  assert.equal(historySessionHref(""), "/history");
});

test("fusion-station mount prefix is added to generated hrefs and ignored on production paths", () => {
  assert.equal(
    workspaceAppHref("invitation", undefined, "/s/image/workspace"),
    "/s/image/workspace/invitation",
  );
  assert.equal(
    workspaceAppHref("invitation", undefined, "/s/image/workspace/poster"),
    "/s/image/workspace/invitation",
  );
  assert.equal(
    workspaceAppHref("invitation", undefined, "/workspace"),
    "/workspace/invitation",
  );
  assert.equal(
    historySessionHref("abc", undefined, "/s/image/history"),
    "/s/image/history/abc",
  );
  assert.equal(historySessionHref("abc"), "/history/abc");
  assert.equal(
    workspaceAppIdFromPath("/s/image/workspace/invitation"),
    "invitation",
  );
  assert.equal(fusionMountPrefix("/s/image/workspace"), "/s/image");
  assert.equal(fusionMountPrefix("/workspace"), "");
  assert.equal(
    withFusionMountPrefix("/workspace", "/s/image"),
    "/s/image/workspace",
  );
  assert.equal(
    withFusionMountPrefix("/workspace/poster?fill=preset", "/s/image"),
    "/s/image/workspace/poster?fill=preset",
  );
  assert.equal(
    withFusionMountPrefix(
      "/workspace/poster?tab=materials&item=art-a&mode=preview",
      "/s/image/workspace",
    ),
    "/s/image/workspace/poster?tab=materials&item=art-a&mode=preview",
  );
  assert.equal(
    withFusionMountPrefix(
      "/workspace?tab=materials&item=art-a&mode=preview&app=poster",
      "/s/image/workspace",
    ),
    "/s/image/workspace?tab=materials&item=art-a&mode=preview&app=poster",
  );
  assert.equal(
    withFusionMountPrefix("/explore?app=poster", "/s/image"),
    "/s/image/explore?app=poster",
  );
  assert.equal(
    withFusionMountPrefix("/workspace", "/workspace"),
    "/workspace",
  );
});

test("invalid percent encoding never becomes an app identity", () => {
  assert.equal(workspaceAppIdFromPath("/workspace/%E0%A4%A"), "");
  assert.equal(historySessionIdFromPath("/history/%"), "");
});
