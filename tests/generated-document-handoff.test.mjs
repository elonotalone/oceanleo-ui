import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { normalizeWork } from "../src/shell/library-data.ts";
import { isEnsureableTransient } from "../src/shell/artifact-contract.ts";
const auth = dataModule(`export const AUTH_STATE_EVENT='auth'; export async function accessToken(){ return 'fixture-token'; } export async function getUserId(){return 'owner';} export async function getUserIdSnapshot(){return {available:true,userId:'owner'};}`);
const config = dataModule(`export const GATEWAY_BASE='https://api.test';`);
const client = await import(await compileModule("src/shell/artifact-client.ts", {"../lib/auth/client":auth,"../lib/auth/config":config}));
const digest="a".repeat(64);
const receipt="opaque-server-signed-file-receipt";
const work={id:"work-fixture",title:"生成文档",url:"https://storage.example/generated.docx",kind:"doc",media_type:"document",site_id:"home",meta:{library_kind:"doc",generation_result_id:"result-fixture",artifact_idempotency_key:"generated-document-v1:fixture",payload_digest:digest,source_url:"https://storage.example/generated.docx",preview_url:"https://storage.example/generated-cover.svg",format:"docx",provenance:{provider:"oceanleo-material-doc-docx",generation_job_id:"result-fixture",generation_model:"material-doc-docx",generated_file_receipt:receipt}}};

test("actual work normalizer and ensure caller preserve server document receipt", async () => {
  const item=normalizeWork(work);
  assert.ok(isEnsureableTransient(item.transient));
  assert.equal(item.transient.artifactType,"document");
  assert.equal(item.transient.sourceFormat,"docx");
  assert.equal(item.transient.provenance.generated_file_receipt,receipt);
  const previous=globalThis.fetch;
  let posted;
  globalThis.fetch=async (url,options)=>{posted=JSON.parse(options.body); return new Response(JSON.stringify({detail:{code:"fixture-stop",message:"transport capture"}}),{status:422,headers:{"Content-Type":"application/json"}});};
  try { await client.ensureArtifact(item.transient); } finally {globalThis.fetch=previous;}
  assert.equal(posted.provenance.generated_file_receipt,receipt);
  assert.equal(posted.source_url,work.url);
  assert.equal(posted.rendition_url,work.meta.preview_url);
  assert.equal(posted.operation,"generation");
});

test("manual old work without server handoff is not invented into a generation receipt",()=>{
  const item=normalizeWork({...work,meta:{library_kind:"doc",format:"docx"}});
  assert.equal(item.transient,undefined);
});

test("export saved native project using verified reloaded origin", {skip:!process.env.AIGC_NATIVE_HANDOFF_EVIDENCE_DIR}, async()=>{
  const {readFile,writeFile}=await import("node:fs/promises");
  const {join}=await import("node:path");
  const {tiptapJsonToDocxBlob}=await import("../src/shell/doc-editors/docx-export.ts");
  const {richDocLabeledText,richDocLabeledHtml}=await import("../src/shell/doc-editors/rich-doc-provenance.ts");
  const dir=process.env.AIGC_NATIVE_HANDOFF_EVIDENCE_DIR;
  const receipt=JSON.parse(await readFile(join(dir,"source-readback.json"),"utf8"));
  const project=JSON.parse(await readFile(join(dir,"saved-native-project.json"),"utf8"));
  const generated=receipt.native_root.generatedOrigin===true && receipt.derivative_save_and_reload===true;
  assert.equal(generated,true);
  process.env.NEXT_PUBLIC_OCEANLEO_AIGC_LABEL="1";
  const blob=await tiptapJsonToDocxBlob("原生保存重开后的文档",project.data,{generated});
  await writeFile(join(dir,"native-reexport.docx"),new Uint8Array(await blob.arrayBuffer()));
  const text=project.data.content[0].content[0].text;
  await writeFile(join(dir,"native-reexport.txt"),richDocLabeledText(text,generated));
  await writeFile(join(dir,"native-reexport.html"),richDocLabeledHtml(`<p>${text}</p>`,generated));
});

test("generated PDF handoff stays a PDF with PDF editor routing",()=>{
  const pdf=normalizeWork({...work,url:"https://storage.example/generated.pdf",kind:"file",meta:{...work.meta,library_kind:"pdf",artifact_type:"pdf",format:"pdf",source_url:"https://storage.example/generated.pdf",preview_url:"https://storage.example/pdf-cover.png"}});
  assert.equal(pdf.kind,"document");
  assert.equal(pdf.transient.artifactType,"pdf");
  assert.equal(pdf.transient.sourceFormat,"pdf");
  assert.equal(pdf.transient.provenance.generated_file_receipt,receipt);
});
