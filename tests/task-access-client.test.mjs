import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { createTaskAccessClient, TaskAccessError, taskAccessRights } = await import(await compileModule("src/shell/access/task-access-client.ts", {
  "../../lib/auth/client": dataModule("export async function accessToken(){return null;}"),
  "../../lib/auth/config": dataModule("export const GATEWAY_BASE='https://gateway.test';"),
}));
const access = {role:"owner",state:"owner",general_access:"private",can_send:true,can_manage:true,can_fork:true,owner:{name:"O",initial:"O"}};
const calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url, ...init });
  return new Response(JSON.stringify(url.endsWith("/access") ? access : url.endsWith("/members") && init.method === "GET" ? { members: [] } : url.endsWith("/fork") ? { task_id: "forked" } : {}));
};
test("task client uses contract paths and bodies; anonymous reads omit credentials header", async () => {
  calls.length = 0;
  const client = createTaskAccessClient({ base: "https://gateway.test", tokenImpl: async () => "token", fetchImpl });
  await client.getAccess("task/1"); await client.setAccess("task/1", "public_view");
  await client.members("task/1"); await client.invite("task/1", " A@EXAMPLE.COM ", "view");
  await client.changeRole("task/1", "member/1", "collaborate"); await client.remove("task/1", "member/1");
  await client.accept("task/1"); await client.decline("task/1"); await client.fork("task/1");
  assert.deepEqual(calls.map(call => [call.method, call.url.replace("https://gateway.test", "")]), [
    ["GET", "/v1/tasks/task%2F1/access"], ["PUT", "/v1/tasks/task%2F1/access"],
    ["GET", "/v1/tasks/task%2F1/members"], ["POST", "/v1/tasks/task%2F1/members"],
    ["PATCH", "/v1/tasks/task%2F1/members/member%2F1"], ["DELETE", "/v1/tasks/task%2F1/members/member%2F1"],
    ["POST", "/v1/tasks/task%2F1/members/accept"], ["POST", "/v1/tasks/task%2F1/members/decline"], ["POST", "/v1/tasks/task%2F1/fork"],
  ]);
  assert.deepEqual(JSON.parse(calls[3].body), { email: "a@example.com", role: "view" });
  assert.ok(calls.every(call => call.cache === "no-store" && call.credentials === "include"));
  const guest = createTaskAccessClient({ tokenImpl: async () => null, fetchImpl });
  await guest.getAccess("public"); assert.equal(calls.at(-1).headers.Authorization, undefined);
  await assert.rejects(guest.accept("public"), failure => failure instanceof TaskAccessError && failure.status === 401);
});
test("access state and role both constrain composer and management rights", () => {
  const yes = { can_send: true, can_manage: true };
  for (const state of ["invited", "public", "removed", "none"]) {
    assert.equal(taskAccessRights({ ...yes, state, role: "collaborate" }, "t").canSend, false);
    assert.equal(taskAccessRights({ ...yes, state, role: "owner" }, "t").canManage, false);
  }
  assert.equal(taskAccessRights({ ...yes, state: "member", role: "view" }, "t").canSend, false);
  assert.equal(taskAccessRights({ ...yes, state: "member", role: "collaborate" }, "t").canSend, true);
  assert.deepEqual(taskAccessRights(null, "t"), { canSend: false, canManage: false, canView: false });
});
