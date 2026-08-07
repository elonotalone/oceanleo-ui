// ============================================================================
// pptx-preview 的图表引擎接缝 —— 把 echarts 从「静态依赖」改成「用到才取」。
// ----------------------------------------------------------------------------
// 上游 `pptx-preview@1.0.7` 的 `dist/pptx-preview.es.js` 第一行就是
// `import*as h from"echarts"`，是命名空间导入，摇不掉。实测代价：预览容器里编译出的
// echarts@5.6.0 有 23 个 chunk / 5,565,729 B 未压缩，占整条 PPT 预览依赖闭包
// （6,061,093 B）的 91.8%，而它在**首帧**一次都用不上。
//
// 为什么不是「切掉 chart」：实测货架上 118/146 件 published deck 真的含
// `ppt/charts/chart*.xml`（80.8%），切掉等于五分之四的模板掉图。
// 为什么「按需取」够用：实测抽查 30 件含 chart 的 deck，chart 全部落在第 5–7 页，
// **第 1 页带 chart 的是 0 件** —— 首帧只渲第 1 页，所以首帧不需要图表引擎。
//
// 上游只用到 echarts 的三个 API（`init` / `setOption` / `dispose`），而且调用点本来
// 就包在一次 `setTimeout(…, 0)` 里，所以换成异步取库不改变它的时序语义：
//
//   var t = h.init(e, null, { renderer: "svg" });
//   t.setOption(i);
//   vt("destroy",     function () { t && t.dispose(), t && (t = null); });
//   vt("removeSlide", function () { t && t.dispose(), t && (t = null); });
//
// 下面的 `init` 立刻返回一个占位句柄，把 `setOption` 收下、等真引擎到位再放行；
// 期间 `dispose` 先到也认。取库失败不许静默：容器上会留下
// `data-pptx-chart="unavailable:…"` 与一句可见的提示。
//
// 引擎钉在 `echarts5`（`package.json` 里 `npm:echarts@^5.6.0` 的别名），不是本包自用的
// echarts 6：上游的 option 是照 v5 生成的，换大版本属于渲染行为变更，不在本次改动的
// 范围里。合并成一份 echarts 6 是后续可做的一笔，但需要真浏览器核对图表外观。
// ============================================================================

/**
 * 缩略图工场（`library-viewers.tsx` 里那个屏幕外的第二实例）在宿主上挂这个属性。
 * 页轨缩略图今天本来就没有图表：上游把 `h.init` 包在 `setTimeout(…, 0)` 里，而补渲一页
 * 之后马上渲下一页会先 `removeCurrentSlide()`，回调落到已被摘掉的节点上。既然这一格
 * 本来就是空的，就别为它把 5.3 MiB 的引擎拉下来。
 */
const CHART_ENGINE_OFF = '[data-pptx-chart-engine="off"]';

/** @type {Promise<any> | null} */
let enginePromise = null;

function chartEngineDisabledFor(container) {
  return Boolean(
    container &&
      typeof container.closest === "function" &&
      container.closest(CHART_ENGINE_OFF),
  );
}

function loadEngine() {
  if (!enginePromise) {
    enginePromise = import("echarts5").then(
      (module) => module.init ? module : module.default,
    );
  }
  return enginePromise;
}

function mark(container, value) {
  if (container && typeof container.setAttribute === "function") {
    container.setAttribute("data-pptx-chart", value);
  }
}

function showUnavailable(container, reason) {
  mark(container, `unavailable:${reason}`);
  const ownerDocument = container && container.ownerDocument;
  if (!ownerDocument || container.firstChild) return;
  const notice = ownerDocument.createElement("div");
  notice.className = "pptx-chart-unavailable";
  notice.setAttribute("role", "note");
  notice.style.cssText =
    "display:flex;align-items:center;justify-content:center;width:100%;height:100%;" +
    "box-sizing:border-box;padding:8px;border:1px dashed #d6d3d1;border-radius:6px;" +
    "color:#78716c;font-size:12px;line-height:1.4;text-align:center;background:#fafaf9";
  notice.textContent = "图表未能加载";
  container.append(notice);
}

/**
 * `echarts.init` 的延迟版。签名与返回值面向上游那一处调用点，不是通用封装。
 *
 * @param {HTMLElement} container
 * @param {unknown} theme
 * @param {Record<string, unknown>} options
 */
export function init(container, theme, options) {
  let chart = null;
  let pendingOption = null;
  let disposed = false;

  if (chartEngineDisabledFor(container)) {
    // 占位而非报错：这一格在缩略图里本来就该是空的，不是失败。
    mark(container, "skipped:thumbnail");
    return { setOption() {}, dispose() {} };
  }

  mark(container, "pending");
  loadEngine().then(
    (echarts) => {
      if (disposed) return;
      chart = echarts.init(container, theme, options);
      mark(container, "rendered");
      if (pendingOption !== null) {
        chart.setOption(pendingOption);
        pendingOption = null;
      }
    },
    (reason) => {
      if (disposed) return;
      showUnavailable(container, "load-failed");
      // 静默出错不行：解析链路本身不失败，但这一格确实没画出来，得留下痕迹。
      console.error("[pptx-preview] chart engine unavailable", reason);
    },
  );

  return {
    setOption(option) {
      if (chart) chart.setOption(option);
      else pendingOption = option;
    },
    dispose() {
      disposed = true;
      pendingOption = null;
      if (chart) {
        chart.dispose();
        chart = null;
      }
    },
  };
}
