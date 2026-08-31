/**
 * 守的是 **W07 的「卡片加载前后几何不变」**。
 *
 * 判据本体是**几何数字**（`getBoundingClientRect()` 逐字段相等），截图只作佐证。
 * 这个顺序是刻意的：布局跳动是「差几个像素」的典型来源，
 * 而截图闸对它的报告方式是「有 0.6% 的像素不一样」——那句话没法让人知道
 * 是骨架屏比真卡片矮了 2px。几何断言会直接说出是哪一边、差多少。
 *
 * ⚠️ **本文件抬头 2026-08-31 17:5x 整段改写过，因为原文写的是一条假事实。**
 * 原文说「今天是真缺席：`MaterialCard` 在 `src/` 零命中 ⇒ 这条红记在 W07 头上」。
 * **零命中属实，由它推出的结论错了**——这是本套件第四次踩同一个坑
 * （前三次：`Button` 指错桶文件、`Toast` 找错导出名、`UploadProgress` 指错模块）。
 *
 * `[实测]` 两截依据都不成立：`MaterialLibrary.tsx` 是个 454 字节的兼容立面，
 * 自陈 "Compatibility facade"，**从来没有过 `MaterialCard` 这个导出**；
 * 而 W07 早已交卷（`verdicts/W07-delivery.md` §1 落点表），稳定宽高比落在
 * `src/shell/workspace-library-thumbnail.tsx` 的 `WorkspaceThumbnail`(:57)。
 *
 * 红的性质与归属都跟着变：不是「W07 没交」，而是**「W07 交了，本闸够不着」**——
 * `WorkspaceThumbnail` 同时调 `useUI()`（要 I18nProvider）与
 * `useArtifactRendition()`（活状态钩子），静态夹具两样都给不出。
 * ⇒ 按 `_COMMON` §8，**不记 W07 人头**，记本闸的覆盖边界。
 *
 * **并且这条不变量今天并非无人看守**，所以它的解封优先级低于其余几条：
 * W07 自己的 `tests/media-aspect-stability.test.mjs`（11 例，`adcf5e6`）已经锁住了它，
 * 判据比截图更锐利——`data-cover-aspect` 在 `<img>` 的 `load` **和** `error`
 * 前后逐字相等。本闸补上只是多一层像素佐证，不是从零到一。
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
    // 见 `w05-toast.spec.ts` 同一处的长注释：凡 `toHaveScreenshot` 之前必有这一行，
    // 否则 `needs-client` 主体会被 `--update-snapshots` 写成一张占位符基线（假绿）。
    await expectSubjectCoverable(page, "card");
    await expect(page).toHaveScreenshot("w07-card-geometry.png", {
      mask: masks,
      ...thresholdFor("w07-card-geometry"),
    });
  });
});
