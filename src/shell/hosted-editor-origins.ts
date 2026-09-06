// ============================================================================
// Hosted 编辑器 origin 精确白名单（W01，2026-09-03，editor-core-swap · W18 R1）
//
// 为什么需要它：六个 Hosted 编辑器落在 `*.oceanleo.app`（W18 论证见
// `signals/W18-domains.md` §3：`*.oceanleo.com` 无泛解析，且是**非 httpOnly**
// 的 SSO cookie 域，四件未修改的第三方整站应用不能挨着可读 token 坐）。
// 而 `oceanleo.app` 整域是「不可信内容可注册域」，`isUntrustedContentHostname()`
// 对它一律返回 true ⇒ 宿主今天既拼不出 embed URL、也收不下 `ready`。
//
// 这不是 bug，是两条要求今天互斥：协议闸要「同家族」（= SSO cookie 域），
// 供应链要「独立可注册域」（= 协议闸拒绝的那一类）。命名空间 D（插件）当年
// 撞过同一形状，解法就是一张精确白名单，信任由清单成员资格决定而不是域名形状。
//
// ── 三条硬约束（`oceanleo-plugin-firstparty-lane.md`「信任仍由插件 id 决定」）──
//  1. **全串匹配，不做任何后缀/前缀推断。** 下面是一个 origin 全串的 Set，
//     `endsWith('.oceanleo.app')` 这类写法一次都不许出现——那正是本表要挡的东西。
//  2. **只对编辑器通道生效。** 本表不放宽 `isUntrustedContentHostname()` 本身，
//     也不碰 `domain-family.ts`（`_COMMON.md` §2 第 11 条）。素材域、预览域、
//     website 成品 / game 运行时看不到这张表。W07 起，本表成员在
//     `embedEditorFrameSandbox()` 拿 `HOSTED_EDITOR_SANDBOX`（同源只给自己）；
//     那是白名单成员资格，不是 `.oceanleo.app` 后缀推断。
//  3. **零依赖。** `editor-protocol.ts` 会被 `tests/helpers/module-bench.mjs`
//     以 data: URL 编译加载，多一条相对依赖就多一处解析风险。本文件只有常量。
//
// ⚠️ 往这张表里加一行 = 授予一个 origin「可信编辑器」权限。加之前先问：
// 那个 origin 上跑的是不是我方可控代码？它会不会转手 iframe 别人？
// ============================================================================

/** 承载六件 Hosted 编辑器的可注册域。**不是**家族域，收不到 SSO cookie。 */
const HOSTED_EDITOR_REGISTRABLE_DOMAIN = "oceanleo.app";

/**
 * 六个子域标签，与 `signals/W18-domains.md` §1 的表逐字对应，
 * 也与 W13 要在 `platform-host.ts` 的 `RESERVED_SLUG_LABELS` 里保留的六个同源
 * （没保留住 = 用户能抢注同名 UGC 站点，见 W18 R3）。
 */
export const HOSTED_EDITOR_HOST_LABELS = Object.freeze([
  "slides", // PPTist（W07，AGPL 公开仓 pptist-hosted）
  "docs", // Umo Editor（W08）
  "audio", // AudioMass（W10）
  "3d", // three.js editor（W11）
  "game-ide", // microStudio（W14）。W08 后无消费者，待父 agent 清理——本波不删标签。
  "flow", // Langflow（W15）。W08 后无消费者，待父 agent 清理——本波不删标签。
] as const);

/**
 * 允许作为编辑器 iframe origin 的**全串**清单。
 * 逐条写死 `https://` 前缀与完整主机名：没有端口、没有路径、没有尾斜杠——
 * `URL.origin` 的规范形态就是这个样子，比对时不做任何归一化。
 */
export const HOSTED_EDITOR_ORIGINS: readonly string[] = Object.freeze(
  HOSTED_EDITOR_HOST_LABELS.map(
    (label) => `https://${label}.${HOSTED_EDITOR_REGISTRABLE_DOMAIN}`,
  ),
);

const HOSTED_EDITOR_ORIGIN_SET: ReadonlySet<string> = new Set(
  HOSTED_EDITOR_ORIGINS,
);

/**
 * 该 origin 是否是本波六件 Hosted 编辑器之一。
 *
 * **全串相等，没有第二条路径。** 传进来的必须已经是规范化 origin
 * （调用方 `isTrustedEditorOrigin()` 先校验过 `parsed.origin === origin`，
 * 所以 `https://slides.oceanleo.app/`、大写主机、带端口、带凭据的形态
 * 走不到这里；即便走到，全串比对同样不成立）。
 *
 * 这里刻意**不**接受 `http:`：六个主机都在我们的 caddy 后面、通配证书今天已活
 * （W18 §4 实测），没有任何理由降级到明文。
 */
export function isHostedEditorOrigin(origin: string): boolean {
  return HOSTED_EDITOR_ORIGIN_SET.has(origin);
}
