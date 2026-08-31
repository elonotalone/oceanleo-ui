/**
 * P3 · 交互延迟预算。截图守外观，这一组守**手感**。
 *
 * 单独跑在 `budget` project 上（`playwright.config.ts`）：`visual` project 开了
 * `animations:'disabled'`，那会改写渲染时序，用它量出来的 `performance.measure`
 * 不是用户会遇到的那个数。
 *
 * ── 先把话说清楚：任务书点名的三条，今天量不了 ──
 * `W10.md` P3 要的是「打开弹层 / 切换编辑器路由 / 编辑栏收缩」。
 * 这三条**都需要真实客户端状态机**：弹层要活的 `anchorRef` 且走 portal（W03），
 * 编辑栏要活的 `controller.portalRoot` 且走 portal（W02），
 * 路由切换要 `AdvancedContentWorkbench` 挂载完成（它 `useEffect` 之前 `return null`）。
 * 静态夹具一个都渲染不出来 ⇒ 量不到，见本文件最后一条（判红存档，不静默跳过）。
 *
 * 那这组还剩什么价值？**剩真的那一半。**
 * 下面两条量的是浏览器级的真实交互：悬停引发的样式重算、键盘聚焦引发的重绘。
 * 它们跑在**真组件 + 31 个站生产加载的那份 ui.css** 上，
 * 所以「有人给按钮加了一条昂贵的 filter / box-shadow」这类退化，这里抓得住。
 * 这不是任务书要的那三条，但它是今天能实测出来的、真的数——
 * 与其编三个漂亮的假数字，不如给两个真的加一条诚实的红。
 */
import { judge, type BudgetVerdict } from "../helpers/budget";
import { expect, expectMotionSettled, expectSubjectPresent, test } from "../helpers/fixture";

/**
 * 每条交互取 24 个样本。
 *
 * 为什么是 24 而不是 20：`budget.ts` 的 `p95()` 在样本 <20 时会退化成取最大值
 * （保守方向）。刚好 20 会让任何一次丢样都掉进退化分支，而退化了却没人知道。
 * 多给 4 个是留白，不是凑数。
 */
const SAMPLES = 24;

function report(verdict: BudgetVerdict): void {
  // 让读数出现在 list reporter 里：预算这种东西，绿着的时候也要能看见数。
  // eslint-disable-next-line no-console
  console.log(`[leo-budget] ${verdict.message}`);
  expect(verdict.kind, verdict.message).not.toBe("exceeded");
}

test.describe("P3 · 交互延迟预算", () => {
  test("hover 引发的样式重算 p95 在预算内", async ({ page, openCase }) => {
    const { report: settleReport } = await openCase("button");
    expectMotionSettled(settleReport);
    await expectSubjectPresent(page, "button");

    const samples = await page.evaluate(async (count) => {
      const target = document.querySelector<HTMLElement>(
        '[data-leo-slot="secondary-lg-rest"] button',
      );
      if (!target) return [];
      const out: number[] = [];
      for (let i = 0; i < count; i += 1) {
        const result = await (window as any).__leoVisual.measure(
          `hover-${i}`,
          () => {
            /**
             * `:hover` 没法用脚本直接置上，但**样式重算本身**是可以逼出来的：
             * 换一个真实存在于变体类里的属性，再强制读一次布局，
             * 量到的就是「浏览器为这枚按钮重算一次样式 + 布局」的墙钟时间。
             * 这正是悬停时真实发生的那件事。
             */
            target.classList.toggle("leo-budget-probe");
            void target.offsetHeight;
          },
          () => true,
        );
        out.push(result.duration);
      }
      return out;
    }, SAMPLES);

    expect(
      samples.length,
      "一个样本都没取到，说明目标按钮没渲染出来（应先被 expectSubjectPresent 拦住）",
    ).toBe(SAMPLES);

    report(
      judge(
        "button-hover-restyle",
        samples,
        "Button secondary/lg 悬停样式重算 + 强制布局，24 样本，静态夹具，单 worker",
      ),
    );
  });

  test("键盘聚焦引发的焦点环绘制 p95 在预算内", async ({ page, openCase }) => {
    const { report: settleReport } = await openCase("button");
    expectMotionSettled(settleReport);
    await expectSubjectPresent(page, "button");

    /**
     * ⚠️ `[实测] 2026-08-31 18:2x` **`:not([disabled])` 是补上去的，缺了它这条用例会挂死 60 秒。**
     *
     * 原先取的是 `[data-leo-slot] button` 全部 24 枚，而 W04 的矩阵里
     * **五种状态包含 disabled**。对 disabled 元素调 `focus()` 是 no-op，
     * `document.activeElement === target` 这个谓词于是**永远不成立**。
     * `harness.js` 的 `waitFor` 有 5 秒上限（会 resolve(false) 而不是永久挂起），
     * 所以不是死循环——但 24 个样本里只要轮到几枚 disabled，
     * 每枚就白烧 5 秒，累计轻松超过 60 秒的用例上限。
     * 实测表现就是 `page.evaluate` 处 `Test timeout of 60000ms exceeded`。
     *
     * **挂死比判红更糟**：判红会告诉你哪条不变量破了，挂死只烧掉一分钟、
     * 什么读数都不留，还会让人以为是机器慢。
     *
     * 语义上也应该这么改：这条量的是「焦点环画出来要多久」，
     * 而 disabled 按钮本来就不该拿到焦点（`w04-button-matrix.spec.ts` 里
     * 「disabled 不靠 pointer-events 假装，而是真的 disabled」正是守这一条）。
     * 把量不了的对象排除掉，不是放宽判据。
     */
    const samples = await page.evaluate(async (count) => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-leo-slot] button:not([disabled])",
        ),
      );
      if (buttons.length === 0) return [];
      const out: { duration: number; settled: boolean }[] = [];
      for (let i = 0; i < count; i += 1) {
        const target = buttons[i % buttons.length];
        const result = await (window as any).__leoVisual.measure(
          `focus-${i}`,
          () => {
            target.focus();
            void target.offsetHeight;
          },
          () => document.activeElement === target,
        );
        out.push({ duration: result.duration, settled: result.settled });
      }
      return out;
    }, SAMPLES);

    expect(samples.length, "一个样本都没取到").toBe(SAMPLES);

    /**
     * 没稳定下来的样本**不许混进 p95**。它的 duration 是 `waitFor` 的 5 秒上限，
     * 不是真实的绘制耗时；混进去会把预算基线抬到一个假的高位，
     * 而预算「只减不增」意味着那个假高位会**永久留在盘上**。
     */
    const unsettled = samples.filter((s) => !s.settled).length;
    expect(
      unsettled,
      `${unsettled}/${samples.length} 个样本没等到 activeElement 落到目标上。\n  ` +
        "这些样本的 duration 是 waitFor 的 5 秒上限而不是真实耗时；\n  " +
        "让它们进 p95 会把预算基线钉在一个假的高位上，而预算只减不增 ⇒ 假高位会永久留下。",
    ).toBe(0);

    report(
      judge(
        "button-focus-ring",
        samples.map((s) => s.duration),
        "Button 焦点环绘制（focus + 强制布局），24 样本轮流打在**可聚焦**按钮上（disabled 不计，见上）",
      ),
    );
  });

  test("任务书点名的三条交互 —— 今天量不到，判红存档", async ({ openCase }) => {
    const { report: settleReport } = await openCase("editBar");
    expectMotionSettled(settleReport);

    /**
     * 不 skip、不给假数字。
     *
     * 给假数字是这一组最容易犯也最坏的错：预算文件里一旦落下
     * `overlay-open: 12ms`，后人会以为这条交互被守着，而它其实从来没被量过。
     * 预算**只减不增**（`budget.ts`），一个假的低基线还会让真实现值永远判红，
     * 逼着后人去调宽预算——那时这道闸就彻底废了。
     *
     * 所以：红着，并说清楚解封条件。
     */
    const blocked = ["overlay-open", "editor-route-switch", "edit-bar-collapse"];
    expect(
      blocked.length,
      [
        "任务书 P3 点名的三条交互今天量不到，且刻意不落假基线：",
        `  ${blocked.join(" / ")}`,
        "",
        "原因：三条都需要真实客户端状态机——",
        "  overlay-open        W03 要活的 anchorRef，且走 portal",
        "  edit-bar-collapse   W02 要活的 controller.portalRoot，且走 portal",
        "  editor-route-switch AdvancedContentWorkbench 在 useEffect 前 return null",
        "静态夹具（预渲染 HTML，无客户端 React）一个都渲染不出来。",
        "",
        "解封条件：给夹具页加客户端 hydration。代价与做法见",
        "  docs/testing/visual-regression.md §这道闸守不住什么",
        "这条红归 W10 的覆盖边界，**不记 W02/W03/W09 的人头**。",
      ].join("\n  "),
    ).toBe(0);
  });
});
