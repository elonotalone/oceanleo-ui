/**
 * 守的是 **W08 的「上传进度三态」**（queued / uploading / failed）。
 *
 * ⚠️ **本文件抬头 2026-08-31 17:4x 整段改写过，因为原文写的是一条假事实。**
 * 原文说「今天是真缺席：`UploadProgress` 在 `src/` 零命中 ⇒ 这条红记在 W08 头上」。
 * 零命中本身没错，**由它推出的结论错了**：W08 早已交卷，产出叫
 * `UploadProgressRow` / `UploadProgressList`，落在
 * `src/lib/upload/progress-view.tsx`，不在登记表指着的 `src/shell/ArtifactActions.tsx`。
 * 照原样跑，这道闸会对一位已交卷的 owner 报「没交」。
 *
 * 这是本套件第三次踩同一个坑（前两次：`Button` 指错桶文件、`Toast` 找错导出名），
 * 所以把教训再钉一次：**「我搜的那个名字零命中」不等于「那个东西不存在」。**
 * 判缺席之前先问「我搜的名字对吗、我搜的模块对吗」，两条都要自证。
 *
 * 登记表已改指真身，详见 `subjects.mjs` 的 `uploadProgress` 条。
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
