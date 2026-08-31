/**
 * 守的是 **W02 的「编辑栏展开态 / 收缩圆形态 / 拖拽中三态」**，
 * 外加 W02 对整套闸的那件公共义务：`window.__leoMotionJumpAllToRest()`。
 *
 * ── 覆盖到哪、没覆盖到哪，说清楚 ──
 * `FloatingContextToolbar` **在位**（`src/shell/FloatingContextToolbar.tsx:43`），
 * 但它开头两行就是 `if (!children) return null` 与
 * `if (!controller.portalRoot) return null`，随后整体 `createPortal(...)`。
 * `react-dom/server` 不支持 portal，`controller` 又是活的控制器对象而非 plain props
 * ——静态夹具永远拿到空串。所以三态截图这一半，本闸今天**够不着**。
 *
 * 够不着就红，且这条红**记在 W10 头上，不记 W02 头上**
 * （`helpers/fixture.ts` 的 `expectSubjectCoverable` 解释了为什么两种红必须分开）。
 * 不 skip：skip 会从报表里消失，三个月后没人记得这一格从来没被守过。
 *
 * 但 W02 真正影响**其余八组**的那件事是测得到的，见下面第一条。
 */
import { SUBJECTS } from "../harness/subjects.mjs";
import {
  expect,
  expectMotionSettled,
  expectSubjectCoverable,
  expectSubjectPresent,
  test,
} from "../helpers/fixture";

test.describe("W02 · 编辑栏与 spring 原语", () => {
  /**
   * 这条是整套闸的地基，价值比三态截图高得多。
   *
   * Playwright 的 `animations:'disabled'` 只关 CSS 动画与过渡，**不停 JS 驱动的
   * rAF 弹簧**。没有这个钩子，其余八组的截图都会在「弹簧还在动」的随机某一帧上拍下来，
   * 表现为「每次差几个像素」——最难查的一类假阳性。
   *
   * 所以钩子缺失一律判红、不许绕过（`W10.md` P2②）。
   * 它今天是绿的（实测钩子能加载进夹具页），这条用例的作用是**锁住它别再消失**。
   */
  test("__leoMotionJumpAllToRest 挂得上、调得动", async ({ openCase }) => {
    const { report } = await openCase("editBar");
    expectMotionSettled(report);

    expect(
      report.springModule,
      "spring 原语必须能被加载进夹具页——其余八组的截图确定性全靠它。",
    ).toBe("loaded");
    expect(report.hookPresent, "钩子必须挂在 window 上").toBe(true);
    expect(report.hookCalled, "钩子必须能被调用且不抛").toBe(true);
  });

  test("夹具页带着 data-leo-motion-test，钩子那道门才会开", async ({
    page,
    openCase,
  }) => {
    await openCase("editBar");
    /**
     * `src/lib/motion/index.ts:41-46` 的门是
     * 「`NODE_ENV !== 'production'` **或** `<html>` 带 `data-leo-motion-test`」。
     * 夹具页靠的是后者（`harness/page-template.mjs`）。
     * 这条把那份契约钉在闸这一侧：哪天 W02 改了属性名，这里会先红，
     * 而不是等到八组截图一起开始随机漂移才有人发现。
     */
    await expect(
      page.locator("html"),
      "夹具页 <html> 必须带 data-leo-motion-test=1，否则钩子那道门不开",
    ).toHaveAttribute("data-leo-motion-test", "1");
  });

  test("主体在位（导出没被改名或删掉）", async ({ page, openCase }) => {
    await openCase("editBar");
    /**
     * 即使渲染不出来，也要确认导出还在。
     * `prerender.mjs` 的 `sourceDeclaresExport()` 会读源码复核，
     * 所以这条红只在**真的没有这个导出**时才出现——那才是 W02 的账。
     */
    await expectSubjectPresent(page, "editBar");
  });

  test("三态截图 —— 本闸覆盖不到，判红存档", async ({ page, openCase }) => {
    const { report } = await openCase("editBar");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "editBar");

    expect(
      (SUBJECTS.editBar as { states: string[] }).states,
      "三态清单不该变；变了说明 W02 的形态定义改了，截图判据要跟着重写。",
    ).toEqual(["expanded", "collapsed", "dragging"]);

    // 红在这里。文案会说清楚这是闸的边界，不是 W02 的欠账。
    await expectSubjectCoverable(page, "editBar");
  });
});
