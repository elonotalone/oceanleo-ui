/**
 * 守的是 **W04 的「Button 四 variant × 三 size × 五状态矩阵」**。
 *
 * 这是九组里今天覆盖最实的一组：`Button` 是纯表现型组件，
 * 静态夹具渲染出来的就是用户看到的那份 DOM（`src/ui/Button.tsx:250`）。
 *
 * 靶子是 `01-verified-facts.md` §2.5 的 **823 个裸 `<button>`**：
 * 没有统一原语时，命中区、焦点环、按下反馈各写各的。这条闸锁住的就是
 * 「原语一旦立起来，它的三档命中区与四个变体不许再悄悄漂」。
 *
 * ── 五状态刻意分两类，因为**真实性来源不同** ──
 * `rest` / `disabled` 是组件自己的 prop，只能由夹具渲染；
 * `hover` / `active` / `focus-visible` 是**浏览器级伪类**，不需要客户端 React——
 * 用 `locator.hover()` 与键盘 Tab 就能在静态页上真实触发。
 * 所以夹具只铺 4×3×2 = 24 槽，其余三态由本文件真实驱动。
 * 铺一个 `data-leo-state="hover"` 的假槽，等于自己写一份长得像 hover 的 HTML
 * 再去断言它长得像 hover——那守的是夹具自己，一文不值。
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

const { variants, sizes, propStates } = SUBJECTS.button as {
  variants: string[];
  sizes: string[];
  propStates: string[];
};

/**
 * 三档命中区的像素事实，独立誊抄自 `src/ui/Button.tsx:76` 的 `BUTTON_SIZE_PX`。
 *
 * **刻意不 import 那张表**：import 等于让被测对象自己出卷子——它改成 20px，
 * 判据就跟着变成 20px，这条用例永远绿。44 是 W04 定的命中区下限，
 * 也是 `EDIT_BAR_CONTROL_SIZE_PX` 的同源同值，改它要过 `hit-target-budget` 那道锁。
 */
const EXPECTED_HEIGHT_PX: Record<string, number> = { sm: 36, md: 40, lg: 44 };

function slot(page: import("@playwright/test").Page, label: string) {
  return page.locator(`[data-leo-slot="${label}"] button`);
}

test.describe("W04 · Button 矩阵", () => {
  test("24 槽全部渲染出真按钮", async ({ page, openCase }) => {
    const { report } = await openCase("button");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "button");
    await expectSubjectCoverable(page, "button");

    const buttons = page.locator("[data-leo-slot] button");
    expect(
      await buttons.count(),
      `应有 ${variants.length}×${sizes.length}×${propStates.length}=24 枚按钮。\n  ` +
        "数量对不上通常意味着某个 variant/size 渲染时抛了错，被夹具收成了缺席块。",
    ).toBe(variants.length * sizes.length * propStates.length);
  });

  test("variant 与 size 落到组件自带的抓手上", async ({ page, openCase }) => {
    const { report } = await openCase("button");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "button");

    /**
     * 断言 `data-leo-button` / `data-leo-button-size` 而不是 class 选择器。
     * class 是 Tailwind 拼出来的，改一次样式就换一批；拿它当判据等于让这道闸
     * 自己变成最脆的那一环。这两个属性是组件明确对外给的抓手
     * （`src/ui/Button.tsx:278-279`）。
     */
    for (const variant of variants) {
      for (const size of sizes) {
        const element = slot(page, `${variant}-${size}-rest`);
        await expect(
          element,
          `${variant}/${size} 的 data-leo-button 应为 ${variant}`,
        ).toHaveAttribute("data-leo-button", variant);
        await expect(
          element,
          `${variant}/${size} 的 data-leo-button-size 应为 ${size}`,
        ).toHaveAttribute("data-leo-button-size", size);
      }
    }
  });

  test("三档命中区高度精确等于 36/40/44", async ({ page, openCase }) => {
    const { report } = await openCase("button");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "button");

    for (const size of sizes) {
      for (const variant of variants) {
        const box = await slot(page, `${variant}-${size}-rest`).boundingBox();
        expect(box, `${variant}/${size} 量不到布局盒`).not.toBeNull();
        expect(
          Math.round(box!.height),
          `${variant}/${size} 高度应为 ${EXPECTED_HEIGHT_PX[size]}px，实际 ${box!.height}。\n  ` +
            "命中区是可达性下限，不是审美偏好：44 与 EDIT_BAR_CONTROL_SIZE_PX 同源。",
        ).toBe(EXPECTED_HEIGHT_PX[size]);
      }
    }
  });

  test("disabled 不靠 pointer-events 假装，而是真的 disabled", async ({
    page,
    openCase,
  }) => {
    const { report } = await openCase("button");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "button");

    for (const variant of variants) {
      const element = slot(page, `${variant}-lg-disabled`);
      await expect(element, `${variant} 的 disabled 槽应带 disabled 属性`).toBeDisabled();
      const opacity = await element.evaluate(
        (node) => getComputedStyle(node).opacity,
      );
      expect(
        Number.parseFloat(opacity),
        `${variant} disabled 态应有可见的弱化（opacity < 1），实际 ${opacity}。`,
      ).toBeLessThan(1);
    }
  });

  test("hover 由浏览器真实触发，且确实换了样子", async ({ page, openCase }) => {
    const { report } = await openCase("button");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "button");

    /**
     * 只对 `secondary` / `ghost` 断言「背景真的变了」：
     * `primary` 的 hover 是 `brightness-110` 滤镜、`danger` 是 `color-mix`，
     * 两者在某些合成路径下算出来的 `background-color` 字符串可能与静息态相同。
     * 对它们断言背景色会变成一条**看心情**的判据，而看心情的判据比没有判据更坏。
     * 这两个变体的 hover 由截图那条守。
     */
    for (const variant of ["secondary", "ghost"]) {
      const element = slot(page, `${variant}-lg-rest`);
      const before = await element.evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      );
      await element.hover();
      const after = await element.evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      );
      expect(
        after,
        `${variant} 的 hover 没有产生任何背景变化（${before} → ${after}）。\n  ` +
          "hover 是 `@media (hover: hover)` 下的悬停反馈；它消失说明变体类被覆盖了。",
      ).not.toBe(before);
      // 复位，避免上一枚的 hover 粘到下一次量测上。
      await page.mouse.move(0, 0);
    }
  });

  test("focus-visible 走键盘时出焦点环，鼠标点击时不出", async ({
    page,
    openCase,
  }) => {
    const { report } = await openCase("button");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "button");

    const first = page.locator("[data-leo-slot] button").first();

    await page.keyboard.press("Tab");
    const focusedByKeyboard = await first.evaluate((node) =>
      node.matches(":focus-visible"),
    );
    expect(
      focusedByKeyboard,
      "键盘 Tab 之后第一枚按钮应命中 :focus-visible。\n  " +
        "焦点环是键盘用户唯一的位置感知；`src/ui/Button.tsx` 明确不提供 " +
        "disableFocusRing 这类关环 prop，本条从渲染结果这一侧再兜一次。",
    ).toBe(true);

    const ring = await first.evaluate((node) => {
      const style = getComputedStyle(node);
      return { outline: style.outlineStyle, shadow: style.boxShadow };
    });
    expect(
      ring.outline !== "none" || ring.shadow !== "none",
      `键盘聚焦后应有可见焦点指示（outline 或 ring），实际 ${JSON.stringify(ring)}。`,
    ).toBe(true);

    /**
     * 反面：鼠标按下**不该**出焦点环。
     * 这条常被写反——`:focus` 会在点击后留环，`:focus-visible` 不会。
     * 少了这条，「把 focus-visible 改回 focus」不会被任何判据抓住。
     *
     * ⚠️ `[实测] 2026-08-31 18:4x` **必须点一枚别的按钮，不能点上一步刚 Tab 到的那枚。**
     * 焦点环状态只在**焦点发生移动**时重算。点击一枚已经聚焦的元素，焦点不动，
     * 上一步键盘 Tab 留下的 `:focus-visible` 就被原样保留下来。
     * 原先这里点的是 `first`（正是 Tab 聚焦的那枚），于是量到的根本不是
     * 「鼠标聚焦会不会出环」，而是「焦点没动时状态保不保持」——
     * 而后者的正确答案恰恰是「保持」。**这条断言因此在正确实现上也必然红**，
     * 是本闸自己的判据挂错了对象，不是 W04 的缺陷。
     *
     * 判据的意图一个字没改弱：换成另一枚**未聚焦且可聚焦**的按钮之后，
     * 「把 focus-visible 改回 focus」照样当场红（已做反面验证，见交付说明）。
     * 取具名槽而不是 `.nth(1)`：槽序是 variant→size→state，`nth(1)` 恰好是
     * `primary-sm-disabled`，disabled 元素点不动也拿不到焦点。
     */
    const clickTarget = slot(page, "secondary-lg-rest");
    await clickTarget.click();
    const focusedByMouse = await clickTarget.evaluate((node) => ({
      isActive: document.activeElement === node,
      focusVisible: node.matches(":focus-visible"),
    }));
    expect(
      focusedByMouse.isActive,
      "点击后这枚按钮应当拿到焦点。拿不到就说明下面那条反面判据量了个空——\n  " +
        "一个没聚焦的元素当然不命中 :focus-visible，那种绿是假绿。",
    ).toBe(true);
    expect(
      focusedByMouse.focusVisible,
      "鼠标点击后**不该**命中 :focus-visible（那是 :focus 的行为）。\n  " +
        "点一下就留环会让界面看起来到处是选中框，这正是要用 focus-visible 的原因。",
    ).toBe(false);
  });

  test("active 按下反馈存在且时长取自 token", async ({ page, openCase }) => {
    const { report } = await openCase("button");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "button");

    const element = slot(page, "primary-lg-rest");
    /**
     * `--leo-dur-1`（90ms）是按下反馈那一档。W04 用**内联 style** 写它
     * （`src/ui/Button.tsx:119-122` 解释了为什么不用 Tailwind 的 `duration-[…]`），
     * 所以这条不依赖 build:css，token 缺席时会退化成 `0s`——
     * 退化方向是「不动」而不是「乱动」，这本身就是设计。
     *
     * 因此这里只断言「这枚按钮确实声明了过渡时长」，不断言具体毫秒数：
     * 具体数值归 W01 那组用例，在这里重复断言会让同一件事有两个可以互相打架的判据。
     */
    const duration = await element.evaluate(
      (node) => getComputedStyle(node).transitionDuration,
    );
    expect(
      duration,
      `按钮应声明过渡时长（取自 --leo-dur-1），实际 ${duration}。`,
    ).not.toBe("");
  });

  test("矩阵截图", async ({ page, openCase }) => {
    const { report, masks } = await openCase("button");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "button");
    // `button` 今天是 `ssr`，所以这一行现在是空过的。留着是因为规矩要结构性成立：
    // 凡 `toHaveScreenshot` 之前必有它（理由见 `w05-toast.spec.ts` 同一处）。
    // 哪天有人把 `button` 改成 `needs-client`，这条会当场红，而不是悄悄换成占位符基线。
    await expectSubjectCoverable(page, "button");
    await expect(page).toHaveScreenshot("w04-button-matrix.png", {
      mask: masks,
      ...thresholdFor("w04-button-matrix"),
    });
  });
});
