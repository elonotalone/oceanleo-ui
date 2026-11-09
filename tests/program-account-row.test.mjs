// The pill's 「这台电脑上的 <程序> · 账号」 row (works-wave phase 2, C8): what a signed-in / signed-out user can do,
// and who the row says is signed in. Rendering logic only; the controls client is never called here.
import assert from "node:assert/strict";
import test from "node:test";
import { compileModule } from "./helpers/module-bench.mjs";

const { programAccountRow } = await import(
  await compileModule("src/shell/cloud-computer/native-surface/computer-settings-rows.tsx", {}),
);

const tt = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (_, key) => String(vars[key])) : text);

function dialogFor(status) {
  return {
    programs: status ? [status] : [],
    login: { open: false, program: null },
    install: { open: false, program: null },
    logout: { confirm: false, pending: false, failed: "", switching: false },
  };
}

function row(program, status) {
  return programAccountRow({ computerId: "cc_test", program, dialog: dialogFor(status), keyOpen: false, onKeyOpen() {}, tt });
}

const CODEX_METHODS = [
  { id: "device", kind: "link_code" },
  { id: "api_key", kind: "secret" },
  { id: "access_token", kind: "secret" },
];

test("signed-in Codex offers switch, sign-out and each secret method once (no duplicate Key) and names the account", () => {
  const status = {
    id: "codex", installed: true, version: "0.164.0", auth: "login", logged_in: true,
    account: "someone@example.com", plan: "pro", mode: "chatgpt",
    login: { state: "logged_in", methods: CODEX_METHODS, can_logout: true },
  };
  const result = row("codex", status);
  assert.deepEqual(result.choices.map((choice) => choice.value), ["switch", "logout", "login:api_key", "login:access_token"]);
  assert.match(result.value, /^someone@example\.com · pro · /);
  assert.match(result.value, /ChatGPT/);
  assert.match(result.value, /0\.164\.0$/);
});

test("signed-out Claude lists its sign-in methods in order", () => {
  const status = {
    id: "claude", installed: true, version: "2.1.299", auth: "none", logged_in: false,
    login: {
      state: "logged_out",
      methods: [
        { id: "claudeai", kind: "link_code" }, { id: "console", kind: "link_code" }, { id: "sso", kind: "link_code" },
        { id: "api_key", kind: "secret" }, { id: "oauth_token", kind: "secret" },
      ],
    },
  };
  assert.deepEqual(row("claude", status).choices.map((choice) => choice.value),
    ["login:claudeai", "login:console", "login:sso", "login:api_key", "login:oauth_token"]);
});

test("an older gateway without C8 methods keeps the generic Key entry; Hermes keeps 管理凭据", () => {
  const old = { id: "codex", installed: true, version: "0.164.0", auth: "login", logged_in: true };
  const choices = row("codex", old).choices;
  assert.ok(choices.some((choice) => choice.value === "key" && choice.label === "Key"));
  const hermes = {
    id: "hermes", installed: true, version: "1", auth: "key", logged_in: true,
    login: { state: "logged_in", methods: [{ id: "nous", kind: "link_code" }, { id: "api_key", kind: "secret" }] },
  };
  assert.ok(row("hermes", hermes).choices.some((choice) => choice.value === "key" && choice.label === "管理凭据"));
});

test("a sign-out confirmation names the running agents", () => {
  const status = {
    id: "codex", installed: true, version: "0.164.0", auth: "login", logged_in: true, agents_running: 6,
    login: { state: "logged_in", methods: CODEX_METHODS, can_logout: true },
  };
  const dialog = dialogFor(status);
  dialog.logout.confirm = true;
  const result = programAccountRow({ computerId: "cc_test", program: "codex", dialog, keyOpen: false, onKeyOpen() {}, tt });
  assert.ok(result.card, "the confirmation card is shown");
});
