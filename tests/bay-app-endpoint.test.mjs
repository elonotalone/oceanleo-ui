// 安全矩阵：UC-1（公开网址由网关分配，只落用户内容域；界面不拼域名）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { draftFromApp, patchFromDraft } from "../src/shell/bay/apps/app-editor-model.ts";
import {
  checkHintText,
  checkOutcomeText,
  endpointForApp,
  endpointStatusLabel,
  hostSuffixFromUrl,
  parsePort,
  pickableEndpoints,
  portProblem,
  previewPublicUrl,
  slugProblem,
  statusButton,
  suffixFromEndpoints,
} from "../src/shell/bay/appendpoint/endpoint-model.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, rel), "utf8");

const NEW_FILES = [
  "src/shell/bay/appendpoint/endpoint-model.ts",
  "src/shell/bay/appendpoint/EndpointPicker.tsx",
  "src/shell/bay/appendpoint/EndpointManagePanel.tsx",
];

test("端口校验：合法与每种非法", () => {
  assert.equal(portProblem("3000"), null);
  assert.equal(parsePort("3000"), 3000);
  assert.equal(parsePort("1024"), 1024);
  assert.equal(parsePort("65535"), 65535);
  assert.equal(portProblem("1023"), "端口必须是 1024 到 65535 的整数");
  assert.equal(portProblem("65536"), "端口必须是 1024 到 65535 的整数");
  assert.equal(portProblem("abc"), "端口必须是 1024 到 65535 的整数");
  assert.equal(portProblem("3000.5"), "端口必须是 1024 到 65535 的整数");
  assert.equal(portProblem(""), "端口必须是 1024 到 65535 的整数");
  assert.equal(parsePort("80"), null);
});

test("名字校验：每种非法各一例，空名字合法", () => {
  assert.equal(slugProblem(""), null);
  assert.equal(slugProblem("shop"), null);
  assert.equal(slugProblem("ab"), "名字至少 3 位");
  assert.equal(slugProblem("a".repeat(33)), "名字不能超过 32 位");
  assert.equal(slugProblem("Shop"), "名字只能用小写字母、数字和连字符");
  assert.equal(slugProblem("ab_cd"), "名字只能用小写字母、数字和连字符");
  assert.equal(slugProblem("-abc"), "名字不能以连字符开头或结尾");
  assert.equal(slugProblem("abc-"), "名字不能以连字符开头或结尾");
  assert.equal(slugProblem("ab--cd"), "名字不能包含连续两个连字符");
});

test("从 url 取后缀再拼预览，不写死域名", () => {
  assert.equal(hostSuffixFromUrl("https://shop--live.example.test"), "--live.example.test");
  assert.equal(hostSuffixFromUrl("not-a-url"), null);
  assert.equal(previewPublicUrl("demo", "--live.example.test"), "https://demo--live.example.test");
  assert.equal(previewPublicUrl("ab", "--live.example.test"), null);
  assert.equal(
    suffixFromEndpoints([{ url: "https://alpha--live.example.test" }, { url: "https://beta--live.example.test" }]),
    "--live.example.test",
  );
});

test("检测结果与状态按钮", () => {
  assert.equal(checkOutcomeText({ ok: true, status_code: 200, error: null }), "应用回应了（HTTP 200）");
  assert.equal(checkOutcomeText({ ok: false, status_code: null, error: "云电脑不在线" }), "云电脑不在线");
  assert.match(checkHintText(), /127\.0\.0\.1/);
  assert.deepEqual(statusButton("active"), { action: "pause", label: "暂停" });
  assert.deepEqual(statusButton("off"), { action: "resume", label: "恢复" });
  assert.equal(endpointStatusLabel("active"), "开放中");
  assert.equal(endpointStatusLabel("off"), "已暂停");
});

test("可选用的公开网址：未占用，或正是当前作品", () => {
  const rows = [
    { id: "e1", app_id: null },
    { id: "e2", app_id: "app-a" },
    { id: "e3", app_id: "app-b" },
  ];
  assert.deepEqual(
    pickableEndpoints(rows).map((row) => row.id),
    ["e1"],
  );
  assert.deepEqual(
    pickableEndpoints(rows, "app-a").map((row) => row.id),
    ["e1", "e2"],
  );
  assert.equal(endpointForApp(rows, "app-b")?.id, "e3");
  assert.equal(endpointForApp(rows, "missing"), null);
});

test("computer 草稿只在换了公开网址时带 endpoint_id", () => {
  const app = {
    id: "a1",
    owner_id: "u1",
    title: "Demo",
    summary: "A short line",
    description: "Longer text",
    cover_url: null,
    category: "website",
    posted_site: "oceanleo",
    source_kind: "computer",
    hosted_site_id: null,
    endpoint_id: "e1",
    url: "https://shop--live.example.test",
    url_host: "shop--live.example.test",
    embed_mode: "link",
    embed_ok: null,
    status: "draft",
    view_count: 0,
    open_count: 0,
    published_at: null,
    updated_at: null,
    verified_at: null,
    verified: false,
    moderation_hidden: false,
    created_at: null,
    ai_answer: false,
  };
  const same = draftFromApp(app);
  assert.equal(same.endpointId, "e1");
  assert.equal("endpoint_id" in patchFromDraft(same, app), false);
  assert.deepEqual(patchFromDraft({ ...same, endpointId: "e2" }, app), { endpoint_id: "e2" });
});

test("AppEditorPane 有第三种来源，选 computer 时不渲染 AppVerifyPanel", () => {
  const editor = src("src/shell/bay/apps/AppEditorPane.tsx");
  assert.match(editor, /我的云电脑上的应用/);
  assert.match(editor, /data-bay-app-source="computer"/);
  assert.match(editor, /EndpointPicker/);
  assert.match(editor, /source_kind:\s*"computer"/);
  assert.match(editor, /endpoint_id:\s*computerPick\.id/);
  assert.match(editor, /embed_mode:\s*"link"/);
  assert.match(editor, /source_kind === "computer"/);
  assert.match(editor, /app\.source_kind === "external" \? <AppVerifyPanel/);
  assert.doesNotMatch(editor, /source_kind === "computer"[\s\S]{0,80}AppVerifyPanel/);
});

test("EndpointPicker / EndpointManagePanel 的标记与客户端函数", () => {
  const picker = src("src/shell/bay/appendpoint/EndpointPicker.tsx");
  const manage = src("src/shell/bay/appendpoint/EndpointManagePanel.tsx");
  assert.match(picker, /data-bay-endpoint-picker/);
  assert.match(picker, /listBayEndpointComputers/);
  assert.match(picker, /listMyBayAppEndpoints/);
  assert.match(picker, /createBayAppEndpoint/);
  assert.match(picker, /checkBayAppEndpoint/);
  assert.match(manage, /data-bay-endpoint-manage/);
  assert.match(manage, /getBayApp/);
  assert.match(manage, /listMyBayAppEndpoints/);
  assert.match(manage, /checkBayAppEndpoint/);
  assert.match(manage, /updateBayAppEndpoint/);
  assert.match(manage, /deleteBayAppEndpoint/);
  assert.match(manage, /data-bay-confirm="pause"/);
  assert.match(manage, /data-bay-confirm="delete"/);
  assert.doesNotMatch(picker, /\bfetch\s*\(/);
  assert.doesNotMatch(manage, /\bfetch\s*\(/);
  assert.doesNotMatch(picker, /\/v1\//);
  assert.doesNotMatch(manage, /\/v1\//);
});

test("新实现不拼域名，--live. 只留在说明文字", () => {
  for (const rel of NEW_FILES) {
    const text = src(rel);
    assert.doesNotMatch(text, /oceanleo\.app/);
    assert.doesNotMatch(text, /--live\./);
  }
  const editor = src("src/shell/bay/apps/AppEditorPane.tsx");
  assert.doesNotMatch(editor, /oceanleo\.app/);
  assert.doesNotMatch(editor, /--live\./);
  const copy = src("src/i18n/ui/messages/bay-app-endpoint-copy.ts");
  assert.doesNotMatch(copy, /--live\./);
});
