// ============================================================================
// 摆到用户面前的那一句话
// ----------------------------------------------------------------------------
// 这是一份**纯文本判断**，没有网络、没有依赖。它单独成一个模块，是因为
// `artifact-client.ts` 在测试里几乎总是被替身顶掉（它要发请求），而这几个函数
// 是界面每一处 `catch` 都要用的——挂在 artifact-client 上，等于让每一份换了
// artifact-client 替身的测试都必须记得把它们再导出一遍，忘一份就整份不执行。
// ============================================================================

/**
 * 一句话是**写给人看的**，还是技术原文。
 *
 * 界面上的每一句话都是中文源串，由 `useUI()` 在渲染时翻成当前语言；技术原文
 * （浏览器的 `Failed to fetch`、网关的 `missing bearer token`、运行时的
 * `Cannot read properties of undefined`）一律没有中文，也一律不在词条表里，
 * 摆出去既不翻译也不说下一步。所以「有没有中文」就是「能不能给用户看」。
 *
 * 这个判据是**单向**的：英文技术原文一条都过不去，**中文技术原文却全部放行**
 * （`当前工作区没有注册 typed Edit route。` 之类）。留着这个洞是有意的——
 * 认不出来时退回自己的兜底中文，比把原文倒给读者安全；中文那一侧要靠
 * 逐条改文案来收，收不干净也不该由这里假装收干净。
 * 实测语料见 `tests/repro/w4-human-message-criterion.mjs`。
 */
const HUMAN_READABLE_TEXT = /[\u3400-\u9fff\uf900-\ufaff]/;

export function isHumanReadableMessage(value: unknown): boolean {
  return typeof value === "string" && HUMAN_READABLE_TEXT.test(value);
}

/**
 * 一个异常 → 能摆在用户面前的一句话。
 *
 * 界面上每一处 `catch` 过去都写 `error.message`。我们自己抛的是中文，所以平时看着
 * 没问题；可**浏览器与运行时抛的一律是英文技术原文**——`requestFullscreen()` 被拒
 * 时的 `Permissions check failed`、`fetch` 传输层失败时的 `Failed to fetch`。
 * `Failed to fetch` 就是这么摆到用户眼前的（复现见 W4-journal J5–J7）。
 *
 * 原文不丢：进 `console.warn`，给控制台与日志，不给读者。
 */
export function humanErrorMessage(error: unknown, fallback: string): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (isHumanReadableMessage(raw)) return raw;
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn("[oceanleo] 技术原文（不呈现给用户）：", error);
  }
  return fallback;
}
