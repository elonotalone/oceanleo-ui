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
