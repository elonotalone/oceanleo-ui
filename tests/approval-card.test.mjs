import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_KEYS = [
  "允许这一次",
  "这个任务里都允许",
  "以后都允许",
  "拒绝",
  "已允许",
  "已拒绝",
  "已处理",
  "已过期",
  "查看详情",
  "收起详情",
  "需要你确认",
  "没能提交，请重试",
  "已确认，请继续刚才的操作",
  "以后「{app}」执行这个动作时不再询问",
];

const { LOCALES } = await import("../src/i18n/config.ts");
const { APPROVAL_CARD_MESSAGES } = await import(
  "../src/i18n/ui/messages/approval-card-copy.ts"
);
const { SHELL_OVERHAUL_MESSAGES } = await import(
  "../src/i18n/ui/messages/shell-overhaul-copy.ts"
);

const {
  parseApprovalMessage,
  getApproval,
  decideApproval,
  listPendingApprovals,
} = await import(
  await compileModule("src/api/approvals.ts", {
    "../lib/auth/client": dataModule(`
      export async function accessToken() { return "tok_test"; }
    `),
    "../lib/auth/config": dataModule(`
      export const GATEWAY_BASE = "https://api.example.test";
    `),
  })
);

const {
  nextCardState,
  resultCopyKey,
  shouldContinueAfterApprove,
} = await import(
  await compileModule("src/shell/ApprovalCard.tsx", {
    "../i18n/ui/useUI": dataModule(`
      export function useUI() {
        return (value, vars) => String(value).replace(
          /\\{(\\w+)\\}/g,
          (_, key) => String(vars?.[key] ?? "{" + key + "}"),
        );
      }
    `),
  })
);

function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(url, init, calls);
  };
  return calls;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const validPayload = {
  approval_id: "appr-1",
  connector_id: "gmail",
  connector_label: "Gmail",
  tool: "send_email",
  summary: "用 Gmail 发送邮件给 a@b.com",
  args_preview: "to: a@b.com\nsubject: hello",
};

test("parseApprovalMessage：合法 JSON 抽出卡片字段", () => {
  const parsed = parseApprovalMessage(JSON.stringify(validPayload));
  assert.deepEqual(parsed, validPayload);
});

test("parseApprovalMessage：坏 JSON / 缺 id / 字段类型错 → null", () => {
  assert.equal(parseApprovalMessage("{not-json"), null);
  assert.equal(parseApprovalMessage(JSON.stringify({ ...validPayload, approval_id: "" })), null);
  const missingId = { ...validPayload };
  delete missingId.approval_id;
  assert.equal(parseApprovalMessage(JSON.stringify(missingId)), null);
  assert.equal(
    parseApprovalMessage(JSON.stringify({ ...validPayload, approval_id: 12 })),
    null,
  );
  assert.equal(
    parseApprovalMessage(JSON.stringify({ ...validPayload, summary: ["x"] })),
    null,
  );
  assert.equal(
    parseApprovalMessage(JSON.stringify({ ...validPayload, args_preview: 3 })),
    null,
  );
});

// UC-NONE
// 理由：这是请求形状的功能测试，不对应隔离矩阵里的任何一条。出现 Bearer 只是因为客户端带登录令牌；
// 令牌只发往 GATEWAY_BASE（第一方网关），本用例断言的正是这个地址。
test("getApproval / listPendingApprovals / decideApproval 的路径、方法、body", async () => {
  const record = {
    id: "appr-1",
    task_id: "task-1",
    connector_id: "gmail",
    connector_label: "Gmail",
    tool: "send_email",
    summary: "用 Gmail 发送邮件给 a@b.com",
    args_preview: "to: a@b.com",
    status: "pending",
    scope: null,
    created_at: "2026-10-10T00:00:00Z",
    decided_at: null,
  };
  const calls = installFetch((url) => {
    const path = String(url);
    if (path.endsWith("/decide")) return jsonResponse(200, { approval: { ...record, status: "approved" } });
    if (path.includes("status=pending")) return jsonResponse(200, { items: [record] });
    return jsonResponse(200, { approval: record });
  });

  const got = await getApproval("appr-1");
  assert.equal(got.ok, true);
  assert.equal(got.data.id, "appr-1");
  assert.equal(calls[0].url, "https://api.example.test/v1/agent/approvals/appr-1");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok_test");

  const listed = await listPendingApprovals("task-1");
  assert.equal(listed.ok, true);
  assert.equal(listed.data.length, 1);
  assert.equal(
    calls[1].url,
    "https://api.example.test/v1/agent/approvals?task_id=task-1&status=pending",
  );

  const decided = await decideApproval("appr-1", "approve", "once");
  assert.equal(decided.ok, true);
  assert.equal(calls[2].url, "https://api.example.test/v1/agent/approvals/appr-1/decide");
  assert.equal(calls[2].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    decision: "approve",
    scope: "once",
  });
});

test("decideApproval 409 时带回 status，deny 可省略 scope", async () => {
  const calls = installFetch(() => jsonResponse(409, { detail: "already decided" }));
  const conflict = await decideApproval("appr-1", "deny");
  assert.equal(conflict.ok, false);
  assert.equal(conflict.status, 409);
  assert.deepEqual(JSON.parse(calls[0].init.body), { decision: "deny" });
});

test("ApprovalCard.tsx 不含 dangerouslySetInnerHTML / innerHTML", () => {
  // UC-4：用户可控的 args_preview / summary 只能进文本节点。
  // 见 docs/architecture/oceanleo-untrusted-content-isolation.md
  const source = readFileSync(join(REPO, "src/shell/ApprovalCard.tsx"), "utf8");
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML/);
});

test("AgentTranscriptBubble.tsx 有 kind === \"approval\" 分支", () => {
  const source = readFileSync(join(REPO, "src/shell/AgentTranscriptBubble.tsx"), "utf8");
  assert.match(source, /kind === "approval"/);
});

test("APPROVAL_CARD_MESSAGES 17 语都有每条原文的非空译文", () => {
  assert.equal(LOCALES.length, 17);
  for (const locale of LOCALES) {
    const dict = APPROVAL_CARD_MESSAGES[locale];
    assert.ok(dict, `missing locale ${locale}`);
    for (const key of SOURCE_KEYS) {
      assert.equal(typeof dict[key], "string", `${locale} missing ${key}`);
      assert.ok(dict[key].trim().length > 0, `${locale} empty ${key}`);
    }
  }
});

test("SHELL_OVERHAUL_MESSAGES.en 能查到「允许这一次」的英文", () => {
  const english = SHELL_OVERHAUL_MESSAGES.en["允许这一次"];
  assert.equal(typeof english, "string");
  assert.ok(english.trim().length > 0);
  assert.notEqual(english, "允许这一次");
});

test("nextCardState：pending → 允许 → 结果态", () => {
  let state = {
    remoteStatus: "pending",
    decidedHere: false,
    submitting: false,
    error: "",
  };
  state = nextCardState(state, { type: "submit" });
  assert.equal(state.submitting, true);
  state = nextCardState(state, { type: "succeed", decision: "approve", status: "approved" });
  assert.equal(state.submitting, false);
  assert.equal(state.decidedHere, true);
  assert.equal(state.remoteStatus, "approved");
  assert.equal(resultCopyKey(state), "已允许");
});

test("nextCardState：409 后刷新为服务端状态", () => {
  let state = {
    remoteStatus: "pending",
    decidedHere: false,
    submitting: true,
    error: "",
  };
  state = nextCardState(state, { type: "conflict", status: "denied" });
  assert.equal(state.submitting, false);
  assert.equal(state.decidedHere, false);
  assert.equal(state.remoteStatus, "denied");
  assert.equal(resultCopyKey(state), "已处理");
});

test("任务已停时允许会继续，任务在跑时不继续", () => {
  const approved = { type: "succeed", decision: "approve", status: "approved" };
  assert.equal(shouldContinueAfterApprove(false, approved), true);
  assert.equal(shouldContinueAfterApprove(true, approved), false);
  assert.equal(
    shouldContinueAfterApprove(false, { type: "succeed", decision: "deny" }),
    false,
  );
});
