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
  },

  overlay: {
    owner: "W03",
    guards: "弹层进场（origin-correct）/ 退场 / focus 环",
    module: "src/shell/anchored-popover.tsx",
    exportName: "AnchoredPopover",
    states: ["enter", "exit", "focus-ring"],
  },

  button: {
    owner: "W04",
    guards: "Button 四 variant × 三 size × 五状态矩阵",
    module: "src/ui/index.tsx",
    // `01-verified-facts.md` §1.6：`src/ui/index.tsx` 今天导出 Modal/Switch/… 但
    // **没有 Button**（823 个裸 `<button>` 正是因此）。W04 落地后这里自然转绿。
    exportName: "Button",
    variants: ["primary", "secondary", "ghost", "danger"],
    sizes: ["sm", "md", "lg"],
    states: ["rest", "hover", "active", "focus-visible", "disabled"],
  },

  toast: {
    owner: "W05",
    guards: "Toast 四类型 + 队列上限",
    module: "src/ui/index.tsx",
    exportName: "Toast",
    // 红线 7：共享包里禁止 import `sonner`，W05 建的是第一方原语。
    kinds: ["success", "error", "warning", "info"],
  },

  materialGrid: {
    owner: "W06",
    guards: "素材网格 1,000 项的挂载节点数",
    module: "src/shell/MaterialLibrary.tsx",
    exportName: "MaterialLibrary",
    itemCount: 1_000,
  },

  card: {
    owner: "W07",
    guards: "卡片加载前后几何不变",
    module: "src/shell/MaterialLibrary.tsx",
    exportName: "MaterialCard",
    states: ["loading", "loaded"],
  },

  uploadProgress: {
    owner: "W08",
    guards: "上传进度三态",
    module: "src/shell/ArtifactActions.tsx",
    exportName: "UploadProgress",
    states: ["queued", "uploading", "failed"],
  },

  chunkIsolation: {
    owner: "W09",
    guards: "chunk 失败态 / per-route 隔离",
    // S8 已自证 `[实测]`：本文件 :49–:119 共 11 条 `next/dynamic` 路由。
    module: "src/shell/AdvancedContentWorkbench.tsx",
    exportName: "AdvancedContentWorkbench",
    dynamicRouteCount: 11,
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
  ].join("\n  ");
}
