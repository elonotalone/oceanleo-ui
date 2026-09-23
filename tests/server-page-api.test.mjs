import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const api = await import(
  await compileModule("src/lib/cloud-computer-api.ts", {
    "./auth/client": dataModule(`
      export async function accessToken() { return "tok_server_page"; }
    `),
    "./auth/config": dataModule(`
      export const GATEWAY_BASE = "https://api.example.test";
    `),
  })
);

function installFetch() {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    };
  };
  return calls;
}

test("cloudComputerRequest 保留统一鉴权与请求选项", async () => {
  const calls = installFetch();
  await api.cloudComputerRequest("/v1/example", {
    method: "PATCH",
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(calls[0].url, "https://api.example.test/v1/example");
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok_server_page");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.credentials, "include");
});

test("终端记录与节点 I9 客户端使用合同路径和方法", async () => {
  const calls = installFetch();
  await api.listTerminalsWithRecords("cc /1");
  await api.openTerminalSession("cc /1", {
    cols: 100,
    rows: 30,
    title: "work",
    command: "cursor",
    kind: "cli",
    program: "cursor",
  });
  await api.readTerminalRecord("cc /1", "sid /2", {
    offset: 12,
    limit: 4096,
  });
  await api.readTerminalRecord("cc /1", "sid /2");
  await api.deleteTerminalRecord("cc /1", "sid /2");
  await api.getNodeInfo("cc /1");
  await api.upgradeNode("cc /1");

  assert.deepEqual(
    calls.map(({ url, init }) => [
      url.replace("https://api.example.test", ""),
      init.method || "GET",
    ]),
    [
      ["/v1/computers/cc%20%2F1/terminals?include_ended=1", "GET"],
      ["/v1/computers/cc%20%2F1/terminals", "POST"],
      [
        "/v1/computers/cc%20%2F1/terminals/sid%20%2F2/record?offset=12&limit=4096",
        "GET",
      ],
      ["/v1/computers/cc%20%2F1/terminals/sid%20%2F2/record", "GET"],
      ["/v1/computers/cc%20%2F1/terminals/sid%20%2F2/record", "DELETE"],
      ["/v1/computers/cc%20%2F1/node", "GET"],
      ["/v1/computers/cc%20%2F1/node/upgrade", "POST"],
    ],
  );
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    cols: 100,
    rows: 30,
    title: "work",
    command: "cursor",
    kind: "cli",
    program: "cursor",
  });
});

test("agent 设置、本地 agent 与 CLI I9 客户端覆盖全部合同端点", async () => {
  const calls = installFetch();
  await api.getAgentSettings("cc_1");
  await api.patchAgentSettings("cc_1", { confirm_dangerous: false });
  await api.getOceanleoAgent("cc_1");
  await api.installOceanleoAgent("cc_1");
  await api.uninstallOceanleoAgent("cc_1");
  await api.listCliPrograms("cc_1");
  await api.listCliSessions("cc_1", "claude code");
  await api.launchCli("cc_1", {
    program: "cursor",
    resume_id: "chat_2",
    options: { model: "auto", dangerous: false },
    cols: 120,
    rows: 40,
  });
  await api.getCliTools("cc_1");
  await api.setCliTools("cc_1", "codex", true);

  assert.deepEqual(
    calls.map(({ url, init }) => [
      url.replace("https://api.example.test", ""),
      init.method || "GET",
    ]),
    [
      ["/v1/computers/cc_1/agent-settings", "GET"],
      ["/v1/computers/cc_1/agent-settings", "PATCH"],
      ["/v1/computers/cc_1/oceanleo-agent", "GET"],
      ["/v1/computers/cc_1/oceanleo-agent/install", "POST"],
      ["/v1/computers/cc_1/oceanleo-agent", "DELETE"],
      ["/v1/computers/cc_1/cli/programs", "GET"],
      ["/v1/computers/cc_1/cli/sessions?program=claude+code", "GET"],
      ["/v1/computers/cc_1/cli/launch", "POST"],
      ["/v1/computers/cc_1/agent/cli-tools", "GET"],
      ["/v1/computers/cc_1/agent/cli-tools", "PUT"],
    ],
  );
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    confirm_dangerous: false,
  });
  assert.deepEqual(JSON.parse(calls[7].init.body), {
    program: "cursor",
    resume_id: "chat_2",
    options: { model: "auto", dangerous: false },
    cols: 120,
    rows: 40,
  });
  assert.deepEqual(JSON.parse(calls[9].init.body), {
    program: "codex",
    enabled: true,
  });
});

test("agentDialogWsUrl 只在有旧 Shell 会话时发送 session_id", () => {
  assert.equal(
    api.agentDialogWsUrl("cc /1", undefined, "tok space"),
    "wss://api.example.test/v1/computers/cc%20%2F1/agent-dialog?token=tok+space",
  );
  assert.equal(
    api.agentDialogWsUrl("cc /1", "sid /2", "tok space"),
    "wss://api.example.test/v1/computers/cc%20%2F1/agent-dialog?token=tok+space&session_id=sid+%2F2",
  );
});
