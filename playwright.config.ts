import { defineConfig, devices } from "@playwright/test";

/**
 * 视觉与交互回归闸（W10）。
 *
 * 为什么这道闸存在：31 个租户站的全部交互都在本包里（`oceanleo-sites/apps` 有 0 个
 * `use client`），所以这里改一行会同时出现在 31 个站上。既有 216 份 `tests/*.test.mjs`
 * 断言的是 DOM 结构，**测不到时长、曲线与手感**——没有这道闸，本波调好的动效会在
 * 三个月内漂回去。
 *
 * 与既有测试的关系：`npm test` 的 glob 是 `tests/*.test.mjs`（仅顶层），
 * 本套件全部在 `tests/visual/` 下且用 `.spec.ts` 后缀，**结构上不可能被它拾取**。
 *
 * 基线只在官方 Playwright 容器里生成，理由见 `docs/testing/visual-regression.md`。
 */

/** 容器外直接 `npx playwright test` 会产出与基线不同的字形，见运行手册「假阳性」一节。 */
const IN_CONTAINER = process.env.LEO_VISUAL_IN_CONTAINER === "1";

const HARNESS_PORT = Number(process.env.LEO_HARNESS_PORT ?? 4319);
const HARNESS_URL = `http://127.0.0.1:${HARNESS_PORT}`;

export default defineConfig({
  testDir: "./tests/visual/specs",

  // 基线与用例同仓、同目录树，便于 review 时一眼看到「谁改了哪张图」。
  snapshotPathTemplate:
    "./tests/visual/baselines/{projectName}/{testFilePath}/{arg}{ext}",

  fullyParallel: false,
  forbidOnly: true,

  /**
   * 0 次重试是刻意的。重试会把「偶发不确定」染成绿色，而这套闸的全部价值就是
   * 不确定性本身可见。假阳性要靠 P2 的三件确定性措施根治，不靠重跑掩盖。
   */
  retries: 0,

  /**
   * 单 worker。并发会让同一台机器上的用例互相抢 CPU，直接污染 P3 的交互延迟读数；
   * 截图用例也会因为合成器负载不同而出现亚像素差。这道闸求稳不求快。
   */
  workers: 1,

  reporter: [
    ["list"],
    ["json", { outputFile: "tests/visual/.artifacts/results.json" }],
    ["html", { outputFolder: "tests/visual/.artifacts/html", open: "never" }],
  ],

  outputDir: "tests/visual/.artifacts/test-results",

  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      /**
       * 全局起始阈值 0.01，**只允许在用例里逐条收紧或按写明的理由放宽**。
       * 不许在这里放宽：一处放宽 = 九组用例一起失去分辨率。
       */
      maxDiffPixelRatio: 0.01,
      // P2①：关掉 CSS 动画与过渡。JS 驱动的 spring 由 P2② 的钩子负责。
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },

  use: {
    baseURL: HARNESS_URL,
    // 固定视口：截图基线的坐标系。改这里等于作废全部基线。
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    // 动效本身是被测对象，所以默认不降级；reduced-motion 由 W01 那组用例单独开。
    reducedMotion: "no-preference",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "visual",
      use: { ...devices["Desktop Chrome"], channel: undefined },
      testIgnore: /interaction-budget\.spec\.ts$/,
    },
    {
      /**
       * 延迟预算与截图分开跑：截图项目会被 `animations:'disabled'` 改写渲染时序，
       * 用它量出来的 `performance.measure` 不是用户会遇到的那个数。
       */
      name: "budget",
      use: { ...devices["Desktop Chrome"], channel: undefined },
      testMatch: /interaction-budget\.spec\.ts$/,
    },
  ],

  webServer: {
    command: `node tests/visual/harness/serve.mjs --port ${HARNESS_PORT}`,
    url: `${HARNESS_URL}/__health`,
    reuseExistingServer: !IN_CONTAINER,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
