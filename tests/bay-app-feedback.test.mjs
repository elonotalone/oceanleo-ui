// 安全矩阵：UC-4（留言是不可信文本，只按文本渲染；本文件断言没有注入点）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EMPTY_SUMMARY,
  actionErrorText,
  authorDisplayName,
  bodyProblem,
  canReplyOrResolve,
  canReportThread,
  canWriteFeedback,
  composerProblem,
  emptyListMessage,
  formatDigestWeek,
  formatThreadTime,
  inboxParams,
  isNotFound,
  kindFilterCount,
  kindLabel,
  listThreadParams,
  nextStatusAction,
  previewBody,
  replyProblem,
  sortPostsOldToNew,
  statusFilterCount,
  statusFilterLabel,
  statusLabel,
  titleProblem,
  toggleKind,
} from "../src/shell/bay/appfeedback/feedback-model.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, rel), "utf8");

const FILES = [
  "src/shell/bay/appfeedback/AppFeedback.tsx",
  "src/shell/bay/appfeedback/AppThreadPane.tsx",
  "src/shell/bay/appfeedback/FeedbackManagePanel.tsx",
  "src/shell/bay/appfeedback/MyThreadsPane.tsx",
  "src/shell/bay/appfeedback/ThreadCard.tsx",
  "src/shell/bay/appfeedback/ThreadComposer.tsx",
  "src/shell/bay/appfeedback/feedback-model.ts",
];

test("筛选 → 请求参数：全部省略 status/kind，组合时一起带上", () => {
  assert.deepEqual(listThreadParams({ status: "all", kind: "" }), {});
  assert.deepEqual(listThreadParams({ status: "open", kind: "bug", offset: 20, limit: 20 }), {
    status: "open",
    kind: "bug",
    offset: 20,
    limit: 20,
  });
  assert.deepEqual(inboxParams({ appId: "app-1", status: "all" }), { app_id: "app-1" });
  assert.deepEqual(inboxParams({ appId: "app-1", status: "open", offset: 0, limit: 20 }), {
    app_id: "app-1",
    status: "open",
    offset: 0,
    limit: 20,
  });
});

test("状态 / 类型标签与汇总数字", () => {
  assert.equal(statusFilterLabel("all"), "全部");
  assert.equal(statusFilterLabel("open"), "待回复");
  assert.equal(statusFilterLabel("answered"), "已回复");
  assert.equal(statusFilterLabel("resolved"), "已解决");
  assert.equal(statusLabel("open"), "待回复");
  assert.equal(kindLabel("bug"), "报错");
  assert.equal(kindLabel("idea"), "建议");
  assert.equal(kindLabel("question"), "提问");
  const summary = { ...EMPTY_SUMMARY, total: 9, open: 4, answered: 3, resolved: 2, bug: 5, idea: 1, question: 3 };
  assert.equal(statusFilterCount(summary, "all"), 9);
  assert.equal(statusFilterCount(summary, "open"), 4);
  assert.equal(kindFilterCount(summary, "bug"), 5);
  assert.equal(toggleKind("", "bug"), "bug");
  assert.equal(toggleKind("bug", "bug"), "");
  assert.equal(toggleKind("bug", "idea"), "idea");
});

test("表单校验与网关一致：标题 2–120、正文 5–4000、回复 1–4000", () => {
  assert.equal(titleProblem("啊"), "标题需要 2–120 个字");
  assert.equal(titleProblem("  啊  "), "标题需要 2–120 个字");
  assert.equal(titleProblem("标题"), null);
  assert.equal(titleProblem("x".repeat(121)), "标题需要 2–120 个字");
  assert.equal(bodyProblem("短"), "正文需要 5–4000 个字");
  assert.equal(bodyProblem("足够五个字"), null);
  assert.equal(bodyProblem("x".repeat(4001)), "正文需要 5–4000 个字");
  assert.equal(replyProblem(""), "回复需要 1–4000 个字");
  assert.equal(replyProblem("好"), null);
  assert.equal(replyProblem("x".repeat(4001)), "回复需要 1–4000 个字");
  assert.deepEqual(composerProblem({ title: "啊", body: "短" }), {
    title: "标题需要 2–120 个字",
    body: "正文需要 5–4000 个字",
  });
  assert.deepEqual(composerProblem({ title: "标题够了", body: "正文也够五个字" }), { title: null, body: null });
});

test("状态 → 可用按钮；正文预览两行；回复从旧到新", () => {
  assert.equal(canWriteFeedback(false, "open"), true);
  assert.equal(canWriteFeedback(true, "open"), false);
  assert.equal(canWriteFeedback(false, "off"), false);
  assert.equal(canReplyOrResolve({ viewer_is_author: true, viewer_is_owner: false }), true);
  assert.equal(canReplyOrResolve({ viewer_is_author: false, viewer_is_owner: true }), true);
  assert.equal(canReplyOrResolve({ viewer_is_author: false, viewer_is_owner: false }), false);
  assert.equal(canReportThread({ viewer_is_author: false, viewer_is_owner: false }), true);
  assert.equal(canReportThread({ viewer_is_author: true, viewer_is_owner: false }), false);
  assert.deepEqual(nextStatusAction("open"), { next: "resolved", label: "标为已解决" });
  assert.deepEqual(nextStatusAction("answered"), { next: "resolved", label: "标为已解决" });
  assert.deepEqual(nextStatusAction("resolved"), { next: "open", label: "重新打开" });
  assert.equal(previewBody("第一行\n第二行\n第三行"), "第一行\n第二行");
  assert.equal(formatThreadTime("2026-10-11T08:00:00Z"), "2026-10-11");
  assert.equal(formatThreadTime("not-a-date"), "");
  assert.equal(formatDigestWeek("2026-10-06"), "2026-10-06");
  assert.equal(emptyListMessage(false), "还没有留言");
  assert.equal(emptyListMessage(true), "没有符合筛选的留言");
  assert.equal(authorDisplayName("  "), "OceanLeo 用户");
  assert.equal(authorDisplayName("小明"), "小明");
  assert.equal(isNotFound({ status: 404 }), true);
  assert.equal(isNotFound({ status: 400 }), false);
  assert.equal(actionErrorText(new Error("网关的话"), "fallback"), "网关的话");
  const posts = [
    { id: "b", thread_id: "t", author_kind: "owner", author: { user_id: null, handle: null, display_name: "作者", avatar_url: null }, body: "后", created_at: "2026-10-11T02:00:00Z" },
    { id: "a", thread_id: "t", author_kind: "ai", author: { user_id: null, handle: null, display_name: "AI 助手", avatar_url: null }, body: "先", created_at: "2026-10-11T01:00:00Z" },
  ];
  assert.deepEqual(sortPostsOldToNew(posts).map((row) => row.id), ["a", "b"]);
});

test("四个组件的 data-bay 标记、客户端函数与 openBay 目标", () => {
  const feedback = src("src/shell/bay/appfeedback/AppFeedback.tsx");
  const thread = src("src/shell/bay/appfeedback/AppThreadPane.tsx");
  const manage = src("src/shell/bay/appfeedback/FeedbackManagePanel.tsx");
  const mine = src("src/shell/bay/appfeedback/MyThreadsPane.tsx");
  const card = src("src/shell/bay/appfeedback/ThreadCard.tsx");
  assert.match(feedback, /data-bay-app-feedback/);
  assert.match(feedback, /listBayAppThreads/);
  assert.match(feedback, /createBayAppThread/);
  assert.match(feedback, /openBay\(\{\s*kind:\s*"app-manage",\s*appId,\s*tab:\s*"feedback"\s*\}/);
  assert.match(feedback, /requireBayLogin/);
  assert.match(thread, /data-bay-pane="app-thread"/);
  assert.match(thread, /getBayAppThread/);
  assert.match(thread, /replyBayAppThread/);
  assert.match(thread, /setBayAppThreadStatus/);
  assert.match(thread, /reportBayAppThread/);
  assert.match(thread, /openBay\(\{\s*kind:\s*"app",\s*id:\s*thread\.app_id\s*\}/);
  assert.match(thread, /whitespace-pre-wrap/);
  assert.match(manage, /data-bay-manage-feedback/);
  assert.match(manage, /listBayAppFeedbackInbox/);
  assert.match(manage, /updateBayAppFeedbackSettings/);
  assert.match(manage, /getBayAppDigest/);
  assert.match(manage, /refreshBayAppDigest/);
  assert.match(mine, /data-bay-my-threads/);
  assert.match(mine, /listMyBayAppThreads/);
  assert.match(card, /openBay\(\{\s*kind:\s*"app-thread",\s*id:\s*thread\.id\s*\}/);
});

// UC-4：留言是不可信文本，只按文本渲染，不拼链接。
test("留言只当文本渲染：没有注入点、没有拼出来的链接", () => {
  for (const file of FILES) {
    const text = src(file);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/, `${file} 不得注入 HTML`);
    assert.doesNotMatch(text, /<a\s+href=\{/, `${file} 不得写 <a href={`);
    assert.doesNotMatch(text, /\.innerHTML\s*=/, `${file} 不得写 innerHTML`);
    assert.doesNotMatch(text, /<iframe/, `${file} 不得加 iframe`);
    assert.doesNotMatch(text, /\bfetch\s*\(/, `${file} 不得自己 fetch`);
    assert.doesNotMatch(text, /\/v1\//, `${file} 不得写 /v1/`);
  }
});
