// 安全矩阵：不适用（填写页控件，复用库查看器，无新注入）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  applyDigitalWorks,
  digitalWorksFromLoaded,
  normalizeDigitalWorks,
  USER_UPLOAD_MAX_BYTES,
} from "../src/shell/bay/form/bay-digital-works.ts";

const stubs = {
  "../../../lib/bay/http": dataModule(`
    export class BayApiError extends Error {}
    export const bayGet = async () => ({});
    export const bayPost = async () => ({});
    export const bayPatch = async () => ({});
    export const bayDelete = async () => ({});
  `),
  "../../../lib/agent": dataModule(`export async function authed(){ return { ok: true, data: {} }; }`),
};
const model = await import(await compileModule("src/shell/bay/seller/editor-model.ts", stubs));
const tt = (zh, vars) => (vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh);

test("从 media caption 还原多份；第一份来自 digital_work；重复 id 丢掉；gallery 图不进作品列表", () => {
  const works = digitalWorksFromLoaded({
    digitalWork: { id: "art-1", title: "主件", kind: "artifact" },
    media: [
      { caption: "", url: "https://cdn.example.com/cover.png", kind: "image", position: 0 },
      { caption: "细节图", url: "https://cdn.example.com/b.png", kind: "image", position: 1 },
      { caption: "bay-work:art-2", url: "https://cdn.example.com/deck.pptx", kind: "file", position: 2 },
      { caption: "bay-work:art-1", url: "https://cdn.example.com/dup.pdf", kind: "file", position: 3 },
      { caption: "bay-work:art-2", url: "https://cdn.example.com/dup2.pptx", kind: "file", position: 4 },
      { caption: "bay-work:art-3", url: "https://cdn.example.com/notes.docx", kind: "file", position: 5 },
    ],
  });
  assert.deepEqual(
    works.map((work) => work.id),
    ["art-1", "art-2", "art-3"],
  );
  assert.equal(works[0].title, "主件");
  assert.equal(works[1].url, "https://cdn.example.com/deck.pptx");
  const named = digitalWorksFromLoaded({
    digitalWork: { id: "art-1", title: "主件", kind: "artifact" },
    media: [{ caption: "bay-work:art-2|附件.pptx", url: "https://cdn.example.com/deck.pptx", kind: "file", position: 0 }],
  });
  assert.equal(named[1]?.title, "附件.pptx");
  assert.equal(
    works.some((work) => work.url === "https://cdn.example.com/cover.png"),
    false,
  );
});

test("重复 id 不进列表，不截份数", () => {
  const many = Array.from({ length: 12 }, (_, index) => ({
    id: `art-${index}`,
    title: `文件${index}`,
    kind: "artifact",
  }));
  many.push({ id: "art-1", title: "重复", kind: "artifact" });
  const works = normalizeDigitalWorks(many);
  assert.equal(works.length, 12);
  assert.equal(works[1].id, "art-1");
  assert.equal(works.filter((work) => work.id === "art-1").length, 1);
  const synced = applyDigitalWorks(works);
  assert.equal(synced.digitalWork?.id, "art-0");
  assert.equal(synced.digitalWorks[0].id, synced.digitalWork.id);
});

test("BayWorkShowcase 源码含 lazy LibraryItemViewer、模板式浮层，不含 iframe / innerHTML", () => {
  const source = readFileSync(new URL("../src/shell/bay/form/BayWorkShowcase.tsx", import.meta.url), "utf8");
  assert.match(source, /lazy\(\(\) => import\("\.\.\/\.\.\/library-viewers"\)/);
  assert.match(source, /data-bay-work-showcase=""/);
  assert.match(source, /max-w-5xl/);
  assert.match(source, /90vh/);
  assert.doesNotMatch(source, /<iframe/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
});

test("BayDigitalWorksField 源码可多选任意类型，含上传和从库选", () => {
  const source = readFileSync(new URL("../src/shell/bay/form/BayDigitalWorksField.tsx", import.meta.url), "utf8");
  assert.match(source, /type="file"/);
  assert.match(source, /\bmultiple\b/);
  assert.doesNotMatch(source, /accept="image/);
  assert.match(source, /上传文件/);
  assert.match(source, /从我的库选/);
  assert.match(source, /pickLibraryWork/);
  assert.match(source, /uploadFile/);
  assert.match(source, /canonicalUploadLibraryItem/);
  assert.match(source, /BayWorkShowcase/);
  assert.match(source, /flushSync/);
  assert.match(source, /data-bay-work-spin/);
  assert.match(source, /animateTransform/);
  assert.doesNotMatch(source, /DIGITAL_WORKS_MAX/);
});

test("每人上传总量上限 20GiB，逻辑层不再截 9 份", () => {
  assert.equal(USER_UPLOAD_MAX_BYTES, 20 * 1024 * 1024 * 1024);
  const logic = readFileSync(new URL("../src/shell/bay/form/bay-digital-works.ts", import.meta.url), "utf8");
  assert.doesNotMatch(logic, /DIGITAL_WORKS_MAX/);
});

test("ServiceEditorPane 填写要卖的作品走 BayDigitalWorksField，不再内嵌 BayTypedPreview", () => {
  const editor = readFileSync(new URL("../src/shell/bay/seller/ServiceEditorPane.tsx", import.meta.url), "utf8");
  assert.match(editor, /BayDigitalWorksField/);
  assert.doesNotMatch(editor, /<BayTypedPreview/);
  assert.doesNotMatch(editor, /artifactId=\{draft\.digitalWork\.id\}/);
});

test("listingPayload 仍只输出第一份 digital_work", () => {
  const draft = model.emptyDraft(tt);
  draft.catalogKind = "delivery";
  draft.listingKind = "digital";
  draft.offerKind = "digital";
  draft.license = "personal";
  draft.digitalWork = { id: "art-1", title: "主件", kind: "artifact" };
  draft.digitalWorks = [
    { id: "art-1", title: "主件", kind: "artifact" },
    { id: "art-2", title: "附件", kind: "artifact", url: "https://cdn.example.com/b.pdf" },
  ];
  const payload = model.listingPayload(draft);
  assert.deepEqual(payload.digital_work, { kind: "artifact", id: "art-1" });
  assert.equal(payload.listing_kind, "digital");
  assert.equal("digital_works" in payload, false);
  const input = model.serviceInput(draft);
  assert.deepEqual(input.digital_work, { kind: "artifact", id: "art-1" });
  assert.equal("digital_works" in input, false);
});
