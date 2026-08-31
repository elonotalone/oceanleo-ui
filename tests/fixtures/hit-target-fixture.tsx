// 命中区预算锁的反面/正面用例，被 `tests/hit-target-budget.test.mjs` 直接扫。
//
// 机检与数据拴在一起：判据函数同时扫 `src/` 与本文件。谁把规则改松让 `src/` 变绿，
// 下面五处该红的会同时漏网，那份测试当场红。
//
// 本文件只被 AST 读，不被执行；`tsconfig.json` 的 include 只有 `src/**/*`，
// 所以它也不进 typecheck。

import { Button } from "../../src/ui/Button";

const DENSE_ROW = "inline-flex items-center rounded px-2";

export function HitTargetFixture() {
  return (
    <div>
      {/* ── 该红的五处 ── */}

      {/* 红 1：缩放键那一族，28px。手指按不中，鼠标也要瞄。 */}
      <button type="button" className="h-7 w-7 rounded">
        −
      </button>

      {/* 红 2：链接也是交互元素，32px 同样不够。 */}
      <a href="#somewhere" className={`${DENSE_ROW} h-8`}>
        打开
      </a>

      {/* 红 3：输入框 40px —— 只差 4px 也是不够，44 是线不是建议。 */}
      <input className="h-10 border px-2" />

      {/* 红 4：用 role 宣称自己是按钮，就要按按钮的标准量。 */}
      <div role="button" tabIndex={0} className="h-8 rounded bg-stone-100">
        自定义按钮
      </div>

      {/* 红 5：原语的 sm 档是 36，只许出现在已登记的密集工具条里。 */}
      <Button size="sm">小号</Button>

      {/* ── 该绿的五处 ── */}

      {/* 绿 1：写死了 44。 */}
      <button type="button" className="h-11 w-11 rounded-full">
        ✓
      </button>

      {/* 绿 2：原语默认档就是 lg(44)，什么都不用写。 */}
      <Button>保存</Button>

      {/* 绿 3：`h-8` 写小了，但 `min-h-11` 把命中区托住了。 */}
      <button type="button" className="h-8 min-h-11 px-3">
        托底
      </button>

      {/* 绿 4：没写死高度，靠 padding 撑。静态判据量不出来就不猜——
          这是本判据**明确的查证范围边界**，写进了测试头注释。 */}
      <button type="button" className="rounded px-3 py-2">
        没写高度
      </button>

      {/* 绿 5：`h-8` 但不可交互，没有 handler、没有 role、不是交互标签。 */}
      <span className="h-8 w-8 rounded bg-stone-200" />
    </div>
  );
}
