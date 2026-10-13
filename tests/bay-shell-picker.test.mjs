// W03（oceanleo-bay）：Bay 浮窗与 /bay 页各挂一个「我的库」挑作品宿主（仲裁 #20）。
// W04：标准页框与 17px 标题在 LeoChat 整页；LibraryWorkPickerHost 在 LeoBay 栏；BayPage 只转给整页。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

test("LeoBay 页挂了 LibraryWorkPickerHost", () => {
  const page = readFileSync(join(REPO, "src/shell/bay/shell/LeoBayPage.tsx"), "utf8");
  assert.match(page, /import\s*\{\s*LibraryWorkPickerHost\s*\}\s*from\s*"\.\.\/needs\/LibraryWorkPicker"/);
  assert.match(page, /<LibraryWorkPickerHost\s*\/>/);
});

test("BayPage 转给 LeoBayPage", () => {
  const page = readFileSync(join(REPO, "src/shell/bay/shell/BayPage.tsx"), "utf8");
  assert.match(page, /LeoBayPage/);
  assert.doesNotMatch(page, /LeoChatPage/);
  assert.doesNotMatch(page, /OceanLeo Bay/);
});

test("LeoBay 详情页不再套带描边的白底悬浮板", () => {
  const page = readFileSync(join(REPO, "src/shell/bay/shell/LeoBayPage.tsx"), "utf8");
  assert.match(page, /data-bay-page-detail=\{target\.kind\}/);
  assert.doesNotMatch(page, /rounded-xl border border-stone-200 bg-white/);
  const seller = readFileSync(join(REPO, "src/shell/bay/seller/seller-ui.tsx"), "utf8");
  assert.match(seller, /function SellerCard/);
  assert.doesNotMatch(seller, /rounded-xl border border-stone-200 bg-white/);
});

test("发帖、我的、数据面板垫白底圆角板", () => {
  const page = readFileSync(join(REPO, "src/shell/bay/shell/LeoBayPage.tsx"), "utf8");
  assert.match(page, /BAY_FORM_PAPER_CLASS/);
  assert.match(page, /data-bay-page-paper=\{target\.kind\}/);
  assert.match(page, /"app-editor",\s*"lesson-editor",\s*"bundle-editor"/);
  const headerAt = page.indexOf("data-bay-page-detail-header");
  const paperAt = page.indexOf("data-bay-page-paper={target.kind}");
  assert.ok(headerAt >= 0 && paperAt > headerAt, "返回和标题在板外");
  const form = readFileSync(join(REPO, "src/shell/bay/form/form-ui.ts"), "utf8");
  assert.match(form, /BAY_FORM_PAPER_CLASS/);
  assert.match(form, /rounded-3xl bg-white/);
  assert.doesNotMatch(form, /border-stone-200/);
});

test("发帖白板跟页一起滚：板上没有滚动条，下滑盖住返回和标题", () => {
  const page = readFileSync(join(REPO, "src/shell/bay/shell/LeoBayPage.tsx"), "utf8");
  assert.match(page, /data-bay-page-scroll/);
  assert.match(page, /sticky top-0 z-0/);
  const paperReturn = page.slice(page.indexOf("data-bay-page-scroll"));
  assert.match(paperReturn, /\{header\}/);
  assert.match(paperReturn, /data-bay-page-paper=\{target\.kind\}/);
  assert.match(page, /className=\{paper \? undefined : "flex min-h-0 flex-1 flex-col overflow-y-auto"\}/);
  const form = readFileSync(join(REPO, "src/shell/bay/form/form-ui.ts"), "utf8");
  assert.match(form, /relative z-10/);
  assert.doesNotMatch(form, /overflow-hidden/);
  assert.match(form, /BAY_FORM_PAPER_CLASS = "relative z-10 flex min-h-0 flex-1 flex-col rounded-3xl bg-white p-6"/);
});

test("发帖白板贴着页的上下边，页框不再上下留白", () => {
  const page = readFileSync(join(REPO, "src/shell/bay/shell/LeoBayPage.tsx"), "utf8");
  assert.match(page, /PAPER_FRAME_CLASS/);
  assert.match(page, /paperPage \? PAPER_FRAME_CLASS : FRAME_CLASS/);
  assert.match(page, /PAPER_FRAME_CLASS = "mx-auto flex h-\[calc\(100dvh-1px\)\] min-h-0 w-full max-w-6xl flex-col px-4"/);
  assert.doesNotMatch(page, /PAPER_FRAME_CLASS = "[^"]*\bpt-3\b/);
  assert.doesNotMatch(page, /PAPER_FRAME_CLASS = "[^"]*\bpb-5\b/);
  assert.match(page, /PAPER_HEADER_CLASS = "sticky top-0 z-0 flex min-h-14 shrink-0 items-center justify-between gap-3"/);
  assert.doesNotMatch(page, /PAPER_HEADER_CLASS = "[^"]*\bmb-3\b/);
  assert.match(page, /paper \? PAPER_HEADER_CLASS : APP_PAGE_HEADER_ROW_CLASS/);
});

test("截止日期是短胶囊，不是整行原生日期框", () => {
  const deadline = readFileSync(join(REPO, "src/shell/bay/form/BayDeadlineField.tsx"), "utf8");
  assert.match(deadline, /data-bay-deadline-field/);
  assert.match(deadline, /\binline-flex h-11 w-40\b/);
  assert.match(deadline, /type="date"/);
  const terms = readFileSync(join(REPO, "src/shell/bay/form/listing-terms-fields.tsx"), "utf8");
  assert.match(terms, /BayDeadlineField/);
  assert.doesNotMatch(terms, /type="date"/);
  const reveal = readFileSync(join(REPO, "src/shell/bay/form/BayRevealForm.tsx"), "utf8");
  assert.doesNotMatch(reveal, /rounded-3xl border border-neutral-200 bg-white/);
});
