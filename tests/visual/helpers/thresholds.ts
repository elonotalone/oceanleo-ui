/**
 * 每条用例的截图阈值，**逐条写死并注明理由**（`W10.md` P2）。
 *
 * 起始值 0.01，全局默认写在 playwright.config.ts。这里只放**偏离默认**的条目，
 * 每一条都必须有一句「为什么这条不能用默认值」。没有理由的放宽等于没有闸：
 * 一处放宽 0.05，九组用例就一起失去分辨率，而且没人记得是谁放的。
 *
 * 收紧（< 0.01）不需要理由也欢迎，但仍然写一句，方便后人判断能不能再收。
 */
export interface Threshold {
  maxDiffPixelRatio: number;
  reason: string;
}

export const THRESHOLDS: Record<string, Threshold> = {
  "w01-token-ladder": {
    // 探针元素是纯色块加一行文字，没有渐变、没有阴影、没有图片。
    // 任何一个像素变了都是真的变了。
    maxDiffPixelRatio: 0.001,
    reason: "纯色探针块，无抗锯齿灰区，可以收到千分之一。",
  },
  "w02-edit-bar": {
    maxDiffPixelRatio: 0.01,
    reason: "默认值。编辑栏有圆角与阴影，边缘抗锯齿会吃掉几十个像素。",
  },
  "w03-overlay": {
    maxDiffPixelRatio: 0.01,
    reason: "默认值。弹层有投影，同上。",
  },
  "w04-button-matrix": {
    // 24 个按钮铺满一屏，单个按钮的边缘像素占比被摊薄；
    // 用默认值会导致「一个按钮整体错位」也在预算内。
    maxDiffPixelRatio: 0.004,
    reason: "矩阵图元素多、单元素占比小，必须收紧才抓得住单个按钮的漂移。",
  },
  "w05-toast": {
    maxDiffPixelRatio: 0.01,
    reason: "默认值。",
  },
  "w07-card-geometry": {
    // 这条用例的判据本体是几何数字（getBoundingClientRect），截图只是佐证。
    maxDiffPixelRatio: 0.01,
    reason: "默认值；真正的判据是几何断言，截图用于人眼复核。",
  },
  "w08-upload-progress": {
    maxDiffPixelRatio: 0.01,
    reason: "默认值。进度条是纯色矩形，但三态图里有文案。",
  },
  "w09-chunk-error": {
    // 失败态是两块纯色卡片 + 一枚按钮 + 两段文案，没有图片、没有渐变。
    // 收到 0.004 是因为这张图要抓的退化很具体：按钮消失、文案被换、
    // 或者有人把它改回 spinner。这三种都会远超 0.4% 的像素。
    maxDiffPixelRatio: 0.004,
    reason:
      "纯色卡片 + 文案，无渐变无图片；要抓的退化（按钮消失/改回 spinner）像素占比都很大，可以收紧。",
  },
};

export function thresholdFor(key: string): { maxDiffPixelRatio: number } {
  const entry = THRESHOLDS[key];
  if (!entry) {
    throw new Error(
      `用例 ${key} 没有登记阈值。请在 tests/visual/helpers/thresholds.ts 里补一条，` +
        `连同「为什么不用默认值」的理由。`,
    );
  }
  return { maxDiffPixelRatio: entry.maxDiffPixelRatio };
}
