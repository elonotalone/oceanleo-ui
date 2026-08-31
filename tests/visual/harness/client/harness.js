/* ===========================================================================
 * 页内运行时：确定性（P2）与交互延迟测量（P3）
 * ---------------------------------------------------------------------------
 * 这份文件是普通脚本，不是模块，也不依赖任何包——夹具页要能在没有打包器的情况下
 * 直接跑（本仓 node_modules 里没有 esbuild/vite/webpack，见交付说明）。
 *
 * P2 的三件事在这里落两件：
 *   ② `__leoMotionJumpAllToRest()`：Playwright 的 `animations:'disabled'`
 *      只关 CSS 动画与过渡，**不停 JS 驱动的 rAF 弹簧**。所以截图前必须把 spring
 *      驱动的动效落到终态。钩子由 `src/lib/motion/spring.ts` 在被加载时安装
 *      （规范：`docs/architecture/motion-system.md` §规范二·实现约束 6）。
 *      **钩子不存在就如实上报 absent，由用例判红——这里绝不 fallback 成「假装settled」。**
 *   ③ mask 动态内容：把时间戳/随机 id/头像/体积数字打上 `data-leo-mask`，
 *      由用例交给 Playwright 的 `mask` 选项。
 * （① `animations:'disabled'` 在 playwright.config.ts 里，不在这层。）
 * =========================================================================== */
(function () {
  "use strict";

  /** 动态内容的选择器。截图闸里这些东西每跑一次都不一样，不 mask 必假阳性。 */
  var MASK_SELECTORS = [
    "[data-leo-mask]",
    "[data-testid='timestamp']",
    "time",
    "img[src*='avatar']",
    "[data-leo-filesize]",
  ];

  var state = {
    springModule: "unknown", // 'loaded' | 'absent' | 'error'
    springError: null,
    hookPresent: false,
    hookCalled: false,
    marks: [],
  };

  /**
   * 加载 spring 原语。它按规范是**无依赖、不碰 DOM 的纯模块**，所以可以由
   * 服务端用 tsc 单文件转译后直接当 ESM 引进来，不需要打包器。
   * 加载它的唯一目的就是让它安装 `window.__leoMotionJumpAllToRest`。
   */
  function loadSpring() {
    // 走 index 而非 spring：钩子挂在 index（`src/lib/motion/index.ts:49`），
    // spring 本身刻意不碰 window。
    return import("/__client/motion/index.mjs")
      .then(function (mod) {
        state.springModule = mod && mod.__leoAbsent ? "absent" : "loaded";
        if (mod && mod.__leoAbsentReason) state.springError = mod.__leoAbsentReason;
      })
      .catch(function (error) {
        state.springModule = "error";
        state.springError = String((error && error.message) || error);
      });
  }

  /**
   * 落到终态。返回**如实的**报告：钩子在不在、调没调成。
   * 用例据此判红；这里不做任何补偿。
   */
  function settle() {
    var hook = window.__leoMotionJumpAllToRest;
    state.hookPresent = typeof hook === "function";
    if (state.hookPresent) {
      try {
        hook();
        state.hookCalled = true;
      } catch (error) {
        state.hookCalled = false;
        state.springError = String((error && error.message) || error);
      }
    }
    return nextFrames(2)
      .then(function () {
        return document.fonts && document.fonts.ready ? document.fonts.ready : null;
      })
      .then(function () {
        return {
          springModule: state.springModule,
          springError: state.springError,
          hookPresent: state.hookPresent,
          hookCalled: state.hookCalled,
        };
      });
  }

  function nextFrames(count) {
    return new Promise(function (resolve) {
      var remaining = count;
      (function step() {
        if (remaining-- <= 0) return resolve();
        requestAnimationFrame(step);
      })();
    });
  }

  /** 给动态内容打标，供 Playwright `mask` 使用。 */
  function maskTargets() {
    var found = [];
    MASK_SELECTORS.forEach(function (selector) {
      try {
        document.querySelectorAll(selector).forEach(function (node) {
          node.setAttribute("data-leo-mask", "");
          found.push(selector);
        });
      } catch (_) {
        /* 无效选择器不该让整页失败 */
      }
    });
    return found.length;
  }

  /* -------------------------------------------------------------------------
   * P3 · 交互延迟测量
   *
   * 量的是「意图发生」到「界面稳定」之间的墙钟时间，用 performance.mark /
   * performance.measure。刻意**不**在这里做 p95：单次读数交给用例收集，
   * 分位数在 Node 侧算，这样样本量与丢弃策略在用例里是可见的。
   * ---------------------------------------------------------------------- */

  /**
   * @param {string} name 交互名（写进预算文件的 key）
   * @param {() => void} action 触发意图的同步动作
   * @param {() => boolean} settledWhen 判定「界面已稳定」的谓词
   */
  function measure(name, action, settledWhen) {
    var startMark = name + ":start";
    var endMark = name + ":end";
    performance.mark(startMark);
    action();
    return waitFor(settledWhen, 5_000).then(function (ok) {
      performance.mark(endMark);
      var entry = performance.measure(name, startMark, endMark);
      var sample = { name: name, duration: entry.duration, settled: ok };
      state.marks.push(sample);
      return sample;
    });
  }

  function waitFor(predicate, timeoutMs) {
    var deadline = performance.now() + timeoutMs;
    return new Promise(function (resolve) {
      (function poll() {
        var done = false;
        try {
          done = Boolean(predicate());
        } catch (_) {
          done = false;
        }
        if (done) return resolve(true);
        if (performance.now() > deadline) return resolve(false);
        requestAnimationFrame(poll);
      })();
    });
  }

  window.__leoVisual = {
    ready: loadSpring(),
    settle: settle,
    maskTargets: maskTargets,
    measure: measure,
    marks: function () {
      return state.marks.slice();
    },
    report: function () {
      return {
        springModule: state.springModule,
        springError: state.springError,
        hookPresent: state.hookPresent,
        hookCalled: state.hookCalled,
        marks: state.marks.slice(),
      };
    },
  };
})();
