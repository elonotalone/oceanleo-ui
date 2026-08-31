import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  IMAGE_AI_PANEL_CAPABILITIES,
  IMAGE_AI_RESULT_PLACEMENT,
  IMAGE_DIRECT_COMMAND_REGISTRY,
  IMAGE_MAX_DIMENSION,
  classifyImageAiFailure,
  imageUpscalePreflight,
  startImageDirectCommand,
} from "../src/shell/image-editor/image-capability-engine.ts";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const PANEL = "../src/shell/image-editor/FabricImageCreationPanels.tsx";
const ROUTE = "../src/shell/advanced-routes/ImageRoute.tsx";

/**
 * 引擎与网关早就通了，界面上一个入口都没有——这是本份活要补的那个洞。
 * 所以第一条锁的就是「每条接出来的能力都有入口」。
 */
test("every wired image AI capability is reachable from the panel", () => {
  const wired = IMAGE_AI_PANEL_CAPABILITIES.map((entry) => entry.id);
  assert.deepEqual(
    [...wired].sort(),
    [
      "outpaint",
      "panorama",
      "portrait-quality",
      "relight",
      "remove-bg",
      "upscale",
    ],
    "面板接出的能力集合变了；变更要同步 verdicts/W18-delivery.md 的能力→端点表",
  );
  // 刻意不接的那几条不许悄悄冒出来（一次 2–625 张拼版图，办公场景无用且烧额度）。
  for (const absent of [
    "multi-angle",
    "grid-4",
    "grid-9",
    "grid-25",
    "grid-split",
  ]) {
    assert.ok(
      !wired.includes(absent),
      `${absent} 不该出现在面板里：理由见 W18 交付说明`,
    );
  }
  for (const entry of IMAGE_AI_PANEL_CAPABILITIES) {
    assert.match(entry.label, /[\u4e00-\u9fa5]/, "能力要有中文名，不能露出 inpaint 这种词");
    assert.ok(entry.summary.length > 8, `${entry.id} 缺一句话说明`);
  }
  // 抠图是一等公民：编辑栏上有明位入口，不埋进列表。
  const cutout = IMAGE_AI_PANEL_CAPABILITIES.find((e) => e.id === "remove-bg");
  assert.equal(cutout.featured, true);
  assert.equal(cutout.kind, "direct");

  const panel = source(PANEL);
  for (const entry of IMAGE_AI_PANEL_CAPABILITIES) {
    assert.ok(
      panel.includes("panel.capabilities.map"),
      "面板要遍历能力表渲染入口",
    );
    assert.ok(entry.id.length > 0);
  }
});

test("remove-bg is registered as a direct gateway capability with alpha output", () => {
  const cutout = IMAGE_DIRECT_COMMAND_REGISTRY.find((e) => e.id === "remove-bg");
  assert.ok(cutout, "remove-bg 必须登记在直连注册表里");
  // 端点逐字等于 backend/app/routers/images_router.py 的注册值。
  assert.equal(cutout.endpoint, "/v1/images/remove-bg");
  assert.equal(cutout.producesAlpha, true);

  // 网关这一条返回 `image` 单数，其余几条是 `images` 数组；读错就永远拿不到结果图。
  const route = source(ROUTE);
  assert.match(route, /data\?\.image\b/, "抠图要读 data.image（单数）");
  assert.match(route, /key_mode: "platform"/);
  assert.match(route, /\/v1\/images\/remove-bg/);
});

/**
 * 反面验证 A：把结果改成直接覆盖背景，这一条当场红。
 */
test("AI results land as a new layer and never overwrite the canvas", () => {
  assert.equal(IMAGE_AI_RESULT_PLACEMENT, "new-layer");

  const panel = source(PANEL);
  assert.match(
    panel,
    /editor\.addImageFromUrl\(preview\.afterUrl\)/,
    "结果必须加成新图层",
  );
  // 旧的 runAiEdit() 走 replaceWithBackground()，本面板绝不许走那条路。
  // 只认调用，不认注释——注释里正记着这条反面样本。
  assert.doesNotMatch(
    panel,
    /\.(?:replaceWithBackground|replaceSelectedImageFromUrl)\s*\(/,
    "AI 面板不许覆盖用户画布",
  );
  // 落地前显式对设防常量把关，改成覆盖会当场抛。
  assert.match(panel, /IMAGE_AI_RESULT_PLACEMENT !== "new-layer"/);
  // 先给前后对比，用户确认之后才落地。
  assert.match(panel, /function BeforeAfter/);
  assert.match(panel, /preview\.beforeUrl/);
  assert.match(panel, /preview\.afterUrl/);
  const applyIndex = panel.indexOf("应用为新图层");
  const discardIndex = panel.indexOf("放弃");
  assert.ok(applyIndex > 0 && discardIndex > 0, "预览要同时给应用与放弃");
});

/**
 * 反面验证 B：把 disabledReason 改成隐藏按钮，这一条当场红。
 */
test("unavailable capabilities stay visible with a stated reason", () => {
  const panel = source(PANEL);
  assert.match(
    panel,
    /!view\.enabled && view\.disabledReason/,
    "不可用时要显示理由",
  );
  assert.match(
    panel,
    /disabled=\{!view\.enabled \|\| busy \|\| blocked\}/,
    "不可用时按钮是灰态，不是消失",
  );
  // 按钮本体不许被 view.enabled 包成条件渲染（那就是「藏起来」）。
  assert.doesNotMatch(
    panel,
    /\{view\.enabled && \(\s*<button/,
    "不许把按钮藏起来：藏了用户根本不知道有这个功能",
  );

  // 引擎侧 fail-closed：没有执行方时给得出理由，而不是静默不可用。
  const blocked = startImageDirectCommand(
    null,
    "remove-bg",
    { sourceUrl: "https://cdn.example.com/a.png" },
    {},
  );
  return blocked.result.then((result) => {
    assert.equal(result.status, "unsupported");
    assert.match(result.disabledReason, /provider adapter/);
  });
});

/**
 * 反面验证 C：把超上限的拦截摘掉，这一条当场红。
 */
test("upscale is blocked locally before any request when it exceeds 8192px", () => {
  assert.equal(IMAGE_MAX_DIMENSION, 8192);

  const ok = imageUpscalePreflight(1080, 1080, 2);
  assert.equal(ok.ok, true);
  assert.equal(ok.width, 2160);
  assert.equal(ok.height, 2160);

  // 4096 × 4× = 16384 > 8192：必须本地拦下，并把预估尺寸照实告诉用户。
  const tooBig = imageUpscalePreflight(4096, 4096, 4);
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.width, 16384);
  assert.match(tooBig.reason, /16384/);
  assert.match(tooBig.reason, /8192/);

  const panel = source(PANEL);
  // 尺寸预览：用户要在点之前就知道 2× 之后是多大。
  assert.match(panel, /\{upscale\.width\}×/);
  // 拦截发生在把请求发出去之前：preflight 必须早于 freezeCanvas。
  const runStart = panel.indexOf("const run = useCallback");
  const runEnd = panel.indexOf("const applyAsNewLayer");
  assert.ok(runStart > 0 && runEnd > runStart);
  const runBody = panel.slice(runStart, runEnd);
  const preflightAt = runBody.indexOf("imageUpscalePreflight");
  const freezeAt = runBody.indexOf("host.freezeCanvas");
  assert.notEqual(preflightAt, -1, "run() 里必须有超分预检");
  assert.notEqual(freezeAt, -1);
  assert.ok(
    preflightAt < freezeAt,
    "预检必须在发请求之前：越界的请求根本不该发出去",
  );
  // 扩展画面同样会把图撑大，同样要本地拦。
  assert.match(panel, /function outpaintPreflightReason/);
});

test("a running capability can be canceled and reports no output", async () => {
  let observedSignal = null;
  const executor = (_id, input) =>
    new Promise((_resolve, reject) => {
      observedSignal = input.signal;
      input.signal.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    });
  const handle = startImageDirectCommand(
    executor,
    "remove-bg",
    { sourceUrl: "https://cdn.example.com/a.png" },
    {},
  );
  handle.cancel();
  const result = await handle.result;
  assert.equal(result.status, "canceled");
  assert.equal(result.outputs.length, 0);
  assert.equal(result.failure.kind, "canceled");
  assert.ok(observedSignal.aborted, "取消要真的 abort 掉底层请求");

  const panel = source(PANEL);
  assert.match(panel, /onClick=\{panel\.cancel\}/, "进度区要有取消键");
});

test("failures are told apart so the next step differs", () => {
  const cases = [
    [{ status: 402 }, "quota"],
    [{ status: 413 }, "too-large"],
    [{ status: 401 }, "auth"],
    [{ status: 503 }, "unavailable"],
    [new DOMException("Aborted", "AbortError"), "canceled"],
  ];
  for (const [thrown, expected] of cases) {
    const failure = classifyImageAiFailure(
      thrown instanceof DOMException
        ? thrown
        : Object.assign(new Error("boom"), thrown),
    );
    assert.equal(failure.kind, expected);
    assert.ok(failure.title.length > 0);
    assert.ok(failure.detail.length > 0);
  }
  // 任务书点名要分开说的三类，各自的标题不许混成一句「AI 失败了」。
  const titles = new Set(
    ["quota", "unavailable", "too-large"].map(
      (kind) =>
        classifyImageAiFailure(
          Object.assign(new Error("boom"), {
            status: { quota: 402, unavailable: 503, "too-large": 413 }[kind],
          }),
        ).title,
    ),
  );
  assert.equal(titles.size, 3, "额度不足 / 模型不可用 / 图太大 要分开说");

  const panel = source(PANEL);
  assert.match(panel, /role="alert"/, "失败态要能被读屏播报");
});

test("ImageRoute exposes the AI panel on the rail and cutout on the workspace row", () => {
  const route = source(ROUTE);
  assert.match(route, /<FabricImageAiPanel editor=\{editor\} host=\{aiHost\}/);

  const drawerAt = route.indexOf('id: "image-ai"');
  assert.notEqual(drawerAt, -1, "必须有 image-ai 这个 drawer");
  const drawerBlock = route.slice(drawerAt, drawerAt + 260);
  assert.doesNotMatch(
    drawerBlock,
    /hiddenFromRail/,
    "AI 能力是明位入口，不许藏在 rail 之外",
  );
  assert.match(drawerBlock, /icon: "ai"/);

  // 抠图在工作区行上有自己的位置（group 只有 "download" 一个值，
  // 不带 group 的动作留在工作区行）。
  const cutoutAt = route.indexOf('id: "image-cutout"');
  assert.notEqual(cutoutAt, -1, "抠图必须有编辑栏明位入口");
  const cutoutBlock = route.slice(cutoutAt, cutoutAt + 260);
  assert.match(cutoutBlock, /panelId: "image-ai"/);
  assert.match(cutoutBlock, /variant: "primary"/);
  assert.doesNotMatch(cutoutBlock, /group: "download"/);

  // 抠完之后最常见的下一步：换底色 / 换背景图。
  const panel = source(PANEL);
  assert.match(panel, /CUTOUT_BACKGROUNDS/);
  assert.match(panel, /swapBackgroundImage/);
  assert.match(panel, /证件蓝/, "证件照场景要有现成底色");
  // 带 alpha 的结果要画棋盘格，否则白底上看不出透明。
  assert.match(panel, /CHECKERBOARD/);
  assert.match(panel, /alpha: capability\.id === "remove-bg"/);
});

test("the frozen canvas never feeds a fabric project JSON to the gateway", () => {
  const route = source(ROUTE);
  // structured 的 url 是工程 JSON，不是图片；喂给 remove-bg 必然失败。
  assert.match(route, /!source\.structured/);
  assert.match(route, /imageSourceFromBytes/);
  // 网关只吃 URL 不吃字节，所以要先拿到 durable 地址。
  assert.match(route, /editor\.dirty/);
  assert.match(route, /editor\.savedUrl/);
});
