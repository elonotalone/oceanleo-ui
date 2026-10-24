// skills-overhaul W17（2026-10-24）：Library「文件夹」类别。
// 合同 §0 D5 / §1 A14：能列出、打开（左树右文）、下载、删除、上传 zip 成文件夹；
// 技能文件夹带「技能」角标与开关。浏览器未授权（D15），这里用纯函数、SSR 渲染与源码断言。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const GATEWAY = "https://api.dev.example";

const uiStub = dataModule(`
export function useUI() {
  return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
}`);
// kit 是 W09A 的面：这里只替换成能在 SSR 里看见 props 的薄壳，断言 W17 传了什么。
const kitStub = dataModule(`
import { createElement as h } from "${reactUrl}";
const abs = (p) => /^https?:/.test(p) ? p : "${GATEWAY}" + (p.startsWith("/") ? p : "/" + p);
export const folderApi = {
  gatewayAbsoluteUrl: abs,
  folderDownloadUrl: (id) => abs("/v1/folders/" + id + "/download"),
};
export function ConfigDialogShell(p) {
  return h("section", { "data-stub": "dialog", "data-test-id": p.testId },
    h("h2", null, p.title), h("div", { "data-stub": "subtitle" }, p.subtitle),
    h("div", { "data-stub": "toolbar" }, p.toolbar), p.children);
}
export function FolderTreeViewer(p) { return h("div", { "data-stub": "tree", "data-initial": p.initialPath || "" }); }
export function SkillCover(p) { return h("img", { "data-stub": "cover", src: p.src || "", alt: "" }); }
`);
const authStub = dataModule(`export async function accessToken() { return null; }`);

const mod = await import(
  await compileModule("src/shell/library-folders.tsx", {
    "../i18n/ui/useUI": uiStub,
    "./skills/kit": kitStub,
    "../lib/auth/client": authStub,
  })
);

const folder = (over = {}) => ({
  id: "f1",
  title: "Brand kit",
  source: "upload",
  origin: {},
  project_id: null,
  skill: null,
  cover_url: null,
  file_count: 3,
  total_bytes: 1200,
  created_at: "2026-10-20T08:00:00Z",
  updated_at: "2026-10-21T08:00:00Z",
  can_edit: true,
  official: null,
  ...over,
});

test("folders sort newest first and search title / skill name / official title", () => {
  const rows = [
    folder({ id: "a", title: "A", updated_at: "2026-10-01T00:00:00Z" }),
    folder({ id: "b", title: "B", updated_at: "2026-10-23T00:00:00Z" }),
    folder({ id: "c", title: "C", updated_at: "", created_at: "2026-10-10T00:00:00Z" }),
  ];
  assert.deepEqual(mod.sortFoldersByTime(rows).map((row) => row.id), ["b", "c", "a"]);
  const skill = folder({
    id: "s",
    title: "Notes",
    skill: { name: "meeting-distiller", description: "minutes", enabled: true },
    official: { title: "Meeting Distiller", title_zh: "会议纪要提炼" },
  });
  assert.deepEqual(mod.filterFolders([...rows, skill], "distiller").map((row) => row.id), ["s"]);
  assert.deepEqual(mod.filterFolders([...rows, skill], "纪要").map((row) => row.id), ["s"]);
  assert.equal(mod.filterFolders(rows, "  ").length, 3);
});

test("only official folders show a cover; uploaded folders never render an untrusted image", () => {
  const official = folder({ source: "official", cover_url: "/v1/skills/official/x/cover.svg", official: { cover_url: "/v1/skills/official/x/cover.svg" } });
  assert.equal(mod.folderCoverSrc(official), `${GATEWAY}/v1/skills/official/x/cover.svg`);
  assert.equal(mod.folderCoverSrc(folder({ cover_url: "/v1/folders/f1/cover.svg" })), null);
  assert.equal(mod.folderCoverSrc(folder({ source: "official" })), null);
  assert.equal(mod.folderSourceLabel(official), "官方 · 随官方更新");
  assert.equal(mod.folderSourceLabel(folder({ source: "github" })), "来自 GitHub");
});

test("upload accepts .zip/.skill within 20 MB; uploaded skills announce they start off", () => {
  assert.deepEqual(mod.checkFolderUpload({ name: "x.zip", size: 10 }), { ok: true });
  assert.deepEqual(mod.checkFolderUpload({ name: "x.SKILL", size: 10 }), { ok: true });
  assert.equal(mod.checkFolderUpload({ name: "x.rar", size: 10 }).ok, false);
  assert.equal(mod.checkFolderUpload(null).ok, false);
  assert.equal(mod.checkFolderUpload({ name: "x.zip", size: mod.FOLDER_UPLOAD_MAX_BYTES + 1 }).ok, false);
  assert.match(mod.FOLDER_UPLOAD_ACCEPT, /\.zip/);
  assert.match(mod.FOLDER_UPLOAD_ACCEPT, /\.skill/);
  assert.equal(
    mod.uploadNotice({ skill: { name: "x", description: "", enabled: false } }),
    "来自上传的技能默认关闭，确认内容后再启用",
  );
  assert.equal(mod.uploadNotice({ skill: null }), "文件夹已上传");
});

test("copy-to-project lists only projects the user can write", () => {
  const rows = mod.copyTargetProjects([
    { id: "p1", name: "Mine", role: "owner" },
    { id: "p2", name: "Shared edit", role: "edit" },
    { id: "p3", name: "Shared view", role: "view" },
    { id: "p4", name: "Site", role: "owner", kind: "website" },
    { name: "no id" },
    null,
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["p1", "p2"]);
});

test("skill folder card: 技能 badge + switch; plain folder: folder icon, no switch; meta line counts files", () => {
  const skillCard = renderToStaticMarkup(
    React.createElement(mod.LibraryFolderCard, {
      folder: folder({ skill: { name: "brand-kit", description: "d", enabled: false } }),
      onOpen() {},
      onToggle() {},
    }),
  );
  assert.match(skillCard, /data-library-folder-card="f1"/);
  assert.match(skillCard, /data-library-folder-badge="skill"[^>]*>技能</);
  assert.match(skillCard, /role="switch"[^>]*aria-checked="false"/);
  assert.match(skillCard, /文件夹 · 3 个文件/);
  assert.match(skillCard, /data-library-folder-cover="icon"/);

  const plain = renderToStaticMarkup(
    React.createElement(mod.LibraryFolderCard, { folder: folder(), onOpen() {} }),
  );
  assert.doesNotMatch(plain, /role="switch"/);
  assert.doesNotMatch(plain, /data-library-folder-badge/);

  const official = renderToStaticMarkup(
    React.createElement(mod.LibraryFolderCard, {
      folder: folder({
        source: "official",
        cover_url: "/v1/skills/official/x/cover.svg",
        official: { cover_url: "/v1/skills/official/x/cover.svg" },
        skill: { name: "x", description: "", enabled: true },
        can_edit: true,
      }),
      onOpen() {},
      onToggle() {},
    }),
  );
  assert.match(official, /data-library-folder-cover="official"/);
  assert.match(official, new RegExp(`src="${GATEWAY}/v1/skills/official/x/cover.svg"`));
  assert.match(official, /aria-checked="true"/);

  const readOnly = renderToStaticMarkup(
    React.createElement(mod.LibraryFolderCard, {
      folder: folder({ skill: { name: "x", description: "", enabled: true }, can_edit: false }),
      onOpen() {},
      onToggle() {},
    }),
  );
  assert.match(readOnly, /role="switch"[^>]*disabled=""/);
});

test("detail: big dialog with download / copy-to-project / delete; official shows 随官方更新; tree viewer after load", () => {
  const html = renderToStaticMarkup(
    React.createElement(mod.LibraryFolderDetail, {
      folderId: "f1",
      initial: folder({ source: "official", skill: { name: "x", description: "", enabled: true } }),
      onClose() {},
      onChanged() {},
      onDeleted() {},
    }),
  );
  assert.match(html, /data-test-id="library-folder-detail"/);
  assert.match(html, /<h2>Brand kit<\/h2>/);
  assert.match(html, /data-library-folder-official=""[^]*官方 · 随官方更新/);
  for (const action of ["download", "copy", "delete"]) {
    assert.match(html, new RegExp(`data-library-folder-action="${action}"`), action);
  }
  assert.match(html, /role="switch"/);
  const viewOnly = renderToStaticMarkup(
    React.createElement(mod.LibraryFolderDetail, {
      folderId: "f2",
      initial: folder({ id: "f2", can_edit: false }),
      onClose() {},
      onChanged() {},
      onDeleted() {},
    }),
  );
  assert.doesNotMatch(viewOnly, /data-library-folder-action="delete"/);
});

test("source wiring: Library mounts the folders view for the folders category and leaves MyLibrary intact", () => {
  const artifact = readFileSync(new URL("../src/shell/ArtifactLibrary.tsx", import.meta.url), "utf8");
  assert.match(artifact, /import \{ LibraryFoldersPage \} from "\.\/library-folders"/);
  assert.match(artifact, /const showFolders = isLibraryFolderCategory\(myLibraryCategory\)/);
  assert.match(artifact, /hidden=\{showFolders\}/, "MyLibrary stays mounted (search/sort/list survive) while folders are shown");
  assert.match(artifact, /\| "folders"/);
  assert.match(artifact, /typeFilter === "folders"/, "legacy fill renderer also handles the folders filter");
  // 其它行为不变：MyLibrary 仍是 /library 的主体，页标题不变。
  assert.match(artifact, /<MyLibrary/);
  assert.match(artifact, /pageTitle="我的库"/);

  const folders = readFileSync(new URL("../src/shell/library-folders.tsx", import.meta.url), "utf8");
  assert.match(folders, /folderApi\.listFolders\(\{ scope: "mine" \}\)/);
  assert.match(folders, /folderApi\.importFolderZip\(file\)/);
  assert.match(folders, /folderApi\.deleteFolder\(/);
  assert.match(folders, /folderApi\.updateFolder\(folder\.id, \{ enabled: next \}\)/);
  assert.match(folders, /folderApi\.copyFolderToProject\(/);
  assert.match(folders, /folderApi\.downloadFromGateway\(/);
  assert.match(folders, /<FolderTreeViewer/);
  assert.match(folders, /<ConfirmDialog/);
  // 不可信内容：不许 innerHTML / eval，Markdown 只经 FolderTreeViewer（共享 Markdown，skipHtml）。
  assert.doesNotMatch(folders, /dangerouslySetInnerHTML|innerHTML\s*=|\beval\(|new Function|javascript:/);
});

test("every literal tt() key in the folders UI has all 16 translations", async () => {
  register("./ts-extension-loader.mjs", import.meta.url);
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const { SKO_W17_MESSAGES } = await import("../src/i18n/ui/messages/sko-w17-copy.ts");
  const locales = Object.keys(UI_MESSAGES).filter((locale) => locale !== "zh");
  assert.equal(locales.length, 16);
  const sources = ["library-folders.tsx", "ArtifactLibrary.tsx"].map((file) =>
    readFileSync(new URL(`../src/shell/${file}`, import.meta.url), "utf8"),
  );
  const keys = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(/\btt\(\s*"([^"]+)"/g)) keys.add(match[1]);
    for (const match of source.matchAll(/(?:title|body|description|text|error):\s*"([^"]*[一-鿿][^"]*)"/g)) keys.add(match[1]);
    for (const match of source.matchAll(/return "([^"]*[一-鿿][^"]*)"/g)) keys.add(match[1]);
  }
  keys.add("文件夹");
  assert.ok(keys.size > 30, `scanned ${keys.size} keys`);
  const missing = [];
  for (const key of keys) {
    for (const locale of locales) {
      if (!UI_MESSAGES[locale][key]) missing.push(`${locale}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
  for (const locale of locales) {
    for (const [zh, text] of Object.entries(SKO_W17_MESSAGES[locale])) {
      for (const slot of zh.match(/\{\w+\}/g) || []) assert.ok(text.includes(slot), `${locale} keeps ${slot} in ${zh}`);
      if (!["zh-TW", "ja"].includes(locale)) assert.doesNotMatch(text, /[一-鿿]/, `${locale} ${zh}`);
    }
  }
});
