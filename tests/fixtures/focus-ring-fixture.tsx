// 焦点环预算锁的反面/正面用例。**不参与构建**，只被
// `tests/focus-ring-budget.test.mjs` 读。
//
// 判据与数据拴在一起：谁把规则改松让 `src/` 变绿，这里三处反面用例会同时漏网，
// 那份测试当场红。所以想绕过机检就得先把这个文件改坏，而改坏它一样是红的。
//
// 契约（由 focus-ring-budget.test.mjs 的两条反面用例逐字锁住）：
//   该红三处 —— 裸 `outline-none` 的 button、只有 `outline-0` 的 input、
//               导出却没带补偿的类名常量 `STRAY_CLASS`；
//   该绿三处 —— 同串里补了 `focus-visible:ring-2` 的、补了 `focus:ring-2` 的、
//               环藏在模块级常量里的。
// 同一个文件里既有红的又有绿的，这正是「文件级共现」那种判法过不去的一关。

/** 该红：导出的类名常量关掉了轮廓，却没有任何补偿。 */
export const STRAY_CLASS = "inline-flex rounded px-2 outline-none";

/** 该绿：抑制与补偿都在这一个常量里，摊平之后应当算「补上了」。 */
const RECIPE_WITH_RING =
  "inline-flex h-11 w-11 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40";

export function FocusRingFixture() {
  return (
    <div>
      {/* 该红①：关了轮廓，什么都没补回来。 */}
      <button type="button" className="h-8 rounded outline-none">
        裸的抑制点
      </button>

      {/* 该红②：`outline-0` 与 `outline-none` 是一回事，同样要补环。 */}
      <input className="rounded border px-2 outline-0" placeholder="只写了 outline-0" />

      {/* 该绿①：同一串上补了真环。 */}
      <button
        type="button"
        className="outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        补上了
      </button>

      {/* 该绿②：`focus:` 也算——键盘用户不会丢位置，只是鼠标点击时也会亮。 */}
      <a href="#anchor" className="outline-none focus:ring-2 focus:ring-blue-500">
        focus 变体
      </a>

      {/* 该绿③：环藏在模块级常量里，扫描器必须跟进标识符才看得见。 */}
      <button type="button" className={RECIPE_WITH_RING}>
        环写在常量里
      </button>
    </div>
  );
}
