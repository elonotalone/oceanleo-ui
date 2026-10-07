// W03（oceanleo-bay）：Bay 浮窗与 /bay 页各挂一个「我的库」挑作品宿主（仲裁 #20）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

test("BayPage 标题与其它列表页一样：标准页框里的 17px AppPageHeader，没有介绍句", () => {
  const page = readFileSync(join(REPO, "src/shell/bay/shell/BayPage.tsx"), "utf8");
  assert.match(page, /AppPageHeader/);
  assert.match(page, /title="OceanLeo Bay"/);
  assert.match(page, /APP_PAGE_FRAME_CLASS/);
  assert.doesNotMatch(page, /function PageHeader/);
  assert.doesNotMatch(page, /找人做事，或者接别人的需求/);
  assert.doesNotMatch(page, /text-\[22px\]/);
  // 版式细节（操作不重复、筛选不出滚动条、点开是「返回 + 标题」）在 bay-shell-layout.test.mjs 里渲染出来验。
  assert.match(page, /<Browse\b/);
  assert.match(page, /<Detail\b/);
});

test("BayView 与 BayPage 都挂了 LibraryWorkPickerHost", () => {
  const view = readFileSync(join(REPO, "src/shell/bay/shell/BayView.tsx"), "utf8");
  const page = readFileSync(join(REPO, "src/shell/bay/shell/BayPage.tsx"), "utf8");
  assert.match(view, /import\s*\{\s*LibraryWorkPickerHost\s*\}\s*from\s*"\.\.\/needs"/);
  assert.match(page, /import\s*\{\s*LibraryWorkPickerHost\s*\}\s*from\s*"\.\.\/needs"/);
  assert.match(view, /<LibraryWorkPickerHost\s*\/>/);
  assert.match(page, /<LibraryWorkPickerHost\s*\/>/);
});
