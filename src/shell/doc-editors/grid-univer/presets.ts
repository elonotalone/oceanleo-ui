/**
 * 表格新核（Univer Sheets）允许用哪些 preset —— 单一清单 + 水印态守卫。
 *
 * 为什么需要一张自己的表：`@univerjs/presets` 是元包，它的 dependencies 里就有
 * `preset-sheets-advanced` 与 `preset-sheets-collaboration`，两者的依赖全是
 * `@univerjs-pro/*`（专有、需 license key）。它们**装在 node_modules 里**，
 * 一行 import 就能拿到，而拿到的后果不是构建失败，是产品跑起来带水印、导入受限
 * ——那种失败只有用户看得见（仲裁 A-13，依据 `signals/W01-deps.md` §2.1）。
 *
 * 所以「不许用」这件事不能只写在文档里，要有一份能被测试扫的清单。
 */

/** OSS（Apache-2.0）预设，`signals/W01-deps.md` §2.1 已按 `0.25.1` 锁死的那 11 个。 */
export const UNIVER_SHEETS_OSS_PRESETS = [
  "@univerjs/preset-sheets-core",
  "@univerjs/preset-sheets-filter",
  "@univerjs/preset-sheets-sort",
  "@univerjs/preset-sheets-data-validation",
  "@univerjs/preset-sheets-conditional-formatting",
  "@univerjs/preset-sheets-find-replace",
  "@univerjs/preset-sheets-hyper-link",
  "@univerjs/preset-sheets-thread-comment",
  "@univerjs/preset-sheets-drawing",
  "@univerjs/preset-sheets-table",
  "@univerjs/preset-sheets-note",
] as const;

/** 元包本身。`createUniver` 在这里，不在任何一个 preset 里。 */
export const UNIVER_PRESETS_META_PACKAGE = "@univerjs/presets";

/** 全仓锁死的版本；`@univerjs/*` 要求严格一致，浮动一格就崩。 */
export const UNIVER_PINNED_VERSION = "0.25.1";

/**
 * 碰了就进水印态的那两个。不是「不推荐」，是**产品级缺陷**：
 * 没有 license key 时 Univer 会在画布上打水印并限制导入。
 */
export const UNIVER_WATERMARK_PRESETS = [
  "@univerjs/preset-sheets-advanced",
  "@univerjs/preset-sheets-collaboration",
] as const;

/**
 * 服务端计算包。不是 Pro，但浏览器编辑器里用不到，误引入只会白白拖体积。
 */
export const UNIVER_SERVER_ONLY_PRESETS = [
  "@univerjs/preset-sheets-node-core",
] as const;

export type UniverSheetsOssPreset = (typeof UNIVER_SHEETS_OSS_PRESETS)[number];

/**
 * 这个模块说明符会不会把产品带进水印态。
 *
 * 判的是**说明符本身**，包括 `@univerjs/presets/preset-sheets-advanced` 这种
 * 从元包 subpath 进去的写法——那条路径今天真的存在（元包 exports 里就有），
 * 只查顶层包名会漏掉它。
 */
export function isWatermarkPreset(specifier: string): boolean {
  const cleaned = (specifier || "").trim();
  if (!cleaned) return false;
  return UNIVER_WATERMARK_PRESETS.some(
    (pkg) => cleaned === pkg || cleaned.startsWith(`${pkg}/`) ||
      cleaned === `${UNIVER_PRESETS_META_PACKAGE}/${pkg.split("/")[1]}` ||
      cleaned.startsWith(`${UNIVER_PRESETS_META_PACKAGE}/${pkg.split("/")[1]}/`),
  );
}

/** 这个说明符是不是本波准许的 OSS 预设（含元包与其 OSS subpath）。 */
export function isAllowedUniverSpecifier(specifier: string): boolean {
  const cleaned = (specifier || "").trim();
  if (!cleaned) return false;
  if (isWatermarkPreset(cleaned)) return false;
  if (
    cleaned === UNIVER_PRESETS_META_PACKAGE ||
    cleaned.startsWith(`${UNIVER_PRESETS_META_PACKAGE}/`)
  ) {
    return true;
  }
  return UNIVER_SHEETS_OSS_PRESETS.some(
    (pkg) => cleaned === pkg || cleaned.startsWith(`${pkg}/`),
  );
}
