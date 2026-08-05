/**
 * 第一屏不许交到呈现层的值（VF2 / W29 NaN 子闸反面夹具）。
 *
 * JSON 存不下 NaN / Infinity，所以用这份 .mjs。
 * `plugin-initial-states.test.mjs` 的 `isHonestFirstScreenValue` 必须拒掉这里每一个值；
 * 改松那个谓词（恒 true）时本夹具立刻红。
 */
export const DISHONEST_FIRST_SCREEN_VALUES = Object.freeze([
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]);
