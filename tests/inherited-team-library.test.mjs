import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvas = fabricRequire.resolve("canvas"), previousCanvas = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvas] = previousCanvas; else delete require.cache[canvas];
const reactUrl = pathToFileURL(require.resolve("react")).href;
const ui = dataModule('const tt=(text,vars={})=>text.replace(/\\{(\\w+)\\}/g,(m,k)=>vars[k]??m); export function useUI(){return tt;}');
const apiUrl = await compileModule("src/lib/org-api.ts", {
  "./auth/client": dataModule('export async function accessToken(){return "test-only";}'),
  "./auth/config": dataModule('export const GATEWAY_BASE="https://gateway.test";'),
});
const api = await import(apiUrl);
const { InheritedTeamLibrary, inheritedAssetHref } = await import(await compileModule("src/shell/InheritedTeamLibrary.tsx", {
  "../lib/org-api": apiUrl,
  "../i18n/ui/useUI": ui,
  "./collection-chrome": dataModule('export const COLLECTION_ACTION_BTN_GHOST="shared-neutral-button";'),
  "./artifact-client": dataModule('export const getCurrentArtifactItem=(...args)=>globalThis.__bdArtifact(...args);'),
  "./library-viewers": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function LibraryItemViewer({item}){return React.createElement('div',{'data-reference-preview':true},item.title);}`),
}));
const { OrgLifecycle } = await import(await compileModule("src/pages/org/OrgLifecycle.tsx", {
  "../../lib/org-api": apiUrl, "../../i18n/ui/useUI": ui,
}));
const json = (data, status=200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const asset = { id: "inherited", assetRef: "12345678-1234-1234-1234-123456789012", assetKind: "artifact", title: "Member document", summary: "Published document", publishedBy: "member-author", createdAt: "2026-11-19" };
const result = (ownerUserId, assets, hasMore=false) => ({ available:true, ownerUserId, assets, hasMore });

async function render(element, run) {
  const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', { url: "https://app.test/library", pretendToBeVisual: true });
  const previous = new Map();
  for (const key of ["window","document","navigator","HTMLElement","HTMLInputElement","Event","IS_REACT_ACT_ENVIRONMENT"]) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  }
  const {createRoot}=await import("react-dom/client");
  const host=document.querySelector("main"),root=createRoot(host);
  const settle=async()=>{for(let i=0;i<6;i++)await act(async()=>{});};
  const v={ q:s=>host.querySelector(s),text:()=>host.textContent,
    async click(node){assert.ok(node);await act(async()=>node.click());await settle();},
    async rerender(next){await act(async()=>root.render(next));await settle();},
    async change(node,value){await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(node,value);node.dispatchEvent(new window.Event("input",{bubbles:true}));});await settle();},settle };
  try{await act(async()=>root.render(element));await settle();await run(v);}
  finally{await act(async()=>root.unmount());dom.window.close();for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}
async function withFetch(handler, run) {
  const before=globalThis.fetch, calls=[];
  globalThis.fetch=async(url,init={})=>{calls.push({url:new URL(url),init});return handler(new URL(url),init);};
  try{await run(calls);}finally{globalThis.fetch=before;delete globalThis.__bdArtifact;}
}

test("personal Library shows inherited entries with original attribution and canonical read-only preview",async()=>{
  let artifactId;
  await withFetch(()=>json(result("owner",[asset])),async()=>{
    globalThis.__bdArtifact=async(id)=>{artifactId=id;return {ok:true,data:{title:"Original content"}};};
    await render(React.createElement(InheritedTeamLibrary,{ownerUserId:"owner"}),async v=>{
      assert.match(v.text(),/Member document/);assert.match(v.text(),/署名：member-author/);
      assert.match(v.q("section").className,/border-stone-200 bg-white/);
      assert.equal(v.q("a"),null);
      await v.click(v.q("li button"));assert.equal(artifactId,asset.assetRef);
      assert.equal(v.q("[data-reference-preview]").textContent,"Original content");
      assert.equal(v.q("[data-reference-preview]").parentElement.style.height,"384px");
    });
  });
});

test("opaque and link references survive; query filters the inherited list",async()=>{
  await withFetch(()=>json(result("owner",[{...asset,assetRef:"skill:research"},{...asset,id:"url",title:"Public notes",assetRef:"https://example.test/notes"}])),async()=>{
    await render(React.createElement(InheritedTeamLibrary,{ownerUserId:"owner",query:"Public"}),async v=>{
      assert.doesNotMatch(v.text(),/Member document/);assert.equal(v.q("a").href,"https://example.test/notes");
      assert.equal(v.q("a").rel,"noopener noreferrer");
      await v.rerender(React.createElement(InheritedTeamLibrary,{ownerUserId:"owner",query:"research"}));
      assert.match(v.text(),/skill:research/);assert.equal(v.q("li button"),null);
    });
  });
});

test("reference hrefs reject executable URLs, protocol-relative paths, credentials and slash escapes",()=>{
  for(const ref of ["javascript:alert(1)","//elsewhere.test","/\\elsewhere.test","https://user:pass@example.test","data:text/html,hi"])
    assert.equal(inheritedAssetHref(ref),undefined);
  assert.equal(inheritedAssetHref("/library"),"/library");
});

test("pagination retains the first page and uses the count already loaded",async()=>{
  await withFetch(url=>json(url.searchParams.get("offset")==="0"?result("owner",[asset],true):result("owner",[{...asset,id:"second",title:"Second entry"}])),async calls=>{
    await render(React.createElement(InheritedTeamLibrary,{ownerUserId:"owner"}),async v=>{
      await v.click([...document.querySelectorAll("button")].find(b=>b.textContent==="加载更多"));
      assert.match(v.text(),/Member document/);assert.match(v.text(),/Second entry/);
      assert.equal(calls.at(-1).url.searchParams.get("offset"),"1");
    });
  });
});

test("account change rejects stale owner data and clears the old attribution",async()=>{
  let resolveStale, n=0;
  await withFetch(()=>++n===1?json(result("owner-a",[asset])):new Promise(resolve=>{resolveStale=resolve;}),async()=>{
    await render(React.createElement(InheritedTeamLibrary,{ownerUserId:"owner-a"}),async v=>{
      assert.match(v.text(),/member-author/);
      await v.rerender(React.createElement(InheritedTeamLibrary,{ownerUserId:"owner-b"}));
      assert.doesNotMatch(v.text(),/member-author/);
      await act(async()=>resolveStale(json(result("owner-a",[asset]))));await v.settle();
      assert.doesNotMatch(v.text(),/member-author/);assert.ok(v.q('[role="status"]'));
    });
  });
});

test("unavailable migration has an explicit unavailable API result and no invented entries",async()=>{
  await withFetch(()=>json({available:false,ownerUserId:"owner",assets:[],hasMore:false}),async()=>{
    assert.equal((await api.listInheritedOrgAssets()).available,false);
    await render(React.createElement(InheritedTeamLibrary,{ownerUserId:"owner"}),async v=>assert.equal(v.q("section"),null));
  });
});

test("legacy dissolve visibly acknowledges that Library entries have not moved; it never repeats the dissolve",async()=>{
  let changed=0;
  await withFetch(()=>json({status:"dissolved",library_transfer:{status:"not_available"}}),async calls=>{
    await render(React.createElement(OrgLifecycle,{orgId:"team",name:"Acme",role:"owner",onChanged:()=>changed++}),async v=>{
      await v.click(v.q("[data-org-dissolve]"));await v.change(v.q("input"),"Acme");await v.click(v.q("[data-org-action-confirm]"));
      assert.match(v.text(),/团队已解散，但团队库条目尚未转入你的个人库/);assert.equal(changed,0);
      assert.equal(v.q("[data-org-dissolve]"),null);
      await v.click(v.q('[role="status"] button'));assert.equal(changed,1);assert.equal(calls.length,1);
    });
  });
});

test("migrated dissolve completes normally with a moved receipt",async()=>{
  let changed=0;
  await withFetch(()=>json({status:"dissolved",library_transfer:{status:"moved",entry_count:2}}),async()=>{
    await render(React.createElement(OrgLifecycle,{orgId:"team",name:"Acme",role:"owner",onChanged:()=>changed++}),async v=>{
      await v.click(v.q("[data-org-dissolve]"));await v.change(v.q("input"),"Acme");await v.click(v.q("[data-org-action-confirm]"));
      assert.equal(changed,1);assert.doesNotMatch(v.text(),/尚未转入/);
    });
  });
});


test("a failed canonical preview retries that preview without rereading the inherited list",async()=>{
  let reads=0;
  await withFetch(()=>json(result("owner",[asset])),async calls=>{
    globalThis.__bdArtifact=async()=>++reads===1?{ok:false}:{ok:true,data:{title:"Retried content"}};
    await render(React.createElement(InheritedTeamLibrary,{ownerUserId:"owner"}),async v=>{
      await v.click(v.q("li button"));assert.match(v.text(),/暂时无法预览/);
      await v.click(v.q('[role="status"] button'));
      assert.equal(reads,2);assert.equal(calls.length,1);assert.equal(v.q("[data-reference-preview]").textContent,"Retried content");
    });
  });
});


test("publication after dissolve keeps the structured not_found code and existing translated message",async()=>{
  await withFetch(()=>json({detail:{code:"not_found",message:"团队已解散"}},404),async()=>{
    await assert.rejects(api.publishOrgAsset("team",{kind:"doc",title:"Late",url:"https://example.test/doc"}),cause=>{
      assert.equal(cause.code,"not_found");assert.equal(api.orgErrorCopy(cause.code),"这个团队已经不在了。");return true;
    });
  });
});

test("publication before its RPC is installed reports not_available without an invented receipt",async()=>{
  await withFetch(()=>json({detail:{code:"not_available"}},503),async()=>{
    await assert.rejects(api.publishOrgAsset("team",{kind:"doc",title:"Doc",url:"https://example.test/doc"}),cause=>cause.code==="not_available");
  });
});
