import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { unzipSync } from "fflate";
import ts from "typescript";

if (!globalThis.File) globalThis.File = NodeFile;

function javascriptModuleFormat(url) {
  if (url.endsWith(".mjs")) return "module";
  if (url.endsWith(".cjs")) return "commonjs";
  let directory = dirname(fileURLToPath(url));
  while (true) {
    const packageJson = `${directory}/package.json`;
    if (existsSync(packageJson)) {
      try {
        return JSON.parse(readFileSync(packageJson, "utf8")).type === "module"
          ? "module"
          : "commonjs";
      } catch {
        return "commonjs";
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return "commonjs";
    directory = parent;
  }
}

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".tsx") || url.endsWith(".ts")) {
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: {
            jsx: url.endsWith(".tsx")
              ? ts.JsxEmit.ReactJSX
              : ts.JsxEmit.Preserve,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    if (url.startsWith("node:")) {
      return {
        format: "builtin",
        source: "",
        shortCircuit: true,
      };
    }
    if (url.startsWith("file:") && !url.endsWith(".node")) {
      const format =
        url.endsWith(".js") ||
        url.endsWith(".mjs") ||
        url.endsWith(".cjs")
          ? javascriptModuleFormat(url)
          : context.format || (url.endsWith(".json") ? "json" : "module");
      return {
        format,
        source: readFileSync(fileURLToPath(url)),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});


const { saveFileToLibraryWithDependencies } = await import("../src/shell/doc-editors/doc-io.ts");
const { saveHostedDeck } = await import("../src/shell/advanced-routes/deck-hosted-save.ts");
const { normalizeDeckDocument, cloneDeckDocument } = await import("../src/shell/doc-editors/deck-schema.ts");
const { deckDocumentToPptist, deckProjectFromPptist } = await import("../src/shell/doc-editors/deck-pptist-carrier.ts");
const { deckProjectUrlFor } = await import("../src/shell/doc-editors/use-deck-editor.ts");
const original = {id:"root",key:"root:r1",source:"artifact",artifactId:"root",revisionId:"r1",artifactType:"deck",title:"My deck",kind:"ppt",siteId:"ppt",favorite:false,meta:{}};
const payload = {format:"pptist.slides.v2", title:"My deck", viewportSize:1000,viewportRatio:0.5625,theme:{fontName:"Test"},slides:[{id:"s1",elements:[{id:"e1",type:"text",left:10,top:20,width:500,height:80,rotate:0,content:"<p><b>Saved title</b></p>"}],animations:[{elId:"e1",effect:"fadeIn"}]}]};
function producer(fail = "") {
  const events=[], projects=[], commits=[];
  const deps={
    now:()=>new Date("2026-09-26T17:00:00Z"),
    uploadFile:async(file, options)=>{
      const role=/:project:/.test(options.idempotencyKey)?"project":/:preview:/.test(options.idempotencyKey)?"preview":"delivery";
      events.push("upload:"+role);
      assert.ok(options.idempotencyKey.includes(":root"));
      if(fail==="upload")return {ok:false,error:"上传失败"};
      if(role==="project")projects.push(JSON.parse(await file.text()));
      const digest=createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
      return {ok:true,data:{file:{id:"file",url:`https://files.example/${role}-${projects.length}`,title:file.name,mime:file.type,meta:{content_digest:digest}}}};
    },
    saveCreations:async()=>{throw Error("must never create another root");},
    createArtifactRevision:async(root,commit)=>{
      events.push("typed-revision");commits.push(commit);assert.equal(root,"root");
      if(fail==="revision")return {ok:false,error:"版本冲突"};
      const revisionId="r"+(commits.length+1),renditions={};
      for(const r of [{purpose:"source",...commit.source,mediaType:"application/vnd.openxmlformats-officedocument.presentationml.presentation"},...commit.renditions])renditions[r.purpose]={...r,revisionId,digest:"sha256:"+r.digest};
      return {ok:true,data:{...original,key:"root:"+revisionId,revisionId,artifact:{artifactId:root,revisionId,artifactType:"deck",sourceFormat:"pptx",renditions}}};
    }
  };
  return {events,projects,commits,dependencies:{
    save:input=>saveFileToLibraryWithDependencies(input,deps),
    delivery:async()=>new Blob(["pptx-delivery"]),
    preview:async()=>new Blob(["png-preview"],{type:"image/png"}),
  }};
}
test("D1 R5: upload full project, PPTX and preview then CAS the same root; reopen the new revision losslessly",async()=>{
  const p=producer();
  const result=await saveHostedDeck(original,payload,"ppt",2,p.dependencies);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual(p.events,["upload:project","upload:delivery","upload:preview","typed-revision"]);
  assert.equal(p.commits[0].expectedRevisionId,"r1");
  assert.equal(p.commits[0].provenance.previousRevisionId,"r1");
  assert.equal(result.item.revisionId,"r2");
  assert.equal(result.item.artifactId,"root");
  assert.equal(deckProjectUrlFor(result.item),"https://files.example/project-1");
  const reopened=normalizeDeckDocument(p.projects[0].data);
  assert.equal(reopened.slides[0].elements[0].text,"Saved title");
  assert.deepEqual(deckDocumentToPptist(cloneDeckDocument(reopened)),payload);
  const second=await saveHostedDeck(result.item,payload,"ppt",3,p.dependencies);
  assert.equal(second.ok,true);
  assert.equal(p.commits[1].expectedRevisionId,"r2");
  assert.equal(second.item.revisionId,"r3");
});
test("D1 R5: upload or typed revision failure cannot return a saved item",async()=>{
  for(const failure of ["upload","revision"]){
    const p=producer(failure),result=await saveHostedDeck(original,payload,"ppt",2,p.dependencies);
    assert.equal(result.ok,false);assert.equal(result.item,undefined);assert.ok(result.error);
    assert.equal(p.commits.length,failure==="upload"?0:1);
  }
});
test("D1 R5: missing typed identity and missing full snapshot fail before any upload",async()=>{
  for(const [item,data] of [[{...original,artifactId:undefined},payload],[original,{slides:[]}]]){
    const p=producer(),result=await saveHostedDeck(item,data,"ppt",2,p.dependencies);
    assert.equal(result.ok,false);assert.deepEqual(p.events,[]);
  }
});
test("D1 R5: editing the normal projection does not restore stale professional text",()=>{
  const project=cloneDeckDocument(deckProjectFromPptist(payload,"My deck"));
  project.slides[0].elements[0].text="Normal edit";
  assert.match(deckDocumentToPptist(project).slides[0].elements[0].content,/Normal edit/);
});
