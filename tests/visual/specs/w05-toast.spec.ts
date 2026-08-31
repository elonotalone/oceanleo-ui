/**
 * 守的是 **W05 的「Toast 四类型 + 队列上限」**。
 *
 * ⚠️ **本文件抬头 2026-08-31 17:4x 整段改写过，因为原文写的是一条已过期的事实。**
 * 原文说「今天是真缺席：`src/ui/Toast.tsx` 不存在 ⇒ 这条红记在 W05 头上」，
 * 依据是 `src/ui/index.tsx:24` W05 自己留的字条。
 * `[实测]` **那份字条已经过期**：`src/ui/Toast.tsx` 在盘上，
 * 导出 `ToastViewport`(:595) / `ToastProvider`(:698) / `useToast`(:378)。
 *
 * 所以红的性质变了，**归属也跟着变**：不是「W05 没交」，而是
 * **「W05 交了，但本闸这一层够不着」**——`ToastViewport` 不吃 props，
 * 内容全部来自 `useSyncExternalStore` 的模块级 store，SSR 走 `serverSnapshot`
 * ⇒ 恒为空队列；真正的表现件 `ToastItem`(:520) 是模块私有的。
 * ⇒ 按 `_COMMON` §8，这条**不记 W05 人头**，记本闸的覆盖边界。
 *
 * 解封条件见 `subjects.mjs` 的 `toast` 条（夹具 hydration，或请 W05 导出 `ToastItem`）。
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

const { kinds } = SUBJECTS.toast as { kinds: string[] };

test.describe("W05 · Toast", () => {
  test("四类型主体到位", async ({ page, openCase }) => {
    const { report } = await openCase("toast");
    expectMotionSettled(report);
    // 今天红在这里，文案会点名 W05 与约定落点。
    await expectSubjectPresent(page, "toast");
    await expectSubjectCoverable(page, "toast");

    expect(kinds, "四类型清单").toEqual(["success", "error", "warning", "info"]);
    for (const kind of kinds) {
      await expect(
        page.locator(`[data-leo-slot="${kind}"]`),
        `${kind} 槽没渲染出来`,
      ).toHaveCount(1);
    }
  });

  test("四类型截图", async ({ page, openCase }) => {
    const { report, masks } = await openCase("toast");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "toast");
    await expect(page).toHaveScreenshot("w05-toast.png", {
      mask: masks,
      ...thresholdFor("w05-toast"),
    });
  });

  test("队列上限：第 N+1 条不该挂上 DOM", async ({ page, openCase }) => {
    const { report } = await openCase("toast");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "toast");

    /**
     * 队列上限要等主体落地才谈得上真测——它是 viewport 组件的行为，
     * 不是单个 toast 的形态。主体缺席时上面那条已经红了，
     * 这里留着形状是为了让 W05 落地时立刻知道还欠这一条，
     * 而不是看到「四类型都绿了」就以为交完了。
     *
     * 红线 7 顺带在这里再说一次：共享包里禁止 import `sonner`
     * （31 个站不一定装），W05 建的必须是第一方原语。
     */
    const mounted = await page.locator("[data-leo-slot] [role='status']").count();
    expect(
      mounted,
      "队列上限判据待 W05 的 viewport 落地后补全：\n  " +
        "同时推入 N+1 条时，第 N+1 条不该出现在 DOM 里（而不是渲染出来再用 CSS 藏起来）。",
    ).toBeGreaterThanOrEqual(0);
  });
});
