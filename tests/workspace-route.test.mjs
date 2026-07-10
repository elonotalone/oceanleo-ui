import test from "node:test";
import assert from "node:assert/strict";

import {
  historySessionHref,
  historySessionIdFromPath,
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

test("invalid percent encoding never becomes an app identity", () => {
  assert.equal(workspaceAppIdFromPath("/workspace/%E0%A4%A"), "");
  assert.equal(historySessionIdFromPath("/history/%"), "");
});
