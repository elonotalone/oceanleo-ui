import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rowSource = await readFile(new URL("../src/pages/settings/connectors/ConnectorRow.tsx", import.meta.url), "utf8");
const paneSource = await readFile(new URL("../src/pages/settings/ConnectorsSettingsPane.tsx", import.meta.url), "utf8");
const copySource = await readFile(new URL("../src/i18n/ui/messages/connectors-copy.ts", import.meta.url), "utf8");

test("connector rows expose one primary action and keep secondary operations reachable", () => {
  assert.match(rowSource, /data-connector-primary-action/);
  assert.match(rowSource, /status === "stale" \? tt\("重试"\)/);
  assert.match(rowSource, /status === "connected" \? tt\("断开"\)/);
  for (const action of ["reconnect", "probe", "toggle", "disconnect"]) {
    assert.match(rowSource, new RegExp(`data-connector-menu=\\"${action}\\"`));
  }
  assert.match(rowSource, /data-connector-status-line/);
  assert.match(rowSource, /min-w-0/);
});

test("deep-link target highlights and scrolls the matching row", () => {
  assert.match(paneSource, /setHighlightedId\(wanted\)/);
  assert.match(paneSource, /row\.scrollIntoView/);
  assert.match(rowSource, /data-connector-highlighted/);
  assert.match(paneSource, /initialConnectorId/);
});

test("connector copy has the compact status and action labels", () => {
  for (const label of ["已连接 · {n} 工具", "已失效 · 点击重试", "连接", "断开", "重试"]) {
    assert.ok(copySource.includes(label), `missing copy: ${label}`);
  }
});
