// 焦点环预算锁的反面/正面用例，被 `tests/focus-ring-budget.test.mjs` 直接扫。
//
// 这份 fixture 的存在理由是「机检与数据拴在一起」：判据函数同时扫 `src/` 与本文件，
// 谁把规则改松让 `src/` 变绿，下面三处该红的会同时漏网，那份测试当场红。
//
// **一个文件里既有补了环的也有没补的** —— 这正是「文件级共现」判法过不去的那一关：
// 拿 grep 看这个文件是「`outline-none` 与 `focus-visible` 共现」，三处该红的会被全部放过。

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const BASE = "inline-flex items-center rounded px-2";

/** 环与抑制写在同一个常量里：摊平跟不进标识符的话，下面「绿 3」会被误判成红。 */
const SAFE_RING = "outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/** 红 3：导出的类名契约，消费方原样贴到元素上，但它自己没带补偿。 */
export const STRAY_CLASS = "rounded px-2 outline-none";

/** 绿：同为导出契约，但补偿就在同一串里。 */
export const SAFE_BUTTON_CLASS = "rounded px-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function FocusRingFixture() {
  return (
    <div>
      {/* 红 1：裸抑制，键盘用户按到这里看不见自己在哪。 */}
      <button type="button" className="rounded px-2 outline-none">
        没补环的按钮
      </button>

      {/* 红 2：输入框同样会被 Tab 到；`outline-0` 与 `outline-none` 是一回事。 */}
      <input className="border px-2 outline-0" />

      {/* 绿 1：同一串上补了 focus-visible 环。 */}
      <button type="button" className="rounded px-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        补了环的按钮
      </button>

      {/* 绿 2：`focus:` 比 `focus-visible:` 差（鼠标点击也会亮），但键盘用户确实看得见。 */}
      <a href="#anchor" className="outline-none focus:ring-2 focus:ring-blue-500">
        补了 focus 环的链接
      </a>

      {/* 绿 3：环藏在模块级常量里，字面量上一个字都没有 —— `src/ui/Button.tsx` 的写法。 */}
      <button type="button" className={cx(BASE, SAFE_RING)}>
        环在常量里的按钮
      </button>
    </div>
  );
}
