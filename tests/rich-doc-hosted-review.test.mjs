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

// 走子模块而不是 `agent-review/index.ts`：那个桶文件会把 `AgentReviewPanel.tsx`
// 一起拖进来，测试链的 loader 不认 `.tsx`，整份文件会在加载期就死（§7b⑩）。
import { submitRawReviewProposal } from "../src/shell/agent-review/inbox.ts";
import { hostReviewSession } from "../src/shell/agent-review/session.ts";
import { validReviewProposal } from "../src/shell/hosted-editor/index.ts";

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
  assert.ok(
    callSites(sf, "handleSelectionCommand").length >= 1,
    "App.vue 没有调用 handleSelectionCommand —— 审阅路由被摘掉了",
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
  assert.ok(
    callSites(sf, "submitRawReviewProposal").length >= 1,
    "提案没交给 L4 收件箱（W02-review-api.md），等于收下就扔",
  );
});
