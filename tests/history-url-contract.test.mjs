import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/shell/HistoryMasterDetail.tsx", import.meta.url),
  "utf8",
);

test("聚合历史与单站历史都把选中记录写入 URL", () => {
  const clickStart = source.indexOf("onClick={() => {", source.indexOf("items.map"));
  const clickEnd = source.indexOf("className=", clickStart);
  assert.notEqual(clickStart, -1);
  assert.notEqual(clickEnd, -1);
  const clickHandler = source.slice(clickStart, clickEnd);
  // 选中记录写进 URL 的行为不变；`pathname` 第二参是 W44–W46（`e56a68c`）加的融合挂载
  // 前缀（门户里嵌着打开时 href 要带当前挂载段，否则点一条记录会跳出门户）。
  assert.match(clickHandler, /router\.push\(historyHrefFor\(entry, pathname\)\)/);
  assert.match(source, /function historyHrefFor\(entry: HistoryListEntry, pathname = ""\)/);
  assert.match(source, /historySessionHref\(entry\.id, undefined, pathname\)/);
  assert.doesNotMatch(source, /advancedFeatureHref/);
  assert.doesNotMatch(source, /tt\("高级任务"\)/);
  assert.doesNotMatch(clickHandler, /if \(!siteId\) return/);
});

test("HistoryDetail 刷新动态路由时直接从 pathname 恢复，不依赖侧栏先同步", () => {
  assert.match(source, /const detailPathname = usePathname\(\) \|\| ""/);
  assert.match(
    source,
    /const sel =\s*historySessionIdFromPath\(detailPathname\) \|\| selected/,
  );
  assert.match(source, /siteId && session\.site_id !== siteId/);
});
