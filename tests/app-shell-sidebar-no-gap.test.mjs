// 侧栏底下不许留白。
//
// 这条测试锁的是一个真实缺陷（2026-08-19，操作员截图 oceanleo.cn 首页滚到底）：
// 侧栏当时是 `md:sticky`，而 sticky 元素的活动范围被自己的父块夹死。消费站的根布局
// 会在外壳**之后**再挂东西——境内站的 ICP 备案页脚就是这么挂的（每个站仓自己的
// `app/_components/icp-beian-footer.tsx`，34 个仓各一份，不可能靠改消费站收口）——
// 那一条高度不在外壳里面，于是页面滚到底时侧栏左下角露出一条空白。
//
// 判据因此写在「侧栏用什么定位」上，而不是写在某个站的页脚上：
//   1. 侧栏必须 fixed（高度只跟视口有关），且不许再出现 sticky；
//   2. fixed 不占文档流，所以必须有一个同宽的占位块；
//   3. 收起态与展开态两者宽度必须一致，否则主区会盖到侧栏上或空出一条。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile("src/shell/AppShell.tsx", "utf8");

const asideAt = source.indexOf("data-oceanleo-chrome\n        className={`hidden h-screen");
const aside = source.slice(asideAt, source.indexOf("</aside>", asideAt));

test("桌面侧栏钉在视口上，不再是 sticky", () => {
  assert.ok(asideAt > 0, "没找到桌面侧栏那个 aside");
  assert.match(aside, /md:fixed/);
  assert.match(aside, /md:top-0/);
  assert.match(aside, /md:start-0/, "用逻辑方向 start，阿拉伯语等 RTL 语言下侧栏才不会跑到反面");
  assert.equal(
    /md:sticky/.test(aside),
    false,
    "sticky 会被父块夹住，页面下面挂了备案页脚就会在侧栏底下留白",
  );
});

test("有同宽占位块，且与侧栏的收起/展开宽度一一对应", () => {
  const spacerAt = source.indexOf("data-oceanleo-sidebar-spacer");
  assert.ok(spacerAt > 0, "侧栏 fixed 之后必须有占位块，否则主区会被侧栏盖住");
  const spacer = source.slice(spacerAt - 200, spacerAt + 400);

  const widths = (block) => ({
    collapsed: /collapsed \? "w-0/.test(block),
    expanded: /w-\[256px\]/.test(block),
  });
  assert.deepEqual(widths(spacer), widths(aside), "占位块与侧栏必须同宽同步");
  assert.match(spacer, /aria-hidden="true"/, "占位块只是让位用的，不该被读屏软件念出来");
  assert.match(
    spacer,
    /data-oceanleo-chrome/,
    "内嵌（?embed=1）时 EmbedChrome 靠这个属性把外壳藏掉；漏挂就会在 iframe 里留一条 256px 空白",
  );
});
