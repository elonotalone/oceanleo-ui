// ============================================================================
// 被测主体登记表 —— 「模块一定在，导出不一定在」
// ----------------------------------------------------------------------------
// 这道闸与它守的九份改动是**同一波并发**造的。开工时实测：`--leo-dur-*` 与
// `__leoMotionJumpAllToRest` 在 `src/` 下零命中（零命中已按 `_COMMON` §6 用
// `--leo-d-` 与既有品牌曲线做过对照组自证），也就是 W01–W09 尚未落地。
//
// 所以这张表的形状是刻意的：**import 的是今天就存在的模块入口，探测的是可能还不
// 存在的具名导出**。这样
//   - 主体缺席 ⇒ 运行期得到 `undefined` ⇒ 判红并点名 owner；
//   - 而**不是** import 失败 ⇒ 整套闸编不出来 ⇒ 九组用例一起变哑。
//
// 「整份不执行只表现为一条失败」这个坑，`tests/helpers/module-bench.mjs` 的抬头
// 记过它在本仓复发四次。这里不重蹈：缺席永远是**九分之一条红**，不是全套哑火。
//
// owner 一栏不是装饰。红的时候第一件事是知道去找谁，不是去猜。
//
// ─── `render` 一栏：为什么必须把「渲染不出」和「没落地」分开 ───────────────────
// 2026-08-31 16:2x 逐个核对构造函数签名后发现，主体其实有**三种**状态，而不是两种：
//
//   "ssr"          纯表现型，`renderToStaticMarkup` 就能出真 DOM ⇒ 本闸真能守。
//   "needs-client" 主体**在位**，但要活的客户端才渲染得出来：走 `createPortal`
//                  （W02/W03）、挂一堆 effect 与订阅（W06）、或 `useEffect` 之前
//                  `return null`（W09 的 workbench）。静态夹具拿到的是空串。
//   （缺席）        `module` 里根本没有那个导出 ⇒ owner 还没交。
//
// 把后两者混成一句「主体缺席」会**对已经交卷的 owner 记错人头**——那正是
// `_COMMON` §8「不许在别人半成品的工作树上给别人下判决」要挡的事。
// 所以 `render:"needs-client"` 的红说的是「本闸这一层覆盖不到」，是**闸的边界**，
// 不是 owner 的欠账；两种红的文案与归属都不同，见 `helpers/fixture.ts`。
// ============================================================================

/** 每个主体：模块入口（今天必须存在）+ 具名导出（可能还不存在）+ owner。 */
export const SUBJECTS = {
  motionTokens: {
    owner: "W01",
    guards: "六档时长与五条曲线的计算值",
    // W01 的产出在 CSS 里，没有 JS 主体：靠 `src/theme/globals.css` 的生成区自证。
    module: null,
    cssOnly: true,
  },

  editBar: {
    owner: "W02",
    guards: "编辑栏展开态 / 收缩圆形态 / 拖拽中三态",
    module: "src/shell/FloatingContextToolbar.tsx",
    exportName: "FloatingContextToolbar",
    states: ["expanded", "collapsed", "dragging"],
    // `[实测]` 该组件前两行就是 `if (!children) return null;` 与
    // `if (!controller.portalRoot) return null;`，随后整体 `createPortal(...)`。
    // `react-dom/server` 不支持 portal，且 `controller` 是活的控制器对象
    // （不是 plain props）⇒ 静态夹具永远拿到空串。
    render: "needs-client",
    renderNote:
      "走 createPortal，且要活的 controller.portalRoot；renderToStaticMarkup 出空串。",
  },

  overlay: {
    owner: "W03",
    guards: "弹层进场（origin-correct）/ 退场 / focus 环",
    module: "src/shell/anchored-popover.tsx",
    exportName: "AnchoredPopover",
    states: ["enter", "exit", "focus-ring"],
    // `[实测]` props 面要 `anchorRef: RefObject<HTMLElement|null>`——定位全靠对
    // 真实锚点量 `getBoundingClientRect()`，SSR 下没有布局，量不出东西；同样走 portal。
    render: "needs-client",
    renderNote:
      "定位依赖活的 anchorRef 与真实布局盒；SSR 无布局，且同样走 portal。",
  },

  button: {
    owner: "W04",
    guards: "Button 四 variant × 三 size × 五状态矩阵",
    /**
     * ⚠️ 这条 2026-08-31 16:2x 改过，改动本身就是一次「闸差点说谎」的记录。
     *
     * 原先指向 `src/ui/index.tsx`，依据是 `01-verified-facts.md` §1.6
     * 「`src/ui/index.tsx` 没有 Button」。那句话**今天仍然是对的**，
     * 但由它推出的「Button 不存在」**是错的**：W04 已经交卷，
     * 原语落在 `src/ui/Button.tsx:250`（`export const Button = forwardRef(...)`），
     * 只是没有从 `index.tsx` 再导出（`index.tsx:24` 有 W05 留的「待并入」注释，
     * 说明这个桶文件本来就在整理中）。
     *
     * 照原样跑，这道闸会对**唯一一个已经把主体交出来的 owner** 报假红。
     * 记在这里是因为下一个接手的人会遇到同一类事：台账里的事实会过期，
     * 而「A 文件里没有」不等于「仓里没有」。
     */
    module: "src/ui/Button.tsx",
    exportName: "Button",
    render: "ssr",
    variants: ["primary", "secondary", "ghost", "danger"],
    sizes: ["sm", "md", "lg"],
    states: ["rest", "hover", "active", "focus-visible", "disabled"],
    /**
     * 五状态刻意分成两类，因为它们的**真实性来源不同**。
     *
     * `rest` / `disabled` 是组件自己的 prop，只能由夹具渲染出来。
     * `hover` / `active` / `focus-visible` 是**浏览器级伪类**——它们不需要
     * 客户端 React，用 Playwright 的 `locator.hover()` 与键盘 Tab 就能在静态页上
     * 真实触发。所以夹具**不给它们铺槽位**：铺一个 `data-leo-state="hover"` 的
     * 假槽等于自己写一份长得像 hover 的 HTML 去测自己，一文不值。
     *
     * ⇒ 夹具 4×3×2 = 24 槽，其余三态由 `w04-button-matrix.spec.ts` 真实驱动。
     */
    propStates: ["rest", "disabled"],
    pseudoStates: ["hover", "active", "focus-visible"],
    /**
     * 组件自带的抓手，`[实测]` 见 `src/ui/Button.tsx:278-280`：
     * `data-leo-button={variant}` / `data-leo-button-size={size}`。
     * 用它们而不是 class 选择器：class 是 Tailwind 拼出来的，改一次样式就换一批，
     * 拿它当选择器等于让闸自己变成脆的那一环。
     */
    attr: { variant: "data-leo-button", size: "data-leo-button-size" },
  },

  toast: {
    owner: "W05",
    guards: "Toast 四类型 + 队列上限",
    // `[实测]` `src/ui/index.tsx:24` 是 W05 自己留的字条：
    // 「待并入：`W05` 的 `Toast`——`src/ui/Toast.tsx` 到本轮为止还没落盘」。
    // 所以这里指向那个**约定好的**落点，而不是桶文件：主体到位的当天这条自动转绿。
    module: "src/ui/Toast.tsx",
    exportName: "Toast",
    // 红线 7：共享包里禁止 import `sonner`，W05 建的是第一方原语。
    kinds: ["success", "error", "warning", "info"],
    render: "ssr",
  },

  materialGrid: {
    owner: "W06",
    guards: "素材网格 1,000 项的挂载节点数",
    // `MaterialLibrary.tsx` 是门面，真身在 `./material-library-view`（:7 再导出）。
    module: "src/shell/MaterialLibrary.tsx",
    exportName: "MaterialLibrary",
    itemCount: 1_000,
    // `[实测]` prop 名是 `materials`（不是交接稿写的 `items`），见
    // `material-library-view.tsx:94`。该组件挂了 useMaterialLibraryChangeEvents /
    // useMaterialShelfSettle 等一串 effect 与外部订阅，SSR 只出骨架。
    render: "needs-client",
    renderNote:
      "prop 是 materials；组件挂 effect 与外部订阅（material-library-effects），SSR 只出骨架。",
  },

  card: {
    owner: "W07",
    guards: "卡片加载前后几何不变",
    module: "src/shell/MaterialLibrary.tsx",
    exportName: "MaterialCard",
    states: ["loading", "loaded"],
    render: "ssr",
  },

  uploadProgress: {
    owner: "W08",
    guards: "上传进度三态",
    module: "src/shell/ArtifactActions.tsx",
    exportName: "UploadProgress",
    states: ["queued", "uploading", "failed"],
    render: "ssr",
  },

  /**
   * W09 刻意换了被测主体，理由值得写下来。
   *
   * 交接稿沿用台账 S8 的「11 条裸 `next/dynamic`，无 chunk 重试」。
   * `[实测] 2026-08-31 16:2x` 那条已经过期：W09 交卷了，11 条路由现在统一走
   * `lazyRoute()` → `chunkRetryLoader` + `withChunkRetry`（`lib/lazy-with-retry.tsx`）。
   * 顺带一个数数陷阱：`rg 'dynamic\('` 在 `AdvancedContentWorkbench.tsx` 只剩 2 命中，
   * 而且**两条都在注释里**——要数的是 `lazyRoute(`（实测 11 条）。
   *
   * 至于测什么：`AdvancedContentWorkbench` 自己 `useEffect` 之前 `return null`，
   * 静态夹具渲染不出。但 W09 真正要守的东西——**chunk 挂了要有可见且可操作的降级**
   * ——落在 `WorkbenchRouteChunkError` 上，那是个纯表现型组件
   * （`role="alert"` + `data-chunk-failure-kind`），SSR 得出来。
   * 所以这道闸盯失败态本身，而不是盯那个装载不出来的壳。
   */
  chunkIsolation: {
    owner: "W09",
    guards: "chunk 失败态可见且可操作（per-route 隔离的外在表现）",
    module: "src/shell/advanced-routes/WorkbenchRouteLoading.tsx",
    exportName: "WorkbenchRouteChunkError",
    // 两类失败要分开：网络问题可重试；版本已更新（chunk 404）只有刷新有用。
    kinds: ["network", "stale-version"],
    lazyRouteCount: 11,
    render: "ssr",
  },
};

/**
 * 主体缺席时的统一说法。判据只有一句：**缺了就红，不许绕过**（`W10.md` P2②）。
 * 这段话会原样出现在失败信息里，所以它要能让读到的人立刻知道去找谁、找什么。
 */
export function missingSubjectMessage(key) {
  const subject = SUBJECTS[key];
  if (!subject) return `未登记的被测主体：${key}`;
  return [
    `被测主体缺席：${key}（守的是 ${subject.owner} 的「${subject.guards}」）。`,
    subject.module
      ? `模块 ${subject.module} 在位，但没有导出 \`${subject.exportName}\`。`
      : "该主体由 CSS 提供，未在生成区找到对应 token。",
    `这不是闸坏了，是 ${subject.owner} 的产出尚未落地或改名了。`,
    "按 W10.md P2②：缺失判红，不绕过。",
    "⚠️ 判红前先确认导出名与模块路径：2026-08-31 就有过一次 `Button` 明明在",
    "`src/ui/Button.tsx`、登记表却指着 `src/ui/index.tsx` 的假红。",
  ].join("\n  ");
}

/**
 * `render:"needs-client"` 的说法。**和「缺席」严格分开**。
 *
 * 这条红的意思是「主体在位，但本闸这一层覆盖不到它」——归属是**闸的边界**，
 * 不是 owner 的欠账。写清楚是为了不违反 `_COMMON` §8：
 * 不在别人在途的东西上给别人记人头。
 */
export function needsClientMessage(key) {
  const subject = SUBJECTS[key];
  if (!subject) return `未登记的被测主体：${key}`;
  return [
    `主体在位但静态夹具渲染不出：${key}（${subject.owner} 的「${subject.guards}」）。`,
    `原因：${subject.renderNote ?? "需要真实客户端状态机。"}`,
    `模块 ${subject.module} 的 \`${subject.exportName}\` **确实存在**——`,
    "这条红归本闸的覆盖边界，**不记 owner 的人头**。",
    "要覆盖它需要给夹具页加客户端 hydration，那是本套件明确未做的一步，",
    "理由与代价见 docs/testing/visual-regression.md §这道闸守不住什么。",
  ].join("\n  ");
}
