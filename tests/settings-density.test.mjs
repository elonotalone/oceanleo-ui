import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("settings and every settings child keep compact text without shrinking interaction targets", () => {
  const paths = [
    "pages/settings/ConnectorsSettingsPane.tsx", "pages/settings/SkillsSettingsPane.tsx",
    "pages/plugins/ConnectorCatalogDialog.tsx", "pages/plugins/ConnectorsSection.tsx",
    "shell/skills/kit/ConfigItemCard.tsx", "shell/skills/kit/ConfigDialogShell.tsx",
    "shell/skills/kit/ConfigToolbar.tsx", "shell/skills/kit/AddMenu.tsx",
    "shell/skills/kit/FolderTreeViewer.tsx", "shell/skills/kit/ConfigEmptyState.tsx",
    "shell/skills/manager/SkillsManager.tsx", "shell/skills/manager/OfficialSkillLibraryDialog.tsx",
    "shell/skills/manager/SkillDetailModal.tsx", "shell/skills/manager/ImportDialogs.tsx",
    "shell/skills/manager/ManagerDialog.tsx", "shell/CreateSkillModal.tsx", "shell/SkillPromptPanel.tsx",
  ];
  for (const path of paths) {
    const source = read(path);
    const sizes = [...source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
    assert.ok(sizes.every((size) => size <= 18), `${path}: maximum heading is 18px`);
    assert.doesNotMatch(source, /\btext-(?:base|lg|xl|2xl|3xl)\b/, path);
    assert.doesNotMatch(source, /(?:zoom\s*:|scale-\[0\.[0-8])/, path);
  }
  for (const path of ["ConfigToolbar", "ConfigDialogShell", "AddMenu", "FolderTreeViewer"]) {
    assert.match(read(`shell/skills/kit/${path}.tsx`), /(?:min-)?h-11/, `${path}: 44px actions remain`);
    assert.match(read(`shell/skills/kit/${path}.tsx`), /focus-visible/, `${path}: keyboard focus remains`);
  }
});

test("covers preserve portrait ratio and preview headings cannot inherit oversized Markdown headings", () => {
  const cover = read("shell/skills/kit/SkillCover.tsx");
  assert.match(cover, /aspect-\[3\/4\]/);
  assert.match(cover, /object-contain/);
  assert.match(cover, /sm: "w-8/);
  assert.match(cover, /md: "w-16/);
  assert.match(cover, /lg: "w-\[120px\]/);
  const viewer = read("shell/skills/kit/FolderTreeViewer.tsx");
  assert.match(viewer, /\[&_h1\]:text-\[14px\]/);
  assert.match(viewer, /overflow-x-auto/);
  assert.match(read("shell/skills/kit/ConfigItemCard.tsx"), /truncate text-\[13px\]/);
  assert.match(read("shell/skills/kit/ConfigItemCard.tsx"), /line-clamp-2 text-\[12px\]/);
});
