// ============================================================================
// 第一方 toast 原语的判据（W05，2026-08-31）
// ----------------------------------------------------------------------------
// 锁住的是**行为**，不是长相：队列上限、同 id 合并计数、错误不自动消失、
// hover/聚焦暂停整摞、loading 原地转终态、无障碍角色、reduced-motion 下无动画
// 但停留时长不变、宿主接管时让位。
//
// 为什么用真实计时器而不是 fake timers：`ToastProvider` 收一个 `durations` 覆盖，
// 测试传几十毫秒即可。fake timers 要和 `act()` 抢调度，历史上这类测试因此假绿过。
// 停留时长本身也因此是**可注入的**，而不是把 4000ms 抄进断言。
//
// jsdom 取自 `fabric/node` 自带那份（仓内唯一可用），写法与
// `tests/button-primitive.test.mjs:365` 同源。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

/**
 * `useUI` 真身要 next-intl 的 provider（`useLocale()`），装台成本远大于它在本原语里
 * 的作用——toast 只用它把中文原文过一遍。这里换成恒等 tt，插值语义保持一致。
 */
const TT_STUB = dataModule(`
export function useUI() {
  return (zh, vars) =>
    vars
      ? String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
      : zh;
}
`);

let toastModule;
async function loadToast() {
  toastModule ??= await import(
    await compileModule("src/ui/Toast.tsx", { "../i18n/ui/useUI": TT_STUB })
  );
  return toastModule;
}

/**
 * 桥是 `.ts`，node 能直接加载，所以编译台给的是 `file://` —— 与 `Toast.tsx` 里
 * `../lib/toast-bridge` 拿到的是**同一份实例**（module-bench 的既定口径）。
 * 单例状态不会分叉，`registerToastHost()` 才断言得动。
 */
let bridgeModule;
async function loadBridge() {
  bridgeModule ??= await import(await compileModule("src/lib/toast-bridge.ts"));
  return bridgeModule;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
/** 等真实计时器跑过去，同时让 React 把 store 的变更冲进 DOM。 */
const settle = (ms) => act(async () => { await sleep(ms); });

async function withDom(run, { reducedMotion = false } = {}) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // jsdom 不实现 matchMedia。原语用的是可选调用（`window.matchMedia?.(…)`），
  // 所以「没有它」也走得通；要测 reduced-motion 就在这里给一个受控的替身。
  window.matchMedia = (query) => ({
    media: query,
    matches: reducedMotion && query.includes("prefers-reduced-motion"),
    addEventListener() {},
    removeEventListener() {},
  });

  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else {
        delete globalThis[name];
      }
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const { ToastProvider, resetToastStoreForTests } = await loadToast();
  const { resetToastHostForTests } = await loadBridge();
  resetToastHostForTests();
  resetToastStoreForTests();

  const mount = (durations) =>
    act(async () =>
      root.render(React.createElement(ToastProvider, { durations })),
    );

  const items = () => [
    ...window.document.querySelectorAll("[data-leo-toast-id]"),
  ];
  const viewport = () =>
    window.document.querySelector("[data-leo-toast-viewport]");
  const titles = () =>
    items().map((node) => node.querySelector("p")?.textContent ?? "");

  try {
    await run({ window, mount, items, viewport, titles });
  } finally {
    await act(async () => root.unmount());
    resetToastStoreForTests();
    resetToastHostForTests();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

// ------------------------------------------------------------- 结构性断言
//
// 这一条不看 DOM：把 `error` 改成任何会自动消失的值都当场红，而不是只在
// 「恰好等 4000ms」的那条时序用例里红。

test("停留时长表：error 与 loading 一律不自动消失，success/info 有限且分档", async () => {
  const { TOAST_DWELL, TOAST_MAX_VISIBLE } = await loadToast();
  assert.equal(TOAST_DWELL.error, 0, "错误必须不自动消失：用户要有时间读完并复制");
  assert.equal(TOAST_DWELL.loading, 0, "loading 是中间态，只能由调用方结束");
  assert.ok(
    TOAST_DWELL.success > 0 && TOAST_DWELL.info > TOAST_DWELL.success,
    `success/info 该是「有限且 info 更久」，实测 ${JSON.stringify(TOAST_DWELL)}`,
  );
  assert.equal(TOAST_MAX_VISIBLE, 3, "同时可见上限是 3，超出的排队");
});

// ------------------------------------------------------------------ 队列

test("同时最多显示 3 条，第 4 条排队；前面让位后它才补上来", async () => {
  const { useToast, TOAST_MAX_VISIBLE } = await loadToast();
  await withDom(async ({ mount, items, titles }) => {
    await mount({ success: 0 }); // 0 = 不自动消失，把时序变量从这条用例里去掉
    const toast = useToast();

    await act(async () => {
      for (const name of ["一", "二", "三", "四", "五"]) {
        toast.success(`保存了${name}`);
      }
    });

    assert.equal(items().length, TOAST_MAX_VISIBLE, "可见条数没被压到 3");
    assert.deepEqual(
      titles(),
      ["保存了一", "保存了二", "保存了三"],
      "可见的应该是最早那 3 条（先进先出），后来的排队",
    );

    // 摞在最前面那条走掉之后，排队的第 4 条要补进来。
    await act(async () => toast.dismiss("auto:success:保存了一\u0000"));
    await settle(0);
    assert.ok(
      titles().includes("保存了四"),
      `第 4 条没有补位，当前是 ${JSON.stringify(titles())}`,
    );
  });
});

test("同内容不叠成两条：合并成一条并计数，连点保存不会刷屏", async () => {
  const { useToast } = await loadToast();
  await withDom(async ({ mount, items }) => {
    await mount({ success: 0 });
    const toast = useToast();

    await act(async () => {
      toast.success("已保存");
      toast.success("已保存");
      toast.success("已保存");
    });

    assert.equal(items().length, 1, "同内容被叠成了多条");
    const badge = items()[0].querySelector("[data-leo-toast-count]");
    assert.equal(
      badge?.getAttribute("data-leo-toast-count"),
      "3",
      "计数没跟上（应为 3）",
    );

    // 内容不同就不该合并。
    await act(async () => toast.success("已发布"));
    assert.equal(items().length, 2, "不同内容被错误地合并了");
  });
});

// ------------------------------------------------------------------ 停留

test("error 不会自己消失，且带得走的关闭键（否则没法关）", async () => {
  const { useToast } = await loadToast();
  await withDom(async ({ mount, items }) => {
    // success 做对照：同一段等待里它必须消失，error 必须留下。
    // 时长给足 2s —— jsdom + act() 的固定开销在这台机上能到几百毫秒，
    // 取小值会让「刚建好就已过期」，测出来的是机器速度不是行为。
    await mount({ success: 2_000 });
    const toast = useToast();

    await act(async () => {
      toast.error("上传失败", "服务端返回 500");
      toast.success("另一件事成功了");
    });
    assert.equal(items().length, 2);

    await settle(2_600);

    const kinds = items().map((node) =>
      node.getAttribute("data-leo-toast-kind"),
    );
    assert.deepEqual(kinds, ["error"], `对照组没走 / error 走了：${kinds}`);

    const close = items()[0].querySelector("[data-leo-toast-close]");
    assert.ok(Boolean(close), "error 那条没有关闭键，用户没有任何办法关掉它");
    assert.ok(
      (close.getAttribute("aria-label") || "").length > 0,
      "关闭键没有可读名字",
    );

    await act(async () =>
      close.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }),
      ),
    );
    await settle(0);
    assert.equal(items().length, 0, "点了关闭键还在");
  });
});

test("hover 暂停的是整摞倒计时，不只是光标底下那一条", async () => {
  const { useToast } = await loadToast();
  await withDom(async ({ mount, items, viewport, titles }) => {
    await mount({ success: 1_500 });
    const toast = useToast();

    await act(async () => {
      toast.success("第一条");
      toast.success("第二条");
    });
    assert.equal(items().length, 2);

    // 光标进 viewport（不是进某一条），整摞都该停。
    await act(async () =>
      viewport().dispatchEvent(
        new window.MouseEvent("mouseenter", { bubbles: false }),
      ),
    );
    // 等到远超停留时长：没暂停的话两条早该走了。
    await settle(2_200);
    assert.deepEqual(
      titles(),
      ["第一条", "第二条"],
      "hover 期间 toast 还是消失了：倒计时没被暂停",
    );

    // 离开之后按余额继续跑完。
    await act(async () =>
      viewport().dispatchEvent(
        new window.MouseEvent("mouseleave", { bubbles: false }),
      ),
    );
    await settle(2_200);
    assert.equal(items().length, 0, "mouseleave 之后倒计时没有恢复");
  });
});

test("键盘聚焦也暂停：focusin 停、focusout 续", async () => {
  const { useToast } = await loadToast();
  await withDom(async ({ mount, items, viewport }) => {
    await mount({ success: 1_500 });
    const toast = useToast();
    await act(async () => toast.success("用键盘走到我这里"));

    await act(async () =>
      viewport().dispatchEvent(new window.Event("focusin", { bubbles: true })),
    );
    await settle(2_200);
    assert.equal(items().length, 1, "聚焦期间倒计时没停");

    await act(async () =>
      viewport().dispatchEvent(new window.Event("focusout", { bubbles: true })),
    );
    await settle(2_200);
    assert.equal(items().length, 0, "失焦之后倒计时没恢复");
  });
});

// ----------------------------------------------------------- loading 转终态

test("loading 原地翻成 success：同一个 id、同一个节点，不是消失再弹一条", async () => {
  const { useToast } = await loadToast();
  await withDom(async ({ mount, items }) => {
    await mount({ success: 0 });
    const toast = useToast();

    let handle;
    await act(async () => {
      handle = toast.loading("正在导出…");
    });
    assert.equal(items().length, 1);
    assert.equal(items()[0].getAttribute("data-leo-toast-kind"), "loading");
    const idBefore = items()[0].getAttribute("data-leo-toast-id");

    await act(async () => handle.success("导出完成", "已存到「我的文件」"));

    assert.equal(items().length, 1, "转终态时多弹了一条");
    assert.equal(
      items()[0].getAttribute("data-leo-toast-kind"),
      "success",
      "kind 没翻面",
    );
    assert.equal(
      items()[0].getAttribute("data-leo-toast-id"),
      idBefore,
      "id 变了 —— 那就不是「原地」翻面",
    );
    // 同一件事有了结果，不是重复，所以不该出计数徽标。
    assert.equal(
      items()[0].querySelector("[data-leo-toast-count]"),
      null,
      "原地转终态被当成了重复，长出了计数",
    );
  });
});

// ------------------------------------------------------------------ 无障碍

test("容器是预先存在的 polite 活动区；error 那条自己带 assertive", async () => {
  const { useToast } = await loadToast();
  await withDom(async ({ mount, items, viewport }) => {
    await mount({ success: 0 });

    // 空的时候容器就要在 DOM 里：aria-live 只播报**已存在**活动区内部的变化，
    // 等有内容了才插容器，屏幕阅读器什么也不会念。
    assert.ok(Boolean(viewport()), "没有 toast 时容器就不在 DOM 里");
    assert.equal(viewport().getAttribute("role"), "status");
    assert.equal(viewport().getAttribute("aria-live"), "polite");

    const toast = useToast();
    await act(async () => {
      toast.success("已保存");
      toast.error("保存失败");
    });

    const bySeverity = Object.fromEntries(
      items().map((node) => [
        node.getAttribute("data-leo-toast-kind"),
        {
          role: node.getAttribute("role"),
          live: node.getAttribute("aria-live"),
        },
      ]),
    );
    assert.equal(bySeverity.error.role, "alert", "error 没有 role=alert");
    assert.equal(
      bySeverity.error.live,
      "assertive",
      "error 没有 aria-live=assertive",
    );
    assert.equal(
      bySeverity.success.role,
      null,
      "success 不该自己抢 role，容器那条 polite 已经够了",
    );
  });
});

// -------------------------------------------------------------- 减少动效

test("reduced-motion：过渡归零但停留时长照旧（无动画 ≠ 不停留）", async () => {
  const { useToast } = await loadToast();
  await withDom(
    async ({ mount, items, viewport }) => {
      await mount({ success: 1_500 });
      assert.equal(
        viewport().getAttribute("data-leo-reduced-motion"),
        "true",
        "没把 reduced-motion 打成属性 —— jsdom 不跑媒体查询，只能靠它断言",
      );

      const toast = useToast();
      await act(async () => toast.success("已保存"));
      assert.equal(items().length, 1, "reduced-motion 下 toast 压根没出现");

      // 停留是 JS 驱动的，不该被「关掉动效」顺手关掉：
      // 远未到点时必须还在，过了点必须走。
      await settle(300);
      assert.equal(items().length, 1, "还没到时长就消失了");
      await settle(2_200);
      assert.equal(items().length, 0, "reduced-motion 下不再遵守停留时长");
    },
    { reducedMotion: true },
  );
});

test("默认（不减少动效）时不打那个属性，CSS 才有过渡可跑", async () => {
  await withDom(async ({ mount, viewport }) => {
    await mount({});
    assert.equal(
      viewport().getAttribute("data-leo-reduced-motion"),
      null,
      "没开 reduced-motion 却把过渡关了",
    );
  });
});

test("动效只走 token，一处裸时长/裸曲线都没有（红线 9）", async () => {
  const { LEO_TOAST_MOTION_CSS } = await loadToast();
  const durations = LEO_TOAST_MOTION_CSS.match(/\d+m?s\b/g) ?? [];
  assert.deepEqual(
    durations,
    [],
    `样式里出现了裸时长：${durations.join("、")}（应当只写 var(--leo-dur-*)）`,
  );
  for (const bare of ["ease-in", "ease-out", "linear", "cubic-bezier("]) {
    assert.equal(
      LEO_TOAST_MOTION_CSS.includes(bare),
      false,
      `样式里出现了裸曲线 ${bare}（应当只写 var(--leo-ease-*)）`,
    );
  }
  // A-2：引用 token 但**不写** fallback 原始值，token 缺席时退化成「无过渡」。
  assert.equal(
    /var\(--leo-(dur|ease|move)-[a-z0-9-]+,/.test(LEO_TOAST_MOTION_CSS),
    false,
    "动效 token 写了 fallback 裸值，违反本波裁定 A-2",
  );
  // `--leo-safe-*` 是例外：它不是动效 token，缺了会让整条 calc() 失效、位置崩掉。
  assert.ok(
    LEO_TOAST_MOTION_CSS.includes("var(--leo-safe-bottom, 0px)"),
    "安全区 token 必须写 fallback，否则门户上 calc() 会整条失效",
  );
});

// -------------------------------------------------------------- 与宿主共存

test("宿主接管后第一方 viewport 整个让位，不会出现两摞", async () => {
  const { useToast } = await loadToast();
  const { registerToastHost } = await loadBridge();
  await withDom(async ({ mount, viewport }) => {
    await mount({ success: 0 });
    assert.ok(Boolean(viewport()), "默认路径下第一方 viewport 应该在");

    const seen = [];
    await act(async () => {
      registerToastHost({
        show: (payload) => seen.push(["show", payload.title]),
        update: (payload) => seen.push(["update", payload.title]),
        dismiss: (id) => seen.push(["dismiss", id]),
      });
    });

    assert.equal(viewport(), null, "宿主已接管，第一方 viewport 还在渲染");

    // 让位不等于失联：时序仍由本 store 说了算，事件要转发给宿主。
    const toast = useToast();
    await act(async () => toast.success("已保存"));
    assert.deepEqual(
      seen,
      [["show", "已保存"]],
      `没有把 toast 转发给宿主：${JSON.stringify(seen)}`,
    );
  });
});

test("共享包里不出现任何第三方 toast 库的名字（红线 7）", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (const rel of ["src/ui/Toast.tsx", "src/lib/toast-bridge.ts"]) {
    const text = readFileSync(join(repo, rel), "utf8");
    assert.equal(
      /\bsonner\b/.test(text),
      false,
      `${rel} 里出现了 sonner —— 它在本包里是 optional peer，31 个站不一定装`,
    );
    assert.equal(
      /\bfrom\s+"(?!\.|react)/.test(text),
      false,
      `${rel} 引了包名依赖；本原语必须零运行时依赖（只许 react 与相对路径）`,
    );
  }
});
