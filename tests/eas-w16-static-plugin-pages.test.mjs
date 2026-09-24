// 网站页签首帧就是完整六格；未就绪四格置灰；manifest 到达后可点；表外 id 追加。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PLUGIN_AUX_PENDING_REASON,
  WEBSITE_AUX_PAGE_IDS,
  mergePluginAuxPages,
} from "../src/shell/plugin-chrome/plugin-page-registry.ts";
import { buildPluginPages } from "../src/shell/plugin-chrome/plugin-pages.ts";

function websiteFirstFrame() {
  return buildPluginPages({ pluginId: "website" });
}

test("网站首帧六个页签，四个附加页置灰", () => {
  const pages = websiteFirstFrame();
  assert.deepEqual(
    pages.map((page) => page.id),
    ["artifact", "pro", ...WEBSITE_AUX_PAGE_IDS],
  );
  const aux = pages.filter((page) => page.kind === "aux");
  assert.equal(aux.length, 4);
  for (const page of aux) {
    assert.equal(page.disabled, true, `${page.id} 首帧应置灰`);
    assert.equal(page.unavailableReason, PLUGIN_AUX_PENDING_REASON);
  }
});

test("manifest 到达后同 id 可点；表外 id 追加", () => {
  const remote = [
    {
      id: "code",
      label: "源码",
      kind: "aux",
      disabled: false,
    },
    {
      id: "dashboard",
      label: "仪表盘",
      kind: "aux",
      disabled: false,
    },
    {
      id: "database",
      label: "数据库",
      kind: "aux",
      disabled: false,
    },
    {
      id: "storage",
      label: "文件存储",
      kind: "aux",
      disabled: false,
    },
    {
      id: "analytics",
      label: "分析",
      kind: "aux",
      disabled: false,
    },
  ];
  const pages = buildPluginPages({
    pluginId: "website",
    aux: mergePluginAuxPages("website", remote),
  });
  assert.deepEqual(
    pages.map((page) => page.id),
    ["artifact", "pro", ...WEBSITE_AUX_PAGE_IDS, "analytics"],
  );
  for (const id of WEBSITE_AUX_PAGE_IDS) {
    const page = pages.find((entry) => entry.id === id);
    assert.equal(page.disabled, false, `${id} 就绪后应可点`);
    assert.equal(page.unavailableReason, undefined);
  }
  const extra = pages.find((page) => page.id === "analytics");
  assert.equal(extra.kind, "aux");
  assert.equal(extra.disabled, false);
});

test("EmbeddedRoute 首帧就把静态表交给页签行", () => {
  const route = readFileSync(
    new URL("../src/shell/advanced-routes/EmbeddedRoute.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /mergePluginAuxPages\(\s*embeddedAdapterId/);
  assert.match(route, /aux: remoteAuxPages/);
});
