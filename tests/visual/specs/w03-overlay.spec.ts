/**
 * 守的是 **W03 的「弹层进场（origin-correct）/ 退场 / focus 环」**。
 *
 * `AnchoredPopover` **在位**（`src/shell/anchored-popover.tsx:474`），
 * 但它的 props 面要 `anchorRef: RefObject<HTMLElement|null>`——定位全靠对真实锚点量
 * `getBoundingClientRect()`，SSR 下没有布局，量不出东西；而且同样走 portal。
 * ⇒ 静态夹具够不着，判红且**记在 W10 头上**（见 `helpers/fixture.ts`）。
 *
 * origin-correct 尤其够不着，而它恰恰是这条改动里最要紧的一件事：
 * `_COMMON` §3 的三条判据第一条就是「**有来源**：菜单从你点的那个按钮长出来，
 * 不是从屏幕中间淡入」。要测它必须有真实锚点几何，也就必须有活的客户端。
 * 这条限制写进运行手册 §这道闸守不住什么，不许含糊过去。
 */
import { SUBJECTS } from "../harness/subjects.mjs";
import {
  expect,
  expectMotionSettled,
  expectSubjectCoverable,
  expectSubjectPresent,
  test,
} from "../helpers/fixture";

test.describe("W03 · 弹层", () => {
  test("主体在位（导出没被改名或删掉）", async ({ page, openCase }) => {
    const { report } = await openCase("overlay");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "overlay");
  });

  test("进场曲线所需的 token 在产物里解析得出来", async ({ page, openCase }) => {
    const { report } = await openCase("motionTokens");
    expectMotionSettled(report);

    /**
     * 弹层三态截图够不着，但它**依赖**的那条入场曲线够得着。
     * `--leo-ease-decelerate` 是规范指定的入场曲线（从无到有），
     * `globals.css` 的 `.leo-pop-in` 就用它。这条在这里再兜一次，
     * 是因为 W03 的进场一旦退回默认 ease，用户能直接看出来，
     * 而三态截图今天守不住那件事。
     */
    const raw = await page
      .locator('[data-leo-token="--leo-ease-decelerate"]')
      .evaluate((node) =>
        getComputedStyle(node).getPropertyValue("transition-timing-function").trim(),
      );
    expect(
      raw,
      "--leo-ease-decelerate 解析不出来。弹层进场会退回默认 ease，肉眼可见地变木。\n  " +
        "先查 W01 的 token 有没有进 ui.css（见 w01-motion-tokens.spec.ts 的诊断）。",
    ).not.toBe("");
  });

  test("三态与 origin-correct —— 本闸覆盖不到，判红存档", async ({
    page,
    openCase,
  }) => {
    const { report } = await openCase("overlay");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "overlay");

    expect(
      (SUBJECTS.overlay as { states: string[] }).states,
      "三态清单不该变；变了说明 W03 的形态定义改了，截图判据要跟着重写。",
    ).toEqual(["enter", "exit", "focus-ring"]);

    await expectSubjectCoverable(page, "overlay");
  });
});
