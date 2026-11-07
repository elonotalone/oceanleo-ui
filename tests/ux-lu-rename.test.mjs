// 2026-11-07 UX 波 LU-R（操作员裁定 rulings §4 "Computer-task UX wave" (6)）：
// Library 有了「我的创作 / 上传的 / 来自 LeoBay / 来自 LeoChat」四个默认分区，旧的
// 「文件夹」类别（`/v1/folders` 的文件树条目与技能）对用户改叫「文件包」——只改文案：
// id、路由、URL 参数、接口字段、函数名都还是 folders。设备与本地文件树里的真文件夹仍叫「文件夹」。

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
// 改名前的样子取本波起点（oceanleo-ui 70d6e5e4，v0.246.1），不取 HEAD：这批改动一提交，HEAD 就是改名后的样子。
const BASE_COMMIT = "70d6e5e4";

const contractUrl = await compileModule("src/shell/artifact-contract.ts");
const taxonomy = await import(
  await compileModule("src/shell/library-editor-category.ts", { "./artifact-contract": contractUrl })
);

const LOCALES = ["zh", "en", "de", "es", "es-419", "fr", "it", "pt-BR", "pt-PT", "vi", "tr", "zh-TW", "ja", "ko", "ar", "th", "hi"];

/** 各语种改名前用的「文件夹」一词（改名前的每条值都必须含它，见下面的基线自检）。 */
const FOLDER_WORD = {
  zh: "文件夹", en: "folder", de: "Ordner", es: "carpeta", "es-419": "carpeta", fr: "dossier",
  it: "cartell", "pt-BR": "pasta", "pt-PT": "pasta", vi: "thư mục", tr: "klasör", "zh-TW": "資料夾",
  ja: "フォルダ", ko: "폴더", ar: "مجلد", th: "โฟลเดอร์", hi: "फ़ोल्डर",
};
/** 各语种「文件包」一词：明显不是该语种的「文件夹」。 */
const BUNDLE_WORD = {
  zh: "文件包", en: "bundle", de: "Dateipaket", es: "paquete", "es-419": "paquete", fr: "paquet",
  it: "pacchett", "pt-BR": "pacote", "pt-PT": "pacote", vi: "gói tệp", tr: "dosya paket", "zh-TW": "檔案包",
  ja: "ファイルパック", ko: "파일 묶음", ar: "حزم", th: "แพ็กไฟล์", hi: "फ़ाइल पैक",
};

const COPY_FILES = {
  "src/i18n/ui/messages/sko-w17-copy.ts": [
    "folderCount", "folderUploaded", "untitledFolder", "openFolder", "deleteFolderQ", "uploadingFolder",
    "uploadFolderZip", "signInFolders", "foldersUnavailable", "signInFoldersBody", "noFolders", "noFoldersBody",
    "folderDeleted", "viewAllFolders",
  ],
  "src/i18n/ui/messages/sko-w09a-copy.ts": ["downloadFolder", "emptyFolder", "errNotFound", "errQuota"],
};
/** 这句里说的是用户要上传的那个真文件夹：恰好提一次「文件夹」，其余一律是「文件包」。 */
const MENTIONS_REAL_FOLDER = new Set(["noFoldersBody"]);
/** 给选不了文件夹的设备用的 .zip 选择器：既不叫文件夹也不叫文件包。 */
const ZIP_PICKER = new Set(["uploadFolderZip"]);

const norm = (text) => String(text).normalize("NFC");
const count = (text, word) => norm(text).toLowerCase().split(norm(word).toLowerCase()).length - 1;

// 按 key 名（而不是按中文原文）索引的分表：用桩替掉 assembleCopy，两个版本才能逐条对照。
const RAW_ASSEMBLE = dataModule(
  "export function assembleCopy(source, translations) { return { zh: source, ...translations }; }",
);
async function rawCopy(text) {
  const swapped = text.replace(/from "\.\/shell-overhaul-copy-shared"/, `from "${RAW_ASSEMBLE}"`);
  assert.notEqual(swapped, text, "copy file imports assembleCopy from the shared skeleton");
  const js = ts.transpileModule(swapped, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = await import(dataModule(js));
  const table = Object.values(mod).find((value) => value && typeof value === "object" && "zh" in value && "en" in value);
  assert.ok(table, "copy file exports an assembled table");
  return table;
}
const baseText = (path) =>
  execFileSync("git", ["show", `${BASE_COMMIT}:${path}`], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const currentText = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const COPIES = await Promise.all(
  Object.entries(COPY_FILES).map(async ([path, keys]) => ({
    path,
    keys,
    before: await rawCopy(baseText(path)),
    after: await rawCopy(currentText(path)),
  })),
);

test("the Library category is called 文件包; its id, filter and URL value stay folders", () => {
  assert.equal(taxonomy.LIBRARY_FOLDER_CATEGORY_ID, "folders");
  assert.deepEqual(
    { ...taxonomy.LIBRARY_FOLDER_CATEGORY },
    { value: "folders", label: "文件包", typeLabel: "文件包", filter: "folders" },
  );
  assert.deepEqual(taxonomy.LIBRARY_EDITOR_CATEGORIES.at(-1), taxonomy.LIBRARY_FOLDER_CATEGORY);
  assert.equal(taxonomy.LIBRARY_EDITOR_CATEGORIES.some((row) => row.label === "文件夹" || row.typeLabel === "文件夹"), false);
  assert.equal(taxonomy.libraryCategoryLabel("folders"), "文件包");
});

test("normalizeLibraryCategory takes the new name and the old one", () => {
  for (const alias of ["文件包", "文件夹", "folders", "folder"]) {
    assert.equal(taxonomy.normalizeLibraryCategory(alias), "folders", alias);
    assert.equal(taxonomy.isLibraryFolderCategory(alias), true, alias);
  }
  assert.equal(taxonomy.libraryCategoryLabel("文件夹"), "文件包");
});

test("every renamed copy key has all 16 locales and none still uses that locale's word for folder", () => {
  for (const { path, keys, before, after } of COPIES) {
    assert.deepEqual(Object.keys(after).sort(), [...LOCALES].sort(), path);
    for (const locale of LOCALES) {
      for (const key of keys) {
        const old = before[locale][key];
        const now = after[locale][key];
        const where = `${path} ${locale}.${key}: ${now}`;
        // 基线自检：词表确实是改名前这条用的词。
        assert.ok(count(old, FOLDER_WORD[locale]) >= 1, `${path} ${locale}.${key} used to say ${FOLDER_WORD[locale]}: ${old}`);
        assert.equal(typeof now, "string", where);
        assert.ok(now.trim() && now !== old, where);
        assert.deepEqual((now.match(/\{\w+\}/g) || []).sort(), (old.match(/\{\w+\}/g) || []).sort(), where);
        if (MENTIONS_REAL_FOLDER.has(key)) {
          assert.equal(count(now, FOLDER_WORD[locale]), 1, `${where} — names the real folder you upload, once`);
        } else {
          assert.equal(count(now, FOLDER_WORD[locale]), 0, where);
        }
        if (ZIP_PICKER.has(key)) assert.match(now, /\.zip/, where);
        else assert.ok(count(now, BUNDLE_WORD[locale]) >= 1, `${where} — says ${BUNDLE_WORD[locale]}`);
      }
    }
  }
});

test("keys that do not name the category are untouched", () => {
  for (const { path, keys, before, after } of COPIES) {
    const renamed = new Set(keys);
    for (const locale of LOCALES) {
      assert.deepEqual(Object.keys(after[locale]).sort(), Object.keys(before[locale]).sort(), `${path} ${locale}`);
      for (const key of Object.keys(before[locale])) {
        if (!renamed.has(key)) assert.equal(after[locale][key], before[locale][key], `${path} ${locale}.${key}`);
      }
    }
  }
});

test("the Library bundle UI no longer asks for the old keys", () => {
  // 「这个文件夹是空的」 stays legitimately: it now names a real folder the user picked or dropped that has no files.
  const oldKeys = COPIES.flatMap(({ keys, before }) => keys.map((key) => before.zh[key])).filter(
    (key) => key !== "这个文件夹是空的",
  );
  const files = [
    "src/shell/library-folders.tsx",
    "src/shell/ArtifactLibrary.tsx",
    "src/shell/skills/kit/FolderTreeViewer.tsx",
    "src/shell/skills/kit/folder-api.ts",
  ];
  for (const file of files) {
    const source = currentText(file);
    for (const key of oldKeys) assert.equal(source.includes(`"${key}"`), false, `${file} still uses "${key}"`);
  }
  const folders = currentText("src/shell/library-folders.tsx");
  assert.doesNotMatch(folders, /tt\("文件夹"\)/);
  assert.match(folders, /aria-label=\{tt\("文件包"\)\}/);
  assert.match(folders, />\{tt\("文件包"\)\}<\/p>/);
});
