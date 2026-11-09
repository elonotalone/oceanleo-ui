import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overview = readFileSync(new URL("../src/shell/works/WorksOverview.tsx", import.meta.url), "utf8");
const mine = readFileSync(new URL("../src/shell/MyLibrary.tsx", import.meta.url), "utf8");
const copy = readFileSync(new URL("../src/i18n/ui/messages/works-copy.ts", import.meta.url), "utf8");

test("Library exposes a Works panel without creating a second library page", () => {
  assert.match(mine, /data-library-work-tab-row/);
  assert.match(mine, /<WorksOverview/);
  assert.match(mine, /data-library-section="works"/);
  assert.doesNotMatch(mine, /local-library-tab/);
});

test("works overview maps every card field and server actions to the C6 client", () => {
  for (const marker of ["data-work-card", "data-work-status", "data-work-preview-stage", "data-work-preview", "更新时间", "在服务器上打开文件夹", "移除作品", "搬到我的服务器", "存回云端", "api.preview", "api.stop", "api.remove", "api.createServer", "api.moveToServer", "api.saveToCloud"]) {
    assert.match(overview, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(overview, /data-works-server-list/);
  assert.match(overview, /服务器离线，无法浏览文件夹/);
  assert.match(overview, /DeviceFolderPicker/);
  assert.match(overview, /startLocalAction\(work\.home\.computer_id, "app\.open"/);
  assert.match(overview, /destination_not_empty/);
  assert.match(overview, /50 MiB、1000 个文件/);
});

test("user work preview stays in the shared restrictive frame and app content domain", () => {
  assert.match(overview, /webViewerFrameSandbox\(false\)/);
  assert.match(overview, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(overview, /hostname === "oceanleo\.app"/);
  assert.match(overview, /hostname\.endsWith\("\.oceanleo\.app"\)/);
  assert.doesNotMatch(overview, /allow-same-origin/);
});

test("works copy contains the user-visible add, preview and status states", () => {
  for (const key of ["作品", "从服务器添加", "正在启动", "停止预览", "在服务器上打开文件夹", "存回云端"]) assert.match(copy, new RegExp(`"${key}"`));
});
