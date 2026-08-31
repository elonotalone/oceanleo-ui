/**
 * 守的是 **W07 的「卡片加载前后几何不变」**。
 *
 * 判据本体是**几何数字**（`getBoundingClientRect()` 逐字段相等），截图只作佐证。
 * 这个顺序是刻意的：布局跳动是「差几个像素」的典型来源，
 * 而截图闸对它的报告方式是「有 0.6% 的像素不一样」——那句话没法让人知道
 * 是骨架屏比真卡片矮了 2px。几何断言会直接说出是哪一边、差多少。
 *
 * 今天是**真缺席**：`MaterialCard` 在 `src/` 零命中
 * （标识符级别 0 处，已按 `_COMMON` §7b③ 用同一条正则在 `MaterialLibrary` 上验过
 * 能命中再导出写法，所以零命中是事实而不是正则写错）。
 * ⇒ 这条红记在 W07 头上。
 */
import { SUBJECTS } from "../harness/subjects.mjs";
import {
  expect,
  expectMotionSettled,
  expectSubjectCoverable,
  expectSubjectPresent,
  test,
} from "../helpers/fixture";
import { thresholdFor } from "../helpers/thresholds";

const { states } = SUBJECTS.card as { states: string[] };

test.describe("W07 · 卡片几何", () => {
  test("加载前后 getBoundingClientRect 逐字段相等", async ({ page, openCase }) => {
    const { report } = await openCase("card");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "card");
    await expectSubjectCoverable(page, "card");

    expect(states, "两态清单").toEqual(["loading", "loaded"]);

    const boxes: Record<string, DOMRect | null> = {};
    for (const state of states) {
      boxes[state] = (await page
        .locator(`[data-leo-slot="${state}"] > *`)
        .first()
        .evaluate((node) => node.getBoundingClientRect().toJSON())) as DOMRect;
    }

    /**
     * 只比 width/height，不比 top/left：两个槽position 本来就上下排开，
     * 坐标必然不同。会引起布局跳动的是**尺寸**，不是它在夹具页里的位置。
     * 比 top/left 会得到一条恒红且毫无信息量的判据。
     */
    for (const field of ["width", "height"] as const) {
      expect(
        boxes.loaded?.[field],
        `卡片 ${field} 在 loading → loaded 之间变了：` +
          `${boxes.loading?.[field]} → ${boxes.loaded?.[field]}。\n  ` +
          "骨架屏与真卡片尺寸不一致 = 图一加载完，它下面的东西全往下跳一次。\n  " +
          "这是「死板」之外用户最直接能感到的廉价感来源。",
      ).toBe(boxes.loading?.[field]);
    }
  });

  test("两态截图（佐证用）", async ({ page, openCase }) => {
    const { report, masks } = await openCase("card");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "card");
    await expect(page).toHaveScreenshot("w07-card-geometry.png", {
      mask: masks,
      ...thresholdFor("w07-card-geometry"),
    });
  });
});
