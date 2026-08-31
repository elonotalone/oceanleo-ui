/**
 * 守的是 **W08 的「上传进度三态」**（queued / uploading / failed）。
 *
 * 今天是**真缺席**：`UploadProgress` 在 `src/` 零命中（标识符级别 0 处，
 * 零命中已按 `_COMMON` §7b③ 用同一条正则在已知存在的 `Button` 与
 * `MaterialLibrary` 上验过——直接声明与再导出两种写法都命中，所以正则可信）。
 * 登记表指向 `src/shell/ArtifactActions.tsx`，那份文件在位，
 * 今天导出的是 `artifactActionMatrix` 与 `ArtifactActionButtons`。
 * ⇒ 这条红记在 W08 头上。
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
     * 和 W09 的 chunk 失败态同一条道理，这里再钉一次：
     * **失败态里不许只有一个进度条**。进度条的语义是「还在传」，
     * 传挂了还留着它，用户会一直等。失败必须能被看见，且能被处理。
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
    await expect(page).toHaveScreenshot("w08-upload-progress.png", {
      mask: masks,
      ...thresholdFor("w08-upload-progress"),
    });
  });
});
