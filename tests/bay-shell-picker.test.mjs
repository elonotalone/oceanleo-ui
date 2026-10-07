// W03（oceanleo-bay）：Bay 浮窗与 /bay 页各挂一个「我的库」挑作品宿主（仲裁 #20）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

test("BayView 与 BayPage 都挂了 LibraryWorkPickerHost", () => {
  const view = readFileSync(join(REPO, "src/shell/bay/shell/BayView.tsx"), "utf8");
  const page = readFileSync(join(REPO, "src/shell/bay/shell/BayPage.tsx"), "utf8");
  assert.match(view, /import\s*\{\s*LibraryWorkPickerHost\s*\}\s*from\s*"\.\.\/needs"/);
  assert.match(page, /import\s*\{\s*LibraryWorkPickerHost\s*\}\s*from\s*"\.\.\/needs"/);
  assert.match(view, /<LibraryWorkPickerHost\s*\/>/);
  assert.match(page, /<LibraryWorkPickerHost\s*\/>/);
});
