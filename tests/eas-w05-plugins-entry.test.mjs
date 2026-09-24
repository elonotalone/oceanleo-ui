// 「插件」从主站侧栏挪进账号菜单（editors-and-shell-0924 W05）。
//
// 插件与连接器是设置窗里的一个面板（W07 注册、W09 实现），入口在账号菜单
// 「设置」下面（`eas-w05-account-menu`）。侧栏不再放一行 Plugins。
// 输入框插件浮层底部「添加连接器」打开同一个面板，那条判据在 `composer-plugins-popover`。
import assert from "node:assert/strict";
import test from "node:test";

import { NAV_SOURCE, navEntries, navIdsForScope } from "../src/shell/nav-source/index.ts";

test("导航源的 portal 位不再有 plugins（主站侧栏没有 Plugins 这一行）", () => {
  assert.ok(!navIdsForScope("portal").includes("plugins"), "portal 落位里还有 plugins");
  for (const options of [{}, { withTalent: true }]) {
    for (const section of ["primary", "footer"]) {
      const ids = navEntries("portal", options, section).map((entry) => entry.id);
      assert.ok(!ids.includes("plugins"), `navEntries("portal", ${JSON.stringify(options)}, "${section}") 里还有 plugins`);
    }
  }
  // 租户站本来就没有这一行；整条删掉而不是留一条零落位的死数据。
  assert.equal(NAV_SOURCE.find((entry) => entry.id === "plugins"), undefined);
});
