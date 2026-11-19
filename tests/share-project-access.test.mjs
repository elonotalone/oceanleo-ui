import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const clientUrl = await compileModule("src/shell/access/project-access-client.ts", {
  "../../lib/auth/client": dataModule("export async function accessToken(){ return 'token'; }"),
  "../../lib/auth/config": dataModule("export function gatewayBase(){ return 'https://api.example.test'; }"),
});
const { createProjectAccessClient, ProjectAccessError, projectMembersFromResponse } = await import(clientUrl);
const { createMockProjectAccessClient: fakeClient, ownerProjectAccess: ownerAccess } = await import(
  await compileModule("tests/helpers/project-access-mock.ts"),
);
const ui = await import(await compileModule("src/shell/access/ProjectAccessPanel.tsx", {
  "../../i18n/ui/useUI": dataModule("export function useUI(){ return value => value; }"),
  "./project-access-client": clientUrl,
  "../menu-select": dataModule(`import React from ${JSON.stringify(await import.meta.resolve("react"))};
    export function MenuSelect({name,ariaLabel,value,options,onChange,disabled}) {
      return React.createElement('select', {name,'aria-label':ariaLabel,value,disabled,onChange:event=>onChange(event.target.value)},
        options.map(option=>React.createElement('option',{key:option.value,value:option.value},option.label)));
    }`),
}));

test("project API preserves separate pending/accepted routes and defaults to view", async () => {
  const calls = [];
  const client = createProjectAccessClient({ tokenImpl: async () => "session", baseUrl: "https://api.example.test", fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
    return Response.json({ invite: { id: "new", contact_kind: "email", contact: "reader@example.test", role: "view", status: "pending" } });
  } });
  const row = await client.invite("project/id", " Reader@EXAMPLE.test ");
  assert.equal(row.status, "invited");
  assert.equal(row.id, "invite:new");
  assert.deepEqual(calls[0].body, { contact: "reader@example.test", role: "view" });
  await client.changeRole("project/id", "invite:pending/id", "collaborate");
  await client.changeRole("project/id", "member:user/id", "view");
  await client.remove("project/id", "invite:pending/id");
  await client.remove("project/id", "member:user/id");
  await client.accept("project/id");
  await client.decline("project/id");
  assert.deepEqual(calls.map(call => [call.url.replace("https://api.example.test", ""), call.method]), [
    ["/v1/projects/project%2Fid/invites", "POST"],
    ["/v1/projects/project%2Fid/invites/pending%2Fid", "PATCH"],
    ["/v1/projects/project%2Fid/members/user%2Fid", "PATCH"],
    ["/v1/projects/project%2Fid/invites/pending%2Fid", "DELETE"],
    ["/v1/projects/project%2Fid/members/user%2Fid", "DELETE"],
    ["/v1/projects/project%2Fid/join", "POST"],
    ["/v1/projects/project%2Fid/decline", "POST"],
  ]);
  assert.deepEqual(calls[1].body, { role: "collaborate" });
  assert.equal(calls[0].headers.Authorization, "Bearer session");
  assert.equal(calls.some(call => /notification|message/.test(call.url)), false);
});

test("project responses normalize roles without inventing contacts or including removed invites", async () => {
  const rows = projectMembersFromResponse({ members: [
    { user_id: "owner", role: "owner", display_name: "Owner" },
    { user_id: "editor", role: "edit", label: "Editor" },
    { user_id: "viewer", role: "view", label: "Viewer" },
  ], invites: [
    { id: "pending", contact: "pending@example.test", contact_kind: "email", role: "edit", status: "pending" },
    { id: "removed", contact: "removed@example.test", status: "removed" },
  ] });
  assert.deepEqual(rows.owner, { name: "Owner", initial: "O" });
  assert.deepEqual(rows.members.map(row => [row.id, row.role, row.status]), [
    ["member:editor", "collaborate", "accepted"], ["member:viewer", "view", "accepted"], ["invite:pending", "collaborate", "invited"],
  ]);
  assert.equal("email" in rows.members[0], false);
  const client = createProjectAccessClient({ tokenImpl: async () => "session", fetchImpl: async () => Response.json({ state: "member", role: "edit", invite_role: "edit", project: { id: "p", name: "Project" } }) });
  assert.equal((await client.getAccess("p")).role, "collaborate");
  assert.equal((await client.getAccess("p")).invite_role, "collaborate");
});

test("project invite recovers the pending row when the account-independent create response omits its id", async () => {
  const calls = [];
  const client = createProjectAccessClient({ tokenImpl: async () => "session", fetchImpl: async (url, init) => {
    calls.push(init.method);
    return Response.json(init.method === "POST"
      ? { ok: true, invite: { contact_kind: "email", contact: "pending@example.test", role: "collaborate", status: "pending" } }
      : { members: [], invites: [{ id: "server-id", contact_kind: "email", contact: "pending@example.test", role: "collaborate", status: "pending" }] });
  } });
  const row = await client.invite("p", "pending@example.test", "collaborate");
  assert.equal(row.id, "invite:server-id");
  assert.equal(row.role, "collaborate");
  assert.deepEqual(calls, ["POST", "GET"]);
});

test("project client requires sign-in and propagates forbidden/missing access", async () => {
  let called = false;
  const anonymous = createProjectAccessClient({ tokenImpl: async () => null, fetchImpl: async () => { called = true; return Response.json({}); } });
  await assert.rejects(anonymous.accept("p"), error => error instanceof ProjectAccessError && error.status === 401);
  assert.equal(called, false);
  const revoked = createProjectAccessClient({ tokenImpl: async () => "session", fetchImpl: async () => new Response(null, { status: 404 }) });
  await assert.rejects(revoked.getAccess("p"), error => error.status === 404);
});

async function mount(Component, props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(Component, props)); await new Promise(resolve => setTimeout(resolve, 0)); });
  return { host, async close() { await act(async () => root.unmount()); host.remove(); } };
}
async function click(host, label) {
  const button = [...host.querySelectorAll("button")].find(button => button.textContent === label);
  assert.ok(button, `missing ${label}`);
  await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
}

test("owner/admin manage project roles including admin; work roles cannot read the full member list", async () => {
  for (const role of ["owner", "admin", "collaborate", "view"]) {
    let membersRead = 0;
    const calls=[];
    const client = fakeClient({
      async getAccess() { return { ...ownerAccess, state:role==="owner"?"owner":"member", role }; },
      async getMembers() { membersRead+=1; return { owner:{name:"Unique owner",initial:"U"},members:[{id:"member:admin",name:"Admin name",role:"admin",status:"accepted"}] }; },
      async changeRole(id,memberId,nextRole) {calls.push({id,memberId,role:nextRole});},
      async remove(id,memberId) {calls.push({id,memberId,remove:true});},
    });
    const view = await mount(ui.ProjectAccessPanel, { projectId: "p", client });
    try {
      const manager=role==="owner"||role==="admin";
      assert.equal(!!view.host.querySelector('[data-project-access-panel]'),manager);
      assert.equal(membersRead,manager?1:0);
      assert.doesNotMatch(view.host.textContent,/知道链接|常规访问/);
      if(manager) {
        assert.match(view.host.textContent,/Unique owner.*Admin name/);
        const owner=view.host.querySelector('[data-member-owner]');
        assert.equal(owner.querySelector('button,select'),null);
        const select=view.host.querySelector('select[name="project-role-member:admin"]');
        assert.deepEqual([...select.options].map(option=>option.value),['admin','collaborate','view']);
        await act(async()=>{select.value='collaborate';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
        assert.deepEqual(calls,[{id:'p',memberId:'member:admin',role:'collaborate'}]);
        assert.ok(membersRead>=2);
        await act(async()=>view.host.querySelector('[data-member-id] button').click());
        assert.deepEqual(calls[1],{id:'p',memberId:'member:admin',remove:true});
      }
    } finally { await view.close(); }
  }
});

test("shared project normalisation and API keep admin separate from member", async () => {
  const rows=projectMembersFromResponse({members:[{user_id:'a',role:'admin',name:'Admin',email:'private@example.test',username:'admin-handle'}],invites:[{id:'i',role:'admin',status:'pending',user_id:'b'}]});
  assert.equal(rows.members[0].role,'admin'); assert.equal(rows.members[0].username,'admin-handle');
  assert.equal(rows.members[0].email,undefined); assert.equal(rows.members[1].role,'admin');
  const calls=[];
  const client=createProjectAccessClient({tokenImpl:async()=>"test-only",fetchImpl:async(url,init)=>{
    calls.push({url,body:init.body?JSON.parse(init.body):null});
    return Response.json(init.method==='GET'?{state:'member',role:'admin',invite_role:'admin'}:{invite:{id:'new',role:'admin',contact:'invite@example.test'}});
  }});
  const access=await client.getAccess('p'); assert.equal(access.role,'admin');assert.equal(access.invite_role,'admin');
  assert.equal((await client.invite('p','invite@example.test','admin')).role,'admin');
  await client.changeRole('p','member:a','admin'); assert.deepEqual(calls[2].body,{role:'admin'});
});

test("new project role copy exists in every locale", async () => {
  const { swPfCopy }=await import(await compileModule('src/i18n/ui/messages/sw-pf-copy.ts'));
  for(const locale of ['de','en','es','es-419','fr','it','pt-BR','pt-PT','vi','tr','zh','zh-TW','ja','ko','ar','th','hi']) {
    assert.deepEqual(Object.keys(swPfCopy(locale)),['项目管理员','项目成员','项目查看者']);
    assert.ok(Object.values(swPfCopy(locale)).every(value=>value.trim()));
  }
});

test("project invite actions accept and decline with pending and retryable error states", async () => {
  let accepted = 0;
  let declined = 0;
  let resolveAccept;
  const client = fakeClient({ accept() { return new Promise(resolve => { resolveAccept = resolve; }); }, async decline() { declined += 1; } });
  const view = await mount(ui.ProjectInvitationActions, { projectId: "p", signedIn: true, client, onSignIn() {}, onAccepted() { accepted += 1; }, onDeclined() { declined += 10; } });
  try {
    assert.doesNotMatch(view.host.textContent, /加入项目/);
    await click(view.host, "接受邀请");
    assert.equal([...view.host.querySelectorAll("button")].every(button => button.disabled), true);
    await act(async () => resolveAccept());
    assert.equal(accepted, 1);
    await click(view.host, "拒绝");
    assert.equal(declined, 11);
  } finally { await view.close(); }
  const failure = await mount(ui.ProjectInvitationActions, { projectId: "p", signedIn: true, client: fakeClient({ async decline() { throw new Error("no"); } }), onSignIn() {}, onAccepted() {} });
  try {
    await click(failure.host, "拒绝");
    assert.ok(failure.host.querySelector('[role="alert"]'));
    assert.equal([...failure.host.querySelectorAll("button")].every(button => !button.disabled), true);
  } finally { await failure.close(); }
});

test("anonymous project invitation actions ask to sign in without mutating invitations", async () => {
  let signIns = 0;
  let mutations = 0;
  const view = await mount(ui.ProjectInvitationActions, { projectId: "p", signedIn: false, client: fakeClient({ async accept() { mutations += 1; }, async decline() { mutations += 1; } }), onSignIn() { signIns += 1; }, onAccepted() {} });
  try {
    await click(view.host, "接受邀请");
    await click(view.host, "拒绝");
    assert.equal(signIns, 2);
    assert.equal(mutations, 0);
  } finally { await view.close(); }
});

test("project boundary shows invitations on the project page and never mounts configuration for invitees", async () => {
  const view = await mount(ui.ProjectAccessBoundary, {
    projectId: "p", signedIn: true, onSignIn() {},
    client: fakeClient({ async getAccess() { return { ...ownerAccess, state: "invited", role: "none", invite_role: "collaborate" }; } }),
    children: React.createElement("div", { "data-private-config": true }, "project configuration"),
  });
  try {
    assert.ok(view.host.querySelector("[data-project-invitation]"));
    assert.match(view.host.textContent, /接受邀请.*拒绝/);
    assert.equal(view.host.querySelector("[data-private-config]"), null);
  } finally { await view.close(); }
});

test("an open project unmounts configuration and clears host caches when membership is removed", async () => {
  let removed = false;
  let cacheClears = 0;
  const view = await mount(ui.ProjectAccessBoundary, {
    projectId: "p", signedIn: true, onSignIn() {}, onAccessLost() { cacheClears += 1; },
    client: fakeClient({ async getAccess() { if (removed) throw new ProjectAccessError(404); return { ...ownerAccess, state: "member", role: "collaborate" }; } }),
    children: React.createElement("div", { "data-private-config": true }, "project configuration"),
  });
  try {
    assert.ok(view.host.querySelector("[data-private-config]"));
    removed = true;
    await act(async () => { window.dispatchEvent(new window.Event("focus")); await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(view.host.querySelector("[data-private-config]"), null);
    assert.equal(cacheClears, 1);
  } finally { await view.close(); }
});

test("a collaborator role downgrade remounts project controls to refresh permissions", async () => {
  let role = "collaborate";
  let mounts = 0;
  function Configuration() {
    React.useEffect(() => { mounts += 1; }, []);
    return React.createElement("div", { "data-private-config": true });
  }
  const view = await mount(ui.ProjectAccessBoundary, {
    projectId: "p", signedIn: true, onSignIn() {},
    client: fakeClient({ async getAccess() { return { ...ownerAccess, state: "member", role }; } }),
    children: React.createElement(Configuration),
  });
  try {
    assert.equal(mounts, 1);
    role = "view";
    await act(async () => { window.dispatchEvent(new window.Event("focus")); await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(mounts, 2);
  } finally { await view.close(); }
});
