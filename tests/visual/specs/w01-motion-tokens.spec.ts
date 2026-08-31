/**
 * 守的是 **W01 的「六档时长与五条曲线」**（`motion-system.md` §规范一）。
 *
 * 断言的不是「源文件里写了什么」，是**用户浏览器里最终解析出来的值**。
 * 这个区别就是这条用例存在的理由：token 可以写对、却因为没进产物而对 31 个站
 * 一点作用都没有——开工当天实测到的正是这种情况，见 §产物新鲜度 那条。
 *
 * 源文件层面的断言归 W01 自己的 `tests/motion-tokens.test.mjs`，两道闸各守一层。
 */
import {
  DURATION_TOKENS,
  EASE_TOKENS,
  LOOP_TOKENS,
  MOVE_TOKENS,
  STAGGER_TOKENS,
} from "../harness/prerender.mjs";
import { expect, expectMotionSettled, test } from "../helpers/fixture";
import { thresholdFor } from "../helpers/thresholds";

/**
 * 规范值，逐条写死。
 *
 * 取值来源是 `src/theme/globals.css` 的生成区（`[实测] 2026-08-31`），
 * 与 `motion-system.md` §规范一逐字一致。**这里刻意不 import `src/theme/motion.ts`**：
 * 从数据源自己算期望值，等于让被测对象自己出卷子——它改成什么，判据就跟着变成什么，
 * 那样这条用例永远绿。判据必须是**独立誊抄的常量**。
 */
const EXPECTED_DURATION_MS: Record<string, number> = {
  "--leo-dur-1": 90,
  "--leo-dur-2": 140,
  "--leo-dur-3": 200,
  "--leo-dur-4": 280,
  "--leo-dur-5": 380,
  "--leo-dur-6": 520,
};

const EXPECTED_EASE: Record<string, string> = {
  "--leo-ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
  "--leo-ease-decelerate": "cubic-bezier(0.05, 0.7, 0.1, 1)",
  "--leo-ease-accelerate": "cubic-bezier(0.3, 0, 0.8, 0.15)",
  // 既有品牌曲线，`01-verified-facts.md` §2.3 记了它在仓里 4 处逐字出现。不许改值。
  "--leo-ease-emphasis": "cubic-bezier(0.21, 1.02, 0.73, 1)",
};

const EXPECTED_MOVE_PX: Record<string, number> = {
  "--leo-move-xs": 2,
  "--leo-move-sm": 6,
  "--leo-move-md": 12,
};

const EXPECTED_STAGGER_MS: Record<string, number> = {
  "--leo-stagger": 55,
  "--leo-stagger-max": 320,
};

/**
 * 产物没跟上时的诊断。
 *
 * 这段话会原样出现在失败信息里，所以它必须直接说出下一步该做什么。
 * `[实测] 2026-08-31 16:2x`：`--leo-dur-*` 在 `globals.css` 命中、在 `ui.css` 零命中；
 * mtime 分别是 08-31 16:08 与 **08-19 21:19**。两份都已提交。
 * 本套件刻意不跑 `build:css`（那会改写两份产品源码，违反 W10 硬红线），
 * 所以这条只能判红，不能自己修。
 */
const STALE_ARTIFACT_HINT = [
  "",
  "── 先查这一条，八成是它 ──────────────────────────────────────",
  "夹具页链的是 `src/theme/ui.css`，那是 `npm run build:css` 的产物，",
  "**也正是 31 个租户站在生产里加载的那一份**。",
  "token 写进 `src/theme/globals.css` 但没跑 build:css 时，产物里不会有它们，",
  "计算值就会是空串——源码看着是对的，用户那边一点效果都没有。",
  "",
  "复核（两条都跑，第二条是对照组，防止正则本身写错）：",
  "  rg -c -- '--leo-dur-1' src/theme/globals.css src/theme/ui.css",
  "  rg -c -- '--leo-d-'    src/theme/ui.css        # 对照组：这条必须有命中",
  "",
  "确认是产物陈旧 ⇒ 归 W01，跑 `npm run build:css` 并把产物一起提交。",
  "本套件不替你跑：build:css 会改写 globals.css 与 ui.css 两份**产品源码**，",
  "而 W10 的硬红线是不碰产品源码（W10.md §禁区）。",
].join("\n  ");

/** 读一枚探针的计算值。空串 = token 没解析出来。 */
async function readProbe(
  page: import("@playwright/test").Page,
  token: string,
  property: string,
): Promise<string> {
  return page
    .locator(`[data-leo-token="${token}"]`)
    .evaluate(
      (element, prop) => getComputedStyle(element).getPropertyValue(prop).trim(),
      property,
    );
}

/** `"0.09s"` / `"90ms"` → 90。解析不出来返回 NaN，让断言去报。 */
function toMs(value: string): number {
  const trimmed = value.trim();
  if (/^-?[\d.]+ms$/.test(trimmed)) return Number.parseFloat(trimmed);
  if (/^-?[\d.]+s$/.test(trimmed)) return Number.parseFloat(trimmed) * 1000;
  return Number.NaN;
}

test.describe("W01 · 动效 token 阶梯", () => {
  test("六档时长解析成规范值", async ({ page, openCase }) => {
    const { report } = await openCase("motionTokens");
    expectMotionSettled(report);

    for (const token of DURATION_TOKENS) {
      const raw = await readProbe(page, token, "transition-duration");
      expect(
        raw,
        `${token} 没有解析出任何值（计算值是空串）。${STALE_ARTIFACT_HINT}`,
      ).not.toBe("");
      expect(
        toMs(raw),
        `${token} 应为 ${EXPECTED_DURATION_MS[token]}ms，实际解析成 ${raw}。\n  ` +
          "六档的数值本身就是「层级」：同层同档、跨层差恰好一档。改一档等于改层级关系。",
      ).toBe(EXPECTED_DURATION_MS[token]);
    }
  });

  test("五条曲线逐字等于规范值", async ({ page, openCase }) => {
    const { report } = await openCase("motionTokens");
    expectMotionSettled(report);

    for (const token of Object.keys(EXPECTED_EASE)) {
      const raw = await readProbe(page, token, "transition-timing-function");
      expect(
        raw,
        `${token} 没有解析出任何值。${STALE_ARTIFACT_HINT}`,
      ).not.toBe("");
      /**
       * 逐字比较，**不做数值容差**。曲线是四个控制点，差 0.01 就是另一条曲线；
       * 而「差不多的曲线」正是漂移的常见形态——它每次只差一点点，
       * 攒三个月就完全不是原来那条了。
       */
      expect(
        raw.replace(/\s+/g, " ").trim(),
        `${token} 应逐字等于 ${EXPECTED_EASE[token]}，实际 ${raw}。`,
      ).toBe(EXPECTED_EASE[token]);
    }
  });

  test("--leo-ease-spring 是 linear() 弹簧近似，不是退化的品牌曲线", async ({
    page,
    openCase,
  }) => {
    const { report } = await openCase("motionTokens");
    expectMotionSettled(report);

    const raw = await readProbe(
      page,
      "--leo-ease-spring",
      "transition-timing-function",
    );
    expect(raw, `--leo-ease-spring 没有解析出任何值。${STALE_ARTIFACT_HINT}`).not.toBe(
      "",
    );
    /**
     * chromium 支持 `linear()`，所以 `@supports` 那一支必须命中。
     * 若这里读到的是 `cubic-bezier(0.21, 1.02, 0.73, 1)`，说明降级支生效了——
     * 在支持 linear() 的浏览器上降级，等于弹簧感被悄悄拿掉，而没有人会发现。
     */
    expect(
      raw.startsWith("linear("),
      "`--leo-ease-spring` 应解析为 linear() 弹簧近似，实际是 " +
        `${raw}。\n  ` +
        "chromium 支持 linear()，读到品牌曲线说明 @supports 那一支没命中，" +
        "弹簧手感被静默降级了。",
    ).toBe(true);
  });

  test("位移与错峰档位", async ({ page, openCase }) => {
    const { report } = await openCase("motionTokens");
    expectMotionSettled(report);

    for (const token of MOVE_TOKENS) {
      const raw = await readProbe(page, token, "margin-left");
      expect(raw, `${token} 没有解析出任何值。${STALE_ARTIFACT_HINT}`).not.toBe("");
      expect(
        Number.parseFloat(raw),
        `${token} 应为 ${EXPECTED_MOVE_PX[token]}px，实际 ${raw}。`,
      ).toBe(EXPECTED_MOVE_PX[token]);
    }

    for (const token of STAGGER_TOKENS) {
      const raw = await readProbe(page, token, "transition-delay");
      expect(raw, `${token} 没有解析出任何值。${STALE_ARTIFACT_HINT}`).not.toBe("");
      expect(
        toMs(raw),
        `${token} 应为 ${EXPECTED_STAGGER_MS[token]}ms，实际 ${raw}。`,
      ).toBe(EXPECTED_STAGGER_MS[token]);
    }
  });

  test("token 阶梯截图", async ({ page, openCase }) => {
    const { report, masks } = await openCase("motionTokens");
    expectMotionSettled(report);
    await expect(page).toHaveScreenshot("w01-token-ladder.png", {
      mask: masks,
      ...thresholdFor("w01-token-ladder"),
    });
  });
});

/**
 * reduced-motion 单开一个 describe，因为它要换 context 级的 `reducedMotion`。
 *
 * 这一组守的是 `motion-system.md` §reduced-motion 里**最容易做错的那一半**：
 * 降级不是「把所有动效关掉」。关掉载荷指示器会让「还在忙」这个信息消失，
 * 用户看到的是一个卡死的界面——把无障碍降级做成了功能故障。
 */
test.describe("W01 · reduced-motion 降级", () => {
  test.use({ reducedMotion: "reduce" });

  test("六档全归零，且四条载荷指示器周期不归零", async ({ page, openCase }) => {
    const { report } = await openCase("motionTokens");
    expectMotionSettled(report);

    for (const token of DURATION_TOKENS) {
      const raw = await readProbe(page, token, "transition-duration");
      expect(raw, `${token} 没有解析出任何值。${STALE_ARTIFACT_HINT}`).not.toBe("");
      expect(
        toMs(raw),
        `reduced-motion 下 ${token} 应为 0ms，实际 ${raw}。\n  ` +
          "降级放在 token 层是刻意的：组件不必各自处理，改一处覆盖 31 个站。",
      ).toBe(0);
    }

    for (const token of STAGGER_TOKENS) {
      const raw = await readProbe(page, token, "transition-delay");
      expect(toMs(raw), `reduced-motion 下 ${token} 应为 0ms，实际 ${raw}。`).toBe(0);
    }

    for (const token of LOOP_TOKENS) {
      const raw = await readProbe(page, token, "animation-duration");
      expect(raw, `${token} 没有解析出任何值。${STALE_ARTIFACT_HINT}`).not.toBe("");
      expect(
        toMs(raw),
        `reduced-motion 下 ${token} **不该**归零，实际 ${raw}。\n  ` +
          "载荷指示器传达的是「还在进行中」。周期归零 = 转圈停住 = 语义上「卡死了」。\n  " +
          "reduced-motion 该降的是位移与幅度（--leo-bounce-rise / --leo-pulse-ring），\n  " +
          "不是「还在忙」这个信息本身。",
      ).toBeGreaterThan(0);
    }
  });
});
