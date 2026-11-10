import assert from "node:assert/strict";
import test from "node:test";
import { artifactDisplayRendition, selectArtifactRendition, normalizeArtifactProjection } from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

function artifact(renditions) {
  const normalized = normalizeArtifactProjection({
    schema:"oceanleo.artifact.v1",artifactId:"tiny",revisionId:"r1",artifactType:"single_file_image",
    roles:["reference"],title:"tiny",editability:"view_only",favorite:false,sourceFormat:"png",
    owner:{principalId:"platform",visibility:"public"},
    access:{read:true,preview:true,edit:false,fork:false,insert:false,replace:false,favorite:false,bind:false,export_source:false},
    provenance:{id:"p",source_kind:"approved_provider",license_code:"CC0"},
    integrity:{ok:true,code:"ok",reason:""},renditions,context_bindings:[],
  });
  assert.ok(normalized);
  return normalized;
}
const full={purpose:"full",revisionId:"r1",url:"https://example.test/tiny.png",mediaType:"image/png",width:16,height:32,digest:"1".repeat(64)};
const preview={...full,purpose:"preview",url:"https://example.test/preview.webp"};
const thumbnail={...full,purpose:"thumbnail",url:"https://example.test/thumb.webp"};

test("all display selectors use preview then full within the pinned revision",()=>{
  for (const renditions of [{full},{full,preview},{full,preview,thumbnail}]) {
    const a=artifact(renditions);
    assert.equal(artifactDisplayRendition(a,"thumbnail").url,(renditions.thumbnail||renditions.preview||full).url);
    assert.equal(artifactDisplayRendition(a,"preview").url,(renditions.preview||full).url);
    assert.equal(selectArtifactRendition(a,["thumbnail"]).url,(renditions.thumbnail||renditions.preview||full).url);
    const item=artifactProjectionToLibraryItem(a);
    assert.equal(item.thumbUrl,(renditions.thumbnail||renditions.preview||full).url);
    assert.equal(item.previewUrl,(renditions.preview||full).url);
  }
});

test("fallback cannot cross revision or use source/editor bytes",()=>{
  const a=artifact({full:{...full,revisionId:"r2"},source:{...full,purpose:"source"}});
  assert.equal(artifactDisplayRendition(a,"thumbnail"),undefined);
  assert.equal(artifactDisplayRendition(a,"preview"),undefined);
  assert.equal(selectArtifactRendition(a,["thumbnail"]),null);
  assert.equal(artifactProjectionToLibraryItem(a).thumbUrl,undefined);
});

test("full-only image keeps first-paint geometry",async()=>{
  const {libraryMediaGeometry}=await import(await compileModule("src/shell/library-viewer-first-paint.tsx",{
    "../i18n/ui/useUI":dataModule("export function useUI(){return value=>value}"),
  }));
  const a=artifact({full});const item=artifactProjectionToLibraryItem(a);
  const geometry=libraryMediaGeometry(item);
  assert.equal(geometry.ratio,0.5);
});

test("cover purpose selection retains full and excludes a different revision",async()=>{
  const {workspaceCoverRenditionPurposes}=await import(await compileModule("src/shell/workspace-library-cover.tsx"));
  const a=artifact({full,thumbnail:{...thumbnail,revisionId:"r0"}});
  const item=artifactProjectionToLibraryItem(a);
  const purposes=workspaceCoverRenditionPurposes(item);
  assert.ok(purposes.includes("full"));
  assert.ok(!purposes.includes("thumbnail"));
});

test("refresh API resolves an absent preview from the returned pinned full",async(t)=>{
  const {refreshArtifactRendition}=await import(await compileModule("src/shell/artifact-client.ts",{
    "../lib/auth/client":dataModule("export async function accessToken(){return null}"),
    "../lib/auth/config":dataModule('export const GATEWAY_BASE="https://gateway.test";'),
  }));
  const previousFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=previousFetch});
  const calls=[];
  globalThis.fetch=async(url)=>{
    calls.push(String(url));
    return new Response(JSON.stringify(artifact({full})),{status:200,headers:{"Content-Type":"application/json"}});
  };
  const result=await refreshArtifactRendition({artifactId:"tiny",revisionId:"r1"},"preview");
  assert.equal(result.ok,true);
  assert.equal(result.data.url,full.url);
  assert.equal(result.data.revisionId,"r1");
  assert.match(calls[0],/\/renditions\/preview\/url\?revision_id=r1$/);
  globalThis.fetch=async()=>new Response(JSON.stringify({...artifact({full}),revisionId:"r2"}),{status:200,headers:{"Content-Type":"application/json"}});
  const mismatch=await refreshArtifactRendition({artifactId:"tiny",revisionId:"r1"},"preview");
  assert.equal(mismatch.ok,false);
  assert.equal(mismatch.code,"integrity-failed");
});
