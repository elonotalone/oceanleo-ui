import { test as base, expect, type Locator, type Page } from "@playwright/test";

import { SUBJECTS } from "../harness/subjects.mjs";

/**
 * P2 · 确定性。三件事缺一条这套闸就是假阳性工厂，所以三件都收在 fixture 里，
 * 用例**没有办法**绕过其中任何一件。
 *
 *   ① `animations: 'disabled'` —— 在 playwright.config.ts 的 `toHaveScreenshot` 里；
 *   ② `__leoMotionJumpAllToRest()` —— 在这里，见 `settle()`；
 *   ③ mask 动态内容 —— 在这里，见 `maskLocators()`。
 */

export interface SettleReport {
  springModule: "loaded" | "absent" | "error" | "unknown";
  springError: string | null;
  hookPresent: boolean;
  hookCalled: boolean;
}

export interface CaseHandle {
  report: SettleReport;
  masks: Locator[];
}

/** 动态内容 mask 清单。截图前统一交给 Playwright，见 `harness/client/harness.js`。 */
export function maskLocators(page: Page): Locator[] {
  return [page.locator("[data-leo-mask]")];
}

export const test = base.extend<{
  openCase: (caseId: keyof typeof SUBJECTS) => Promise<CaseHandle>;
}>({
  openCase: async ({ page }, use) => {
    await use(async (caseId) => {
      await page.goto(`/case/${String(caseId)}`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean((window as any).__leoVisual));
      await page.evaluate(() => (window as any).__leoVisual.ready);

      // P2③：先打标，再截图。顺序反了 mask 就是空的。
      await page.evaluate(() => (window as any).__leoVisual.maskTargets());

      // P2②：把 spring 驱动的动效落到终态。
      const report = (await page.evaluate(() =>
        (window as any).__leoVisual.settle(),
      )) as SettleReport;

      return { report, masks: maskLocators(page) };
    });
  },
});

export { expect };

/**
 * P2② 的判据。**钩子缺失一律判红，不许绕过**（`W10.md` P2②）。
 *
 * 为什么不能宽容：Playwright 的 `animations:'disabled'` 只关 CSS 动画与过渡，
 * 不停 JS 驱动的 rAF 弹簧。钩子没挂上而闸还是绿的，唯一的解释是这一页恰好没有
 * 活着的弹簧——那么下一次有了的时候，它会以「随机差几像素」的形式回来，
 * 而那时没人知道是从哪天开始的。宁可现在红。
 */
export function expectMotionSettled(report: SettleReport): void {
  expect(
    report.springModule,
    [
      "spring 原语没能加载进夹具页。",
      `实际：${report.springModule}${report.springError ? `（${report.springError}）` : ""}`,
      "归属：W02 / motion-system.md §规范二。",
    ].join("\n  "),
  ).toBe("loaded");

  expect(
    report.hookPresent,
    [
      "`window.__leoMotionJumpAllToRest()` 不存在。",
      "规范：motion-system.md §规范二·实现约束 6 要求它在非 production 或页面带",
      "`data-leo-motion-test` 时挂上；夹具页 <html> 已经带了这个属性。",
      "按 W10.md P2②：缺失判红，不绕过。",
    ].join("\n  "),
  ).toBe(true);

  expect(report.hookCalled, "钩子存在但调用时抛了错").toBe(true);
}

/**
 * 主体缺席的判据。夹具页在主体缺席时渲染 `.leo-missing`，
 * 这里把它翻译成一条点名 owner 的红。
 */
export async function expectSubjectPresent(
  page: Page,
  caseId: keyof typeof SUBJECTS,
): Promise<void> {
  const missing = page.locator("[data-leo-missing]");
  const count = await missing.count();
  if (count === 0) return;
  const detail = (await missing.first().innerText()).trim();
  expect(count, detail).toBe(0);
}
