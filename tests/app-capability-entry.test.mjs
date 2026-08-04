// 功能直入【入口侧】的数据驱动契约（H 波 W2，判据 H1-a / H1-b / H1-d）。
//
// 这里守的不是「函数返回值对不对」，而是三条会被下一轮悄悄改回去的纪律：
//   1. 按钮**只能**来自 W4 的映射。删掉映射里一行，那枚按钮必须消失 —— 所以测试里
//      真的删一行再问一次，而不是断言某个硬编码清单。
//   2. 前端**不许**持有站点清单／app 清单／族清单。所以直接读入口侧两个源文件，
//      断言映射里出现过的 siteKey / appId / family 一个都没被写进代码。
//   3. 选中态只加 query、不动路径 —— `?cap=` 的往返必须保留其它参数。
//
// 全部走真模块：`app-capability-entry.ts` 是刻意无 React 无 JSX 的纯函数层，
// `node --experimental-strip-types` 可以直接 import 它连同随包发布的生成映射。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  APP_CAPABILITY_MAP_SCHEMA,
  APP_CAPABILITY_QUERY_KEY,
  appCapabilityEntries,
  appCapabilityFamilyFromSearch,
  appCapabilityFromSearch,
  appCapabilitySearch,
  isUsableAppCapabilityEntry,
  readAppCapabilityMap,
  registerAppCapabilityMap,
  resolveAppCapabilityEntries,
} from "../src/shell/app-capability-entry.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = readAppCapabilityMap();

/** 随包映射里任取一个真实的 (siteKey, appId, 按钮数≥2) 样本，避免测试写死站点名。 */
function sampleApp(minEntries = 2) {
  for (const [key, rows] of Object.entries(SHIPPED.apps)) {
    if (rows.length >= minEntries) {
      const slash = key.indexOf("/");
      return { key, siteKey: key.slice(0, slash), appId: key.slice(slash + 1), rows };
    }
  }
  throw new Error("随包映射里没有按钮数 ≥ 2 的 app，样本取不到");
}

test("随包映射就是 W4 的 schema，且真的有内容", () => {
  assert.equal(SHIPPED.schema, APP_CAPABILITY_MAP_SCHEMA);
  const appCount = Object.keys(SHIPPED.apps).length;
  assert.ok(appCount > 0, "随包映射为空 —— 同步脚本没跑过，36 站一枚按钮都不会长出来");
});

test("H1-a：删掉映射里一行，对应按钮就消失（按钮不是硬编码的）", () => {
  const { siteKey, appId, key, rows } = sampleApp(2);
  const before = appCapabilityEntries(siteKey, appId);
  assert.deepEqual(
    before.map((entry) => entry.family),
    rows.map((row) => row.family),
  );

  const dropped = rows[0].family;
  try {
    registerAppCapabilityMap({
      ...SHIPPED,
      apps: { ...SHIPPED.apps, [key]: rows.slice(1) },
    });
    const after = appCapabilityEntries(siteKey, appId);
    assert.ok(
      !after.some((entry) => entry.family === dropped),
      `删掉 ${key} 的 ${dropped} 之后按钮还在，说明它不是从映射读的`,
    );
    assert.equal(after.length, before.length - 1);
  } finally {
    registerAppCapabilityMap(null);
  }
  assert.equal(appCapabilityEntries(siteKey, appId).length, before.length);
});

test("映射里没有的 app 一枚按钮都没有，也不报错", () => {
  assert.deepEqual(appCapabilityEntries("no-such-site", "no-such-app"), []);
  assert.deepEqual(appCapabilityEntries("", ""), []);
});

test("schema 对不上的映射一律不采信（fail-closed，不猜形状）", () => {
  const { siteKey, appId, key, rows } = sampleApp(1);
  try {
    registerAppCapabilityMap({
      schema: "oceanleo.app-capability-map.v0",
      apps: { [key]: rows },
    });
    assert.deepEqual(appCapabilityEntries(siteKey, appId), []);
  } finally {
    registerAppCapabilityMap(null);
  }
});

test("残缺行与含「插件」的文案都不渲染成按钮（红线 9）", () => {
  assert.equal(isUsableAppCapabilityEntry(null), false);
  assert.equal(
    isUsableAppCapabilityEntry({
      family: "x",
      label: "台账",
      editorCapability: "",
      artifactType: "grid",
    }),
    false,
    "缺 editorCapability 的按钮点下去无处可挂，不许长出来",
  );
  assert.equal(
    isUsableAppCapabilityEntry({
      family: "x",
      label: "台账插件",
      editorCapability: "grid-editor",
      artifactType: "grid",
    }),
    false,
  );
  const map = {
    schema: APP_CAPABILITY_MAP_SCHEMA,
    apps: {
      "s/a": [
        { family: "good", label: "台账", editorCapability: "grid-editor", artifactType: "grid" },
        { family: "bad", label: "台账插件", editorCapability: "grid-editor", artifactType: "grid" },
        { family: "good", label: "台账", editorCapability: "grid-editor", artifactType: "grid" },
      ],
    },
  };
  assert.deepEqual(
    resolveAppCapabilityEntries(map, "s", "a").map((entry) => entry.family),
    ["good"],
    "重复族只保留一枚，含「插件」的一枚不渲染",
  );
});

test("H1-d：选中态只是一个 query，且往返不吃掉别的参数", () => {
  assert.equal(APP_CAPABILITY_QUERY_KEY, "cap");
  const withCap = appCapabilitySearch("?tab=library&item=42", "ledger-register");
  assert.equal(appCapabilityFamilyFromSearch(withCap), "ledger-register");
  const params = new URLSearchParams(withCap.slice(1));
  assert.equal(params.get("tab"), "library");
  assert.equal(params.get("item"), "42");
  const cleared = appCapabilitySearch(withCap, "");
  assert.equal(appCapabilityFamilyFromSearch(cleared), "");
  assert.equal(new URLSearchParams(cleared.slice(1)).get("tab"), "library");
  assert.equal(appCapabilitySearch("", null), "");
});

test("`?cap=` 指到本 app 没有的族 → 解析成 null，不留一枚点不开的按钮", () => {
  const { siteKey, appId, rows } = sampleApp(1);
  assert.equal(
    appCapabilityFromSearch(`?cap=${rows[0].family}`, siteKey, appId)?.family,
    rows[0].family,
  );
  assert.equal(appCapabilityFromSearch("?cap=not-a-family", siteKey, appId), null);
  assert.equal(appCapabilityFromSearch("?cap=", siteKey, appId), null);
});

test("入口侧源码里没有任何站点／app／族清单（H1-a 的另一半）", () => {
  const sources = [
    "src/shell/app-capability-entry.ts",
    "src/shell/AppCapabilityBar.tsx",
    "src/shell/app-capability-context.tsx",
  ].map((path) => ({
    path,
    // 去掉注释：注释里出现「金融计算器」这种举例不算硬编码。
    code: readFileSync(resolve(REPO_ROOT, path), "utf8")
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .replaceAll(/^\s*\/\/.*$/gm, ""),
  }));
  const names = new Set();
  for (const [key, rows] of Object.entries(SHIPPED.apps)) {
    const slash = key.indexOf("/");
    names.add(key.slice(0, slash));
    names.add(key.slice(slash + 1));
    for (const row of rows) {
      names.add(row.family);
      names.add(row.label);
    }
  }
  for (const { path, code } of sources) {
    for (const name of names) {
      assert.ok(
        !code.includes(`"${name}"`),
        `${path} 里写死了 ${name} —— 清单只能来自 W4 的映射`,
      );
    }
    assert.ok(
      !code.includes("插件") || path === "src/shell/app-capability-entry.ts",
      `${path} 出现「插件」字样（红线 9）`,
    );
  }
});
