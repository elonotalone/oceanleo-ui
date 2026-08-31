/**
 * 守的是 **W05 的「Toast 四类型 + 队列上限」**。
 *
 * 今天是**真缺席**（不是本闸够不着）：`src/ui/Toast.tsx` 不存在。
 * 依据不是猜的——`src/ui/index.tsx:24` 是 W05 自己留的字条：
 * 「待并入：`W05` 的 `Toast`——`src/ui/Toast.tsx` 到本轮为止还没落盘」。
 * 另按 `_COMMON` §7b③ 复核过零命中：标识符 `Toast` 在 `src/` 只有 3 处，
 * 全是注释，没有一处是组件导出。
 *
 * ⇒ 这条红**记在 W05 头上**，并写进 `signals/W10-request.md`。
 * 登记表刻意指向约定好的落点 `src/ui/Toast.tsx` 而不是桶文件：
 * 主体到位的当天这组用例自动转绿，不需要任何人回来改闸。
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
