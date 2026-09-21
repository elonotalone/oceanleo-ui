import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

const { CloudComputerError, listComputers, createAliyunComputer, createByoComputer, getCatalog, getComputer, renameComputer, stopComputer, startComputer, deleteComputer, listComputerEvents, regenerateInstallCommand, confirmComputer, listTerminals, openTerminal, closeTerminal, getUsage, getUsageSummary, terminalWsUrl, nodeWsUrl, nodeInstallScriptUrl, nodeDownloadUrl, nodeSha256SumsUrl, getNodeInstallScript, isMountable, COMPUTER_STATUS_LABEL } =
  await import(
    await compileModule("src/lib/cloud-computer-api.ts", {
      "./auth/client": dataModule(`
        export async function accessToken() { return "tok_test"; }
      `),
      "./auth/config": dataModule(`
        export const GATEWAY_BASE = "https://api.example.test";
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

test("listComputers 打 GET /v1/computers 并带 Bearer", async () => {
  const calls = installFetch(() =>
    jsonResponse(200, { items: [{ id: "cc_1", name: "a", node_online: false }] }),
  );
  const data = await listComputers();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example.test/v1/computers");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok_test");
  assert.equal(data.items[0].id, "cc_1");
});

test("createAliyunComputer 请求体是 name/tier_id/disk_gb", async () => {
  const calls = installFetch(() => jsonResponse(200, { id: "cc_2", name: "sg" }));
  await createAliyunComputer({ name: "sg", tier_id: "ecs.e-c1m2.large", disk_gb: 40 });
  assert.match(calls[0].url, /\/v1\/computers\/aliyun$/);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    name: "sg",
    tier_id: "ecs.e-c1m2.large",
    disk_gb: 40,
  });
});

test("createByoComputer / catalog / 详情 / 改名 / 停机开机 / 删除 / 事件 / enroll / 终端 / 用量", async () => {
  const calls = installFetch((url) => {
    if (String(url).endsWith("/byo")) {
      return jsonResponse(200, {
        computer: { id: "cc_byo" },
        install_command: "curl x | sudo bash",
        enroll_expires_at: "2026-09-21T00:00:00Z",
      });
    }
    if (String(url).endsWith("/catalog")) return jsonResponse(200, { regions: [], tiers: [] });
    if (String(url).includes("/events")) return jsonResponse(200, { items: [] });
    if (String(url).includes("/install-command")) {
      return jsonResponse(200, { install_command: "curl y", enroll_expires_at: "t" });
    }
    if (String(url).endsWith("/confirm")) {
      return jsonResponse(200, { id: "cc_1", status: "active", confirmed_at: "t" });
    }
    if (String(url).includes("/terminals/") && String(url).includes("sid1")) {
      return jsonResponse(200, { ok: true });
    }
    if (String(url).endsWith("/terminals")) {
      return jsonResponse(200, { sessions: [] , id: "sid1" });
    }
    if (String(url).includes("/usage/summary")) return jsonResponse(200, { total: { amount_minor: 0, currency: "USD" } });
    if (String(url).includes("/usage")) {
      return jsonResponse(200, { items: [], total: { amount_minor: 0, currency: "USD" }, hourly_now: { amount_minor: 0, currency: "USD" } });
    }
    return jsonResponse(200, { id: "cc_1", name: "n" });
  });
  await createByoComputer({ name: "home" });
  await getCatalog();
  await getComputer("cc_1");
  await renameComputer("cc_1", "new");
  await stopComputer("cc_1");
  await startComputer("cc_1");
  await deleteComputer("cc_1");
  await listComputerEvents("cc_1", 20);
  await regenerateInstallCommand("cc_1");
  await confirmComputer("cc_1");
  await listTerminals("cc_1");
  await openTerminal("cc_1", { cols: 80, rows: 24 });
  await closeTerminal("cc_1", "sid1");
  await getUsage("cc_1", 7);
  await getUsageSummary();
  const urls = calls.map((call) => call.url);
  assert.ok(urls.some((url) => url.endsWith("/v1/computers/byo")));
  assert.ok(urls.some((url) => url.endsWith("/v1/computers/catalog")));
  assert.ok(urls.some((url) => url.endsWith("/v1/computers/cc_1")));
  assert.ok(urls.some((url) => url.endsWith("/v1/computers/cc_1/stop")));
  assert.ok(urls.some((url) => url.endsWith("/v1/computers/cc_1/start")));
  assert.ok(urls.some((url) => url.includes("/v1/computers/cc_1/events?limit=20")));
  assert.ok(urls.some((url) => url.endsWith("/v1/computers/cc_1/install-command")));
  assert.ok(urls.some((url) => url.endsWith("/v1/computers/cc_1/confirm")));
  assert.ok(urls.some((url) => url.endsWith("/v1/computers/cc_1/terminals")));
  assert.ok(urls.some((url) => url.endsWith("/v1/computers/cc_1/terminals/sid1")));
  assert.ok(urls.some((url) => url.includes("/v1/computers/cc_1/usage?days=7")));
  assert.ok(urls.some((url) => url.endsWith("/v1/computers/usage/summary")));
  const patch = calls.find((call) => call.init.method === "PATCH");
  assert.deepEqual(JSON.parse(patch.init.body), { name: "new" });
});

test("错误从 detail.code 映射为 CloudComputerError", async () => {
  installFetch(() =>
    jsonResponse(409, {
      detail: { code: "insufficient_balance", message: "need 1200 minor" },
    }),
  );
  await assert.rejects(
    () => createAliyunComputer({ name: "x", tier_id: "t", disk_gb: 40 }),
    (err) => {
      assert.ok(err instanceof CloudComputerError);
      assert.equal(err.code, "insufficient_balance");
      assert.equal(err.message, "need 1200 minor");
      assert.equal(err.status, 409);
      return true;
    },
  );
});

test("未登录映射 client_unauthorized", async () => {
  const { listComputers: listWithoutToken, CloudComputerError: NoAuthError } =
    await import(
      await compileModule("src/lib/cloud-computer-api.ts", {
        "./auth/client": dataModule(`
          export async function accessToken() { return ""; }
        `),
        "./auth/config": dataModule(`
          export const GATEWAY_BASE = "https://api.example.test";
        `),
      })
    );
  await assert.rejects(
    () => listWithoutToken(),
    (err) => {
      assert.ok(err instanceof NoAuthError);
      assert.equal(err.code, "client_unauthorized");
      assert.equal(err.status, 401);
      return true;
    },
  );
});

test("断网映射 client_network_error", async () => {
  installFetch(() => {
    throw new Error("offline");
  });
  await assert.rejects(
    () => listComputers(),
    (err) => {
      assert.ok(err instanceof CloudComputerError);
      assert.equal(err.code, "client_network_error");
      assert.equal(err.status, 0);
      return true;
    },
  );
});

test("无 detail.code 时映射 client_http_status", async () => {
  installFetch(() => jsonResponse(502, { oops: true }));
  await assert.rejects(
    () => listComputers(),
    (err) => {
      assert.ok(err instanceof CloudComputerError);
      assert.equal(err.code, "client_http_502");
      assert.equal(err.status, 502);
      return true;
    },
  );
});

test("terminalWsUrl 拼 wss 路径与 session_id/token 查询串", () => {
  const url = terminalWsUrl("cc_ab", "sid-9", "tok space");
  assert.equal(
    url,
    "wss://api.example.test/v1/computers/cc_ab/terminal?session_id=sid-9&token=tok+space",
  );
});

test("节点安装与下载 URL 不含 token 查询串", () => {
  assert.equal(
    nodeInstallScriptUrl(),
    "https://api.example.test/v1/computers/node/install.sh",
  );
  assert.equal(
    nodeDownloadUrl("linux", "amd64"),
    "https://api.example.test/v1/computers/node/download/linux-amd64",
  );
  assert.equal(
    nodeSha256SumsUrl(),
    "https://api.example.test/v1/computers/node/download/SHA256SUMS",
  );
  assert.equal(nodeWsUrl(), "wss://api.example.test/v1/computers/node/ws");
});

test("getNodeInstallScript 走无参数 install.sh", async () => {
  const calls = installFetch(() => jsonResponse(200, "#!/bin/bash"));
  await getNodeInstallScript();
  assert.equal(
    calls[0].url,
    "https://api.example.test/v1/computers/node/install.sh",
  );
});

test("新字段从 listComputers 透传", async () => {
  installFetch(() =>
    jsonResponse(200, {
      items: [
        {
          id: "cc_1",
          node_fingerprint: "SHA256:abcd",
          node_kernel: "6.8.0",
          node_cpus: 4,
          node_mem_bytes: 8589934592,
          node_run_as: "oceanleo",
          node_public_ip: "203.0.113.9",
          enrolled_at: "t-enroll",
          confirmed_at: "t-confirm",
          host_cert_expires_at: "t-cert",
        },
      ],
    }),
  );
  const data = await listComputers();
  const row = data.items[0];
  assert.equal(row.node_fingerprint, "SHA256:abcd");
  assert.equal(row.node_kernel, "6.8.0");
  assert.equal(row.node_cpus, 4);
  assert.equal(row.node_mem_bytes, 8589934592);
  assert.equal(row.node_run_as, "oceanleo");
  assert.equal(row.node_public_ip, "203.0.113.9");
  assert.equal(row.enrolled_at, "t-enroll");
  assert.equal(row.confirmed_at, "t-confirm");
  assert.equal(row.host_cert_expires_at, "t-cert");
});

test("regenerateInstallCommand / confirmComputer 的路径与方法", async () => {
  const calls = installFetch((url) => {
    if (String(url).includes("/install-command")) {
      return jsonResponse(200, {
        install_command: "curl -fsSL https://gw/v1/computers/node/install.sh | sudo bash -s -- --code cce_1",
        enroll_expires_at: "2026-09-21T00:15:00Z",
      });
    }
    return jsonResponse(200, { id: "cc_1", status: "active", confirmed_at: "now" });
  });
  await regenerateInstallCommand("cc_9");
  await confirmComputer("cc_9");
  assert.equal(calls[0].url, "https://api.example.test/v1/computers/cc_9/install-command");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[1].url, "https://api.example.test/v1/computers/cc_9/confirm");
  assert.equal(calls[1].init.method, "POST");
});

test("isMountable 四种组合", () => {
  assert.equal(
    isMountable({ status: "active", confirmed_at: "t", node_online: true }),
    true,
  );
  assert.equal(
    isMountable({ status: "running", confirmed_at: "t", node_online: true }),
    true,
  );
  assert.equal(
    isMountable({ status: "enrolled", confirmed_at: "t", node_online: true }),
    false,
  );
  assert.equal(
    isMountable({ status: "running", confirmed_at: null, node_online: true }),
    false,
  );
  assert.equal(COMPUTER_STATUS_LABEL.pending, "等待安装");
  assert.equal(COMPUTER_STATUS_LABEL.enrolled, "待确认");
  assert.equal(COMPUTER_STATUS_LABEL.active, "已接入");
  assert.equal(COMPUTER_STATUS_LABEL.removed, "已移除");
});

test("openTerminal 把 as_task 放进 POST body 并读回 task_id", async () => {
  const calls = installFetch(() =>
    jsonResponse(200, { id: "sid_9", task_id: "task-shell-1", alive: true }),
  );
  const opened = await openTerminal("cc_1", { cols: 80, rows: 24, as_task: true });
  assert.equal(opened.task_id, "task-shell-1");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    cols: 80,
    rows: 24,
    as_task: true,
  });
});

void pathToFileURL;
void require;
