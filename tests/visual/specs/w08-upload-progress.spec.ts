/**
 * 守的是 **W08 的「上传进度三态」**（queued / uploading / failed）。
 *
 * 2026-10-31（oceanbizs W5）：被测主体从 `progress-view.tsx` 的 `UploadProgressRow`
 * 改成 `src/lib/upload/upload-tile.tsx` 的 `UploadTile`——整行读数已撤，进度只画在
 * ChatGPT 式附件方块上。失败态现在自带重试键，下面第二条应当转绿；
 * 截图基线要重录（本批次未授权跑 Playwright，见 `subjects.mjs` 的 `uploadProgress` 条）。
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

const { states } = SUBJECTS.uploadProgress as { states: string[] };

test.describe("W08 · 上传进度", () => {
  test("三态主体到位", async ({ page, openCase }) => {
    const { report } = await openCase("uploadProgress");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "uploadProgress");
    await expectSubjectCoverable(page, "uploadProgress");

    expect(states, "三态清单").toEqual(["queued", "uploading", "failed"]);
    for (const state of states) {
      await expect(
        page.locator(`[data-leo-slot="${state}"]`),
        `${state} 槽没渲染出来`,
      ).toHaveCount(1);
    }
  });

  test("failed 态必须给得出下一步动作", async ({ page, openCase }) => {
    const { report } = await openCase("uploadProgress");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "uploadProgress");

    /**
     * 和 W09 的 chunk 失败态同一条道理：**失败态里不许只有一个进度圈**。
     * 进度圈的语义是「还在传」，传挂了还留着它，用户会一直等。
     * `UploadTile` 的失败态给的是红色重试徽章（宿主给了 onRetry 时是按钮）。
     */
    const failedSlot = page.locator('[data-leo-slot="failed"]');
    const actionable = await failedSlot
      .locator("button, [role='button'], a[href]")
      .count();
    expect(
      actionable,
      "failed 态里没有任何可操作元素（重试 / 取消 / 换一份）。\n  " +
        "上传失败而界面只是停在那儿，用户唯一能做的是刷新页面重来一遍。",
    ).toBeGreaterThan(0);
  });

  test("三态截图", async ({ page, openCase }) => {
    const { report, masks } = await openCase("uploadProgress");
    expectMotionSettled(report);
    await expectSubjectPresent(page, "uploadProgress");
    // `uploadProgress` 今天是 `ssr`，这一行现在空过；留着让规矩结构性成立，
    // 理由见 `w05-toast.spec.ts` 同一处。
    await expectSubjectCoverable(page, "uploadProgress");
    await expect(page).toHaveScreenshot("w08-upload-progress.png", {
      mask: masks,
      ...thresholdFor("w08-upload-progress"),
    });
  });
});
