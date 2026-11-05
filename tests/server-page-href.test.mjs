import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { devicesCloudHref, portalHref } from "../src/shell/cloud-computer/server-page/href.ts";

test("portal helpers keep device links under the device route", () => {
  assert.equal(portalHref("/devices?computer=cc%20/1"), "/devices?computer=cc%20/1");
  assert.equal(devicesCloudHref(), "/devices");
});

test("terminal task links use the task conversation URL", async () => {
  const source = await readFile("src/shell/cloud-computer/ShellTaskView.tsx", "utf8");
  assert.match(source, /\/tasks\/\$\{encodeURIComponent\(taskId\)\}/);
  assert.match(source, /computerSession/);
  assert.doesNotMatch(source, /serverPageHref/);
});
