/**
 * 守的是 **W06 的「素材网格 1,000 项的挂载节点数」**。
 *
 * 判据本体是**节点数**，不是像素：虚拟化被摘掉时，1,000 项会全部挂上 DOM，
 * 页面从「滚起来顺」变成「滚一下卡半秒」。截图看不出这件事，节点数一眼就看得出。
 *
 * ── 今天覆盖不到，原因记清楚 ──
 * `MaterialLibrary` **在位**（`src/shell/MaterialLibrary.tsx:7` 再导出自
 * `./material-library-view`），但本闸加载不动它，实测两条：
 *   1. 它落在一条跨 6 个文件的循环依赖里
 *      （MaterialLibrary → material-library-view → AdvancedContentWorkbench →
 *       UnsupportedRoute → AdvancedWorkbenchShell → InlineAdvancedWorkbenchShell …），
 *      而 `tests/helpers/module-bench.mjs` 的 `data:` 模块表达不了环——
 *      这是它自己报错时说的话，不是我猜的；
 *   2. 组件挂了一串 effect 与外部订阅（`material-library-effects`），SSR 只出骨架。
 * ⇒ 判红且**记在 W10 头上**，不是 W06 的欠账。
 *
 * module-bench 的报错顺带给了出路：「把环上任意一份在桩表里换成替身即可」。
 * 那是本闸下一轮该做的事，代价与做法写进运行手册 §这道闸守不住什么。
 */
import { SUBJECTS } from "../harness/subjects.mjs";
import {
  expect,
  expectMotionSettled,
  expectSubjectCoverable,
  expectSubjectPresent,
  test,
} from "../helpers/fixture";

const { itemCount } = SUBJECTS.materialGrid as { itemCount: number };

test.describe("W06 · 素材网格虚拟化", () => {
  test("主体在位（导出没被改名或删掉）", async ({ page, openCase }) => {
    const { report } = await openCase("materialGrid");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "materialGrid");
  });

  test("1,000 项的挂载节点数远小于 1,000", async ({ page, openCase }) => {
    const { report } = await openCase("materialGrid");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "materialGrid");

    // 覆盖边界的红先出：主体渲染不出来时，下面的节点数断言没有意义。
    await expectSubjectCoverable(page, "materialGrid");

    /**
     * 阈值取 1/4（250）而不是某个精确窗口大小。
     *
     * 精确值会随视口高度、卡片尺寸、overscan 参数变，写死等于给自己造一条
     * 每次调样式都要来改一遍的假阳性。而这条要抓的退化只有一种：
     * **虚拟化被整个摘掉**——那时节点数会是 1,000，离 250 差了四倍，
     * 任何合理的窗口大小都不会误伤。宁可粗，也不要一条要人天天维护的判据。
     */
    const rendered = await page
      .locator("[data-leo-slot] [data-material-item], [data-leo-slot] [data-material-id]")
      .count();
    expect(
      rendered,
      `挂载了 ${rendered} 个素材节点，投喂的是 ${itemCount} 项。\n  ` +
        "接近 1,000 说明虚拟化被摘掉了：31 个站的素材库会一起变卡。",
    ).toBeLessThan(itemCount / 4);
    expect(
      rendered,
      "一个素材节点都没挂上，说明选择器对不上或组件没渲染——\n  " +
        "这条不该被当成「虚拟化很好」而放过去。",
    ).toBeGreaterThan(0);
  });
});
