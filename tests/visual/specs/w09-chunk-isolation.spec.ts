/**
 * 守的是 **W09 的「chunk 失败态 / per-route 隔离」**。
 *
 * ── 为什么被测主体不是 `AdvancedContentWorkbench` ──
 * 交接稿沿用台账 S8：「11 条裸 `next/dynamic`，无 chunk 重试」。
 * `[实测] 2026-08-31 16:2x` 那条已经过期——W09 交卷了，11 条路由现在统一走
 * `lazyRoute()` → `chunkRetryLoader` + `withChunkRetry`（`lib/lazy-with-retry.tsx`）。
 * 顺带一个数数陷阱留给后人：`rg 'dynamic\('` 在那份文件只剩 2 命中，
 * **两条都在注释里**；要数的是 `lazyRoute(`（实测 11 条）。
 *
 * 而 `AdvancedContentWorkbench` 自己在 `useEffect` 之前 `return null`，
 * 静态夹具渲染不出它。W09 真正要守的东西——**chunk 挂了要有可见且可操作的降级**
 * ——落在 `WorkbenchRouteChunkError` 上，那是纯表现型组件，SSR 得出来。
 * 所以这道闸盯失败态本身，而不是盯那个装载不出来的壳。
 *
 * 靶子是操作员贴出来的那次故障：`Model3DRoute_….js` 撞上
 * `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` 之后，编辑器**永远转圈**。
 */
import {
  expect,
  expectMotionSettled,
  expectSubjectCoverable,
  expectSubjectPresent,
  test,
} from "../helpers/fixture";
import { thresholdFor } from "../helpers/thresholds";

test.describe("W09 · chunk 失败态", () => {
  test("两种失败态都渲染成 role=alert，且带可判别的类型标记", async ({
    page,
    openCase,
  }) => {
    const { report } = await openCase("chunkIsolation");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "chunkIsolation");
    await expectSubjectCoverable(page, "chunkIsolation");

    for (const kind of ["network", "stale-version"]) {
      const block = page.locator(
        `[data-leo-slot="${kind}"] [data-workbench-route-error]`,
      );
      await expect(block, `${kind} 失败态没有渲染出来`).toHaveCount(1);
      /**
       * `role="alert"` 不是装饰：读屏用户看不见那块文字，
       * 没有 alert 角色就等于「界面上出现了一个他永远不会被告知的错误」。
       */
      await expect(block, `${kind} 失败态应是 role=alert`).toHaveAttribute(
        "role",
        "alert",
      );
      await expect(block).toHaveAttribute("data-chunk-failure-kind", kind);
    }
  });

  test("失败态里不许再有转圈——那正是操作员看到的故障", async ({
    page,
    openCase,
  }) => {
    const { report } = await openCase("chunkIsolation");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "chunkIsolation");

    /**
     * 这条是本组最有价值的一条，因为它守的是**语义**而不是像素。
     *
     * spinner 的意思是「还在进行」。退避耗尽之后已经不进行了，
     * 这时还转圈就是在骗用户等一个永远不会来的结果——
     * 操作员贴出来的那张图就是这个状态。
     */
    const spinners = page.locator(
      "[data-workbench-route-error] .animate-spin, " +
        "[data-workbench-route-error] [data-workbench-route-loading]",
    );
    expect(
      await spinners.count(),
      "chunk 失败态里出现了 spinner。\n  " +
        "转圈在语义上是「还在进行」，而退避已经耗尽了。\n  " +
        "永久转圈正是这条改动要根治的那个故障（lib/lazy-with-retry.tsx 抬头）。",
    ).toBe(0);
  });

  test("两种失败给两种动作：网络可重试，版本过期只能刷新", async ({
    page,
    openCase,
  }) => {
    const { report } = await openCase("chunkIsolation");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "chunkIsolation");

    const networkSlot = page.locator('[data-leo-slot="network"]');
    await expect(
      networkSlot.locator('[data-chunk-action="retry"]'),
      "网络失败应给「重试」",
    ).toHaveCount(1);
    await expect(
      networkSlot.locator('[data-chunk-action="reload"]'),
      "网络失败不该给「刷新页面」——它没坏到需要刷新",
    ).toHaveCount(0);

    const staleSlot = page.locator('[data-leo-slot="stale-version"]');
    await expect(
      staleSlot.locator('[data-chunk-action="reload"]'),
      "版本过期应给「刷新页面」",
    ).toHaveCount(1);
    /**
     * 这半条是整组的关键。chunk 404 意味着部署换了版、旧 chunk 名已经不存在，
     * 重试多少次都变不出那个文件。给一个「重试」按钮，用户会在一个
     * **永远不会成功**的按钮上反复点——比不给按钮更糟。
     */
    await expect(
      staleSlot.locator('[data-chunk-action="retry"]'),
      "版本过期**不该**给「重试」：旧 chunk 已经不存在，重试永远不会成功。\n  " +
        "把两种失败合成一个重试按钮，是这条改动明确要避免的退化。",
    ).toHaveCount(0);
  });

  test("失败态留在窗格内，不是全屏遮罩（per-route 隔离的外在表现）", async ({
    page,
    openCase,
  }) => {
    const { report } = await openCase("chunkIsolation");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "chunkIsolation");

    /**
     * per-route 隔离的用户可见含义：一条路由的 chunk 挂了，外壳、编辑栏、
     * 素材库都还在，用户能直接切到别的素材。
     * 静态夹具测不了「切到别的素材」，但测得了**这块东西有没有越界**——
     * 一旦它变成 `position: fixed` 或长出 portal，隔离就已经破了。
     */
    const position = await page
      .locator("[data-workbench-route-error]")
      .first()
      .evaluate((node) => getComputedStyle(node).position);
    expect(
      position,
      `失败态的 position 是 ${position}，不该是 fixed。\n  ` +
        "fixed 会让一条路由的失败盖住整个界面，那就不再是 per-route 隔离了。",
    ).not.toBe("fixed");

    const inStage = await page
      .locator("[data-workbench-route-error]")
      .first()
      .evaluate((node) => Boolean(node.closest("#leo-stage")));
    expect(
      inStage,
      "失败态跑到了夹具舞台之外，说明它用了 portal。\n  " +
        "WorkbenchRouteLoading.tsx 的抬头明确写了这一块**不用 portal**，" +
        "就是为了让它待在编辑器窗格里。",
    ).toBe(true);
  });
});
