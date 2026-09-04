/**
 * W08 · 修 V3-red-4 的闸：**Umo 托管文档里，agent 的改动不许绕过审阅直接落地。**
 *
 * 这道闸盯的是一件产品上的事：用户以为「agent 要改我的文档得我点头」，
 * 那就必须真的得点头。V3 判红时的实况是 —— `review.propose` 0 次、
 * `sendReviewProposal` 0 次、`applySelectionCommand` 当场执行。
 *
 * 判据分两层，缺一层都拦不住复发：
 *   ① 行为层：直接驱动 `umo-hosted` 真实的 `ReviewStore` + 审阅路由跑完整条路，
 *      并把产出的提案喂给**宿主自己的**校验器与收件箱（不是自写的复述件）；
 *   ② 结构层：`App.vue` 里 `applySelectionCommand` 只许出现在 `applyCommand` 那个
 *      注入位上。把接线改回「收到就执行」，②当场红。
 *
 * 跑法（必须带 package.json `test` 那串 flag，`_COMMON.md` §7b⑫）：
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/rich-doc-hosted-review.test.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

// 走子模块而不是 `agent-review/index.ts`：那个桶文件会把 `AgentReviewPanel.tsx`
// 一起拖进来，测试链的 loader 不认 `.tsx`，整份文件会在加载期就死（§7b⑩）。
import { submitRawReviewProposal } from "../src/shell/agent-review/inbox.ts";
import { hostReviewSession } from "../src/shell/agent-review/session.ts";
import { EDITOR_PROTOCOL as HOST_EDITOR_PROTOCOL } from "../src/shell/editor-protocol.ts";
import { validReviewProposal } from "../src/shell/hosted-editor/index.ts";

import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";
import { HostBridge } from "/root/projects/umo-hosted/src/bridge/host-bridge.ts";
import { routeHostedSelectionCommand } from "/root/projects/umo-hosted/src/bridge/hosted-selection-wire.ts";
import { EDITOR_PROTOCOL } from "/root/projects/umo-hosted/src/bridge/protocol.ts";
import { ReviewStore } from "/root/projects/umo-hosted/src/bridge/review.ts";
import {
  describeSelectionCommand,
  handleSelectionCommand,
  mutatesDocument,
  requiresReview,
  selectionCommandOrigin,
} from "/root/projects/umo-hosted/src/bridge/selection-command-route.ts";
import { SUPPORTED_CONTROL_IDS } from "/root/projects/umo-hosted/src/umo-commands.ts";

const UMO = "/root/projects/umo-hosted";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const appVue = readFileSync(`${UMO}/src/App.vue`, "utf8");
const hostedRoute = readFileSync(
  "src/shell/advanced-routes/RichDocHostedRoute.tsx",
  "utf8",
);

const SNAPSHOT = {
  empty: false,
  text: "第一季度营收同比下滑",
  nodeType: "paragraph",
  headingLevel: 0,
  marks: { bold: false, italic: false, link: false },
};

/** 一台假编辑器：只记「执行器被调用了几次、拿到了什么」。 */
function harness(initialRevision = 0) {
  const applied = [];
  const proposals = [];
  const results = [];
  const review = new ReviewStore(initialRevision);
  const deps = {
    review,
    applyCommand: (command) => {
      applied.push(command);
      return true;
    },
    readSnapshot: () => SNAPSHOT,
    sendReviewProposal: (proposal) => proposals.push(proposal),
    sendSelectionResult: (requestId, ok, message) =>
      results.push({ requestId, ok, message }),
  };
  return { applied, proposals, results, review, deps };
}

function boldCommand(extra = {}) {
  return {
    requestId: "sel-abc123",
    selectionId: "richdoc-text",
    controlId: "bold",
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// ① 行为层
// ---------------------------------------------------------------------------

test("没盖人类来源的改动不落地：执行器 0 次、提案 1 条、revision 原地不动", () => {
  const { applied, proposals, results, review, deps } = harness(7);
  const outcome = handleSelectionCommand(boldCommand(), {}, deps);

  assert.equal(outcome, "review");
  assert.equal(applied.length, 0, "文档被改了 —— 这正是 V3-red-4 判红的那一幕");
  assert.equal(proposals.length, 1);
  assert.equal(
    review.revision,
    7,
    "接受之前 revision 不许前进（规范 §7 判据 3）",
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true);
  assert.match(results[0].message, /审阅/);
});

test("提案过得了宿主自己的校验器，也真的进得了宿主的审阅收件箱", () => {
  const { proposals, deps } = harness(0);
  handleSelectionCommand(boldCommand(), {}, deps);
  const proposal = proposals[0];

  // 用宿主那一份校验器，不是编辑器里的镜像 —— 镜像过了而宿主丢掉，
  // 等于提案永远到不了人眼前，闸就白设了。
  assert.equal(validReviewProposal(proposal), true);
  assert.equal(proposal.diff, undefined);
  assert.equal(proposal.objects.length, 1);
  assert.equal(proposal.targetSelection, null);

  const verdict = submitRawReviewProposal(proposal, {
    liveRevision: 0,
    editorId: "richdoc",
  });
  assert.equal(verdict, "ok");
  const snapshot = hostReviewSession.snapshot();
  assert.equal(snapshot.status, "open");
  assert.equal(snapshot.parked.proposal.proposalId, proposal.proposalId);
  hostReviewSession.markDiscarded();
});

test("宿主点接受之后才落地，且 revision 恰好 +1", () => {
  const { applied, proposals, review, deps } = harness(3);
  handleSelectionCommand(boldCommand(), {}, deps);
  assert.equal(applied.length, 0);

  const accepted = review.decide(proposals[0].proposalId, "accept");
  assert.equal(accepted, true);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].controlId, "bold");
  assert.equal(review.revision, 4);
});

test("宿主点拒绝：一个字都不改，revision 一个数都不动", () => {
  const { applied, proposals, review, deps } = harness(3);
  handleSelectionCommand(boldCommand(), {}, deps);

  const accepted = review.decide(proposals[0].proposalId, "reject");
  assert.equal(accepted, false);
  assert.equal(applied.length, 0);
  assert.equal(review.revision, 3);
});

test("L1 人点的按钮仍然立刻生效 —— 盖章盖在信封上或命令里都认", () => {
  const envelopeStamped = harness();
  assert.equal(
    handleSelectionCommand(boldCommand(), { origin: "user" }, envelopeStamped.deps),
    "applied",
  );
  assert.equal(envelopeStamped.applied.length, 1);
  assert.equal(envelopeStamped.proposals.length, 0);

  const commandStamped = harness();
  assert.equal(
    handleSelectionCommand(boldCommand({ origin: "l1" }), {}, commandStamped.deps),
    "applied",
  );
  assert.equal(commandStamped.applied.length, 1);
  assert.equal(commandStamped.proposals.length, 0);
});

test("认不出的章一律当 agent —— 缺章、拼错、大小写、非字符串都得送审", () => {
  for (const stamp of [
    undefined,
    null,
    "",
    "agent",
    "Agent",
    "USER",
    " user",
    "assistant",
    true,
    1,
    { origin: "user" },
  ]) {
    assert.equal(
      selectionCommandOrigin({ controlId: "bold" }, { origin: stamp }),
      "agent",
      `信封盖 ${JSON.stringify(stamp)} 被当成了人类点击`,
    );
  }
  assert.equal(selectionCommandOrigin({ controlId: "bold" }, {}), "agent");
  assert.equal(selectionCommandOrigin(null, null), "agent");
});

test("执行器不认的 controlId 当场回绝：不发提案、不落地", () => {
  const { applied, proposals, results, deps } = harness();
  const outcome = handleSelectionCommand(
    boldCommand({ controlId: "delete-everything" }),
    {},
    deps,
  );
  assert.equal(outcome, "rejected");
  assert.equal(applied.length, 0);
  assert.equal(proposals.length, 0);
  assert.equal(results[0].ok, false);
});

test("新控件默认算「会改文档」——「会改文档」这张表是反着列的（漏登记不等于放行）", () => {
  assert.equal(mutatesDocument("brand-new-control-nobody-registered"), true);
  assert.equal(
    requiresReview({ controlId: "brand-new-control-nobody-registered" }, "agent"),
    true,
  );
  for (const controlId of SUPPORTED_CONTROL_IDS) {
    assert.equal(
      requiresReview({ controlId }, "agent"),
      true,
      `${controlId} 没被算成会改文档`,
    );
  }
});

test("审阅卡片说的是人话，且 diff/objects 恰好给一个", () => {
  const parts = describeSelectionCommand(
    { requestId: "sel-1", controlId: "heading", value: 2 },
    SNAPSHOT,
  );
  assert.match(parts.summary.after, /2 级标题/);
  assert.match(parts.summary.before, /第一季度营收同比下滑/);
  assert.equal(parts.objects.length, 1);
  assert.equal(parts.objects[0].op, "update");
  assert.ok(parts.summary.before.length > 0 && parts.summary.after.length > 0);
});

test("整条收信链跑一遍：命令经真 HostBridge 进审阅，提案真的发回宿主", () => {
  const posted = [];
  const hostWindow = { postMessage: (data) => posted.push(data) };
  let listener = null;
  const target = {
    addEventListener: (_type, fn) => {
      listener = fn;
    },
    removeEventListener: () => {
      listener = null;
    },
  };
  const { applied, proposals, deps } = harness();
  const bridge = new HostBridge(target, {
    instanceId: "rd-test",
    hostOrigin: "https://oceandino.com",
    hostWindow,
    handlers: {
      onSelectionCommand: (command, envelope) =>
        handleSelectionCommand(command, envelope, {
          ...deps,
          sendReviewProposal: (proposal) => {
            proposals.push(proposal);
            bridge.sendReviewProposal(proposal);
          },
        }),
    },
  });
  bridge.start();

  const deliver = (envelopeExtras) => {
    listener({
      origin: "https://oceandino.com",
      source: hostWindow,
      data: {
        protocol: EDITOR_PROTOCOL,
        instanceId: "rd-test",
        type: "selection-command",
        command: boldCommand(),
        ...envelopeExtras,
      },
    });
  };

  deliver({});
  assert.equal(applied.length, 0, "经桥进来的 agent 命令仍然当场改了稿");
  assert.equal(proposals.length, 1);
  assert.equal(
    posted.filter((message) => message.type === "review-proposal").length,
    1,
    "提案没真的 postMessage 回宿主 —— 宿主收不到就等于没审阅",
  );

  // 章盖在信封顶层（宿主的 normalizeSelectionCommand 会剥掉 command 里的），
  // 必须一路传到路由手上，否则 L1 的人类点击会被误判成 agent。
  deliver({ origin: "user" });
  assert.equal(applied.length, 1);
  assert.equal(proposals.length, 1);
});

// ---------------------------------------------------------------------------
// ② 结构层：接线本身
// ---------------------------------------------------------------------------

function parseVueScript(source, file) {
  const match = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match, `${file} 里没有 <script setup>`);
  return ts.createSourceFile(
    file,
    match[1],
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function calleeName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    return `${calleeName(node.expression)}.${node.name.text}`;
  }
  return "";
}

function isFalseLiteral(node) {
  return Boolean(
    node &&
      (node.kind === ts.SyntaxKind.FalseKeyword ||
        (ts.isPrefixUnaryExpression(node) &&
          node.operator === ts.SyntaxKind.ExclamationToken &&
          node.operand.kind === ts.SyntaxKind.TrueKeyword)),
  );
}

function isLiveCall(node) {
  for (let cursor = node.parent; cursor; cursor = cursor.parent) {
    if (
      ts.isIfStatement(cursor) &&
      isFalseLiteral(cursor.expression)
    ) {
      return false;
    }
    if (
      ts.isBinaryExpression(cursor) &&
      cursor.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      isFalseLiteral(cursor.left)
    ) {
      return false;
    }
  }
  return true;
}

function methodNamed(sf, name) {
  let found = null;
  walk(sf, (node) => {
    if (
      (ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found = node;
    }
  });
  return found;
}

function callSites(sourceFile, name) {
  const hits = [];
  walk(sourceFile, (node) => {
    if (ts.isCallExpression(node) && calleeName(node.expression) === name) {
      hits.push(node);
    }
  });
  return hits;
}

function enclosingPropertyNames(node) {
  const names = [];
  for (let cursor = node.parent; cursor; cursor = cursor.parent) {
    if (
      (ts.isPropertyAssignment(cursor) || ts.isMethodDeclaration(cursor)) &&
      ts.isIdentifier(cursor.name)
    ) {
      names.push(cursor.name.text);
    }
  }
  return names;
}

test("App.vue 的 selection-command 接线交给审阅路由，不自己执行", () => {
  const sf = parseVueScript(appVue, "App.vue");
  const wire = callSites(sf, "routeHostedSelectionCommand");
  assert.ok(
    wire.length >= 1,
    "App.vue 没有调用 routeHostedSelectionCommand —— 审阅接线被摘掉了",
  );
  assert.ok(
    wire.every(isLiveCall),
    "routeHostedSelectionCommand 被 if (false) / false && 包死了，标识符还在但用户文档会被先落地",
  );
  const handler = methodNamed(sf, "onSelectionCommand");
  assert.ok(handler, "找不到 onSelectionCommand");
  const aliases = [];
  walk(handler, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === "applySelectionCommand" &&
      ts.isIdentifier(node.name)
    ) {
      aliases.push(node.name.text);
    }
  });
  assert.equal(
    aliases.length,
    0,
    `onSelectionCommand 把 applySelectionCommand 别名成 ${aliases.join(",")} 再先落地 —— V6 那一刀`,
  );
});

test("App.vue 里 applySelectionCommand 只许挂在 applyCommand 注入位上", () => {
  const sf = parseVueScript(appVue, "App.vue");
  const hits = callSites(sf, "applySelectionCommand");
  assert.ok(hits.length >= 1, "执行器不见了，人点的按钮也会失效");
  for (const hit of hits) {
    const names = enclosingPropertyNames(hit);
    assert.ok(
      names.includes("applyCommand"),
      `applySelectionCommand 出现在 ${
        names.join(" < ") || "顶层"
      } —— 收到指令就直接改稿，正是 V3-red-4`,
    );
    assert.ok(
      !names.includes("onSelectionCommand") ||
        names.indexOf("applyCommand") < names.indexOf("onSelectionCommand"),
      "onSelectionCommand 里直接执行了命令",
    );
  }
});

test("执行器认的 controlId 与 SUPPORTED_CONTROL_IDS 逐字相等（两处闭集不许漂）", () => {
  const source = readFileSync(`${UMO}/src/umo-commands.ts`, "utf8");
  const sf = ts.createSourceFile(
    "umo-commands.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const cases = [];
  walk(sf, (node) => {
    if (
      ts.isCaseClause(node) &&
      ts.isStringLiteral(node.expression) &&
      ts.isSwitchStatement(node.parent.parent)
    ) {
      cases.push(node.expression.text);
    }
  });
  assert.ok(cases.length > 0, "AST 没找到任何 case —— 先怀疑判据本身（§6）");
  assert.deepEqual([...SUPPORTED_CONTROL_IDS].sort(), [...new Set(cases)].sort());
});

test("宿主 RichDocHostedRoute 真的收提案、并把人的裁决回给编辑器", () => {
  const sf = ts.createSourceFile(
    "RichDocHostedRoute.tsx",
    hostedRoute,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const literals = [];
  walk(sf, (node) => {
    if (ts.isStringLiteral(node)) literals.push(node.text);
  });
  assert.ok(
    literals.includes("review-proposal"),
    "宿主没有 review-proposal 分支：编辑器发了也会被丢掉",
  );
  assert.ok(
    literals.includes("review-decision"),
    "宿主不回 review-decision：用户点了接受也没反应",
  );
  assert.ok(
    literals.includes("oceanleo-review-decision"),
    "宿主没听审阅面板的裁决事件",
  );
  const ingest = callSites(sf, "ingestRichDocReviewProposal");
  assert.ok(
    ingest.length >= 1,
    "提案没交给 ingestRichDocReviewProposal，等于收下就扔",
  );
  assert.ok(
    ingest.every(isLiveCall),
    "ingestRichDocReviewProposal 被 if (false) / false && 包死，收件箱不会进提案",
  );
});

test("routeHostedSelectionCommand 就是审阅路由，不许先落地", () => {
  const { applied, proposals, review, deps } = harness(2);
  const outcome = routeHostedSelectionCommand(boldCommand(), {}, deps);
  assert.equal(outcome, "review");
  assert.equal(applied.length, 0, "接线层先落地了 —— App.vue 那刀的产品面");
  assert.equal(proposals.length, 1);
  assert.equal(review.revision, 2);
});

function sampleProposal(revision = 0) {
  return {
    proposalId: "prop-gate-1",
    commandId: "bold",
    revision,
    summary: { before: "第一季度", after: "第一季度（加粗）" },
    objects: [
      {
        id: "bold:sel-abc123",
        op: "update",
        label: "加粗",
        before: "paragraph",
        after: "对当前选区应用「加粗」",
      },
    ],
    targetSelection: null,
  };
}

const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
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

const HOST_PAGE = "https://oceanleo.com/workspace";
const reviewDom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: HOST_PAGE,
});
const reviewWindow = reviewDom.window;
for (const [name, value] of Object.entries({
  window: reviewWindow,
  document: reviewWindow.document,
  navigator: reviewWindow.navigator,
  HTMLElement: reviewWindow.HTMLElement,
  HTMLIFrameElement: reviewWindow.HTMLIFrameElement,
  Element: reviewWindow.Element,
  Node: reviewWindow.Node,
  Event: reviewWindow.Event,
  CustomEvent: reviewWindow.CustomEvent,
  MessageEvent: reviewWindow.MessageEvent,
  localStorage: reviewWindow.localStorage,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fetch = async () => {
  throw new Error("RichDocHostedRoute 首屏不该发网络请求");
};

const reviewShellUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    return jsxs("div", {
      "data-role": "richdoc-review-shell",
      children: [adapter && adapter.stage ? adapter.stage : null],
    });
  }
`);
const reviewRoutesUrl = dataModule(`
  export function editorToolLabel() { return "文档"; }
`);

let reviewHostedModule;
async function loadReviewHostedRoute() {
  if (!reviewHostedModule) {
    const compiled = await compileModule(
      "src/shell/advanced-routes/RichDocHostedRoute.tsx",
      {
        "../AdvancedWorkbenchShell": reviewShellUrl,
        "../workbench-routes": reviewRoutesUrl,
        "../agent-review": realModule("src/shell/agent-review/inbox.ts"),
      },
    );
    reviewHostedModule = await import(compiled);
  }
  return reviewHostedModule;
}

test("ingestRichDocReviewProposal 真的把提案推进宿主收件箱", async () => {
  hostReviewSession.markDiscarded();
  const { ingestRichDocReviewProposal } = await loadReviewHostedRoute();
  const verdict = ingestRichDocReviewProposal(sampleProposal(0), {
    liveRevision: 0,
    editorId: "richdoc",
  });
  assert.equal(verdict, "ok", "ingest 没把提案交进去（提前 return / 恒 ok）");
  const snapshot = hostReviewSession.snapshot();
  assert.equal(snapshot.status, "open");
  assert.equal(snapshot.parked.proposal.proposalId, "prop-gate-1");
  hostReviewSession.markDiscarded();
});

test("jsdom 把 review-proposal 丢进真路由后，宿主收件箱有一条", async () => {
  hostReviewSession.markDiscarded();
  const { RichDocHostedRoute } = await loadReviewHostedRoute();
  const { createRoot } = await import("react-dom/client");
  const container = reviewWindow.document.createElement("div");
  reviewWindow.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(RichDocHostedRoute, {
        item: {
          key: "rd-review-gate",
          source: "artifact",
          id: "rd-review-gate",
          title: "审阅闸",
          kind: "document",
          siteId: "website",
          favorite: false,
          meta: {},
        },
        onClose() {},
      }),
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  try {
    const iframe = container.querySelector("iframe");
    assert.ok(iframe, "宿主路由没挂 iframe，postMessage 无从投递");
    const src = iframe.getAttribute("src") || "";
    const instanceId = new URL(src).searchParams.get("instance");
    assert.ok(instanceId, "iframe src 没有 instance，收信闸会丢掉提案");
    const event = new reviewWindow.MessageEvent("message", {
      data: {
        protocol: HOST_EDITOR_PROTOCOL,
        type: "review-proposal",
        instanceId,
        proposal: sampleProposal(0),
      },
      origin: "https://docs.oceanleo.app",
      source: iframe.contentWindow,
    });
    await act(async () => {
      reviewWindow.dispatchEvent(event);
    });
    const snapshot = hostReviewSession.snapshot();
    assert.equal(
      snapshot.status,
      "open",
      `review-proposal 分支提前 return 或 submit 恒 ok：收件箱 status=${snapshot.status}`,
    );
    assert.equal(snapshot.parked?.proposal?.proposalId, "prop-gate-1");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    hostReviewSession.markDiscarded();
  }
});
