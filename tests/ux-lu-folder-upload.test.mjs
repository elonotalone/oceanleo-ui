// UX wave 2026-11-07, LU-F: direct folder upload into Library.
// A picked (`webkitdirectory`) or dropped folder is zipped in the browser with
// fflate and sent through the existing `folderApi.importFolderZip`; the 20 MB cap
// applies to the zipped size. The drop walker is the one lifted out of
// ProjectImportPanel; its flat reader must keep returning what it always did.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { unzipSync } from "fflate";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const folderApiStub = dataModule(`
export const folderApi = {
  importFolderZip: (...args) => globalThis.__luFolderApi.importFolderZip(...args),
};`);

const upload = await import(
  await compileModule("src/shell/library-folder-upload.ts", {
    "./skills/kit/folder-api": folderApiStub,
  })
);
const dropped = await import(await compileModule("src/shell/dropped-entries.ts"));

const MB = 1024 * 1024;
const encoder = new TextEncoder();

function api(result) {
  const calls = [];
  globalThis.__luFolderApi = {
    importFolderZip: async (...args) => {
      calls.push(args);
      return result;
    },
  };
  return calls;
}

function withWindow(run) {
  const previous = globalThis.window;
  globalThis.window = new EventTarget();
  return Promise.resolve()
    .then(() => run(globalThis.window))
    .finally(() => {
      if (previous === undefined) delete globalThis.window;
      else globalThis.window = previous;
    });
}

function pickedFile(relativePath, text) {
  const file = new File([text], relativePath.split("/").pop());
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  return file;
}

function entry(path, text) {
  return { path, file: new File([text], path.split("/").pop()) };
}

async function unzipFile(file) {
  return unzipSync(new Uint8Array(await file.arrayBuffer()));
}

// --- fake FileSystemEntry trees -------------------------------------------------

function fileEntry(name, text = name) {
  const file = new File([text], name);
  return {
    name,
    isFile: true,
    isDirectory: false,
    file: (onSuccess) => queueMicrotask(() => onSuccess(file)),
  };
}

/** `readEntries` hands out `batchSize` children per call, then `[]` forever. */
function dirEntry(name, children, batchSize = 2) {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader() {
      let offset = 0;
      return {
        readEntries(onSuccess) {
          const batch = children.slice(offset, offset + batchSize);
          offset += batch.length;
          queueMicrotask(() => onSuccess(batch));
        },
      };
    },
  };
}

/**
 * A DataTransfer whose items die once the drop event is over, like the real one:
 * `end()` is called right after the reader is invoked, before any await settles.
 */
function transferOf(roots) {
  let live = true;
  const items = [
    ...roots.map((root) => ({ kind: "file", webkitGetAsEntry: () => (live ? root : null) })),
    { kind: "string", webkitGetAsEntry: () => null },
  ];
  return {
    transfer: {
      get items() {
        return live ? items : [];
      },
    },
    end: () => {
      live = false;
    },
  };
}

function sampleTree() {
  return [
    fileEntry("notes.txt"),
    dirEntry("site", [
      fileEntry("index.html"),
      dirEntry("src", [fileEntry("a.js"), fileEntry("b.js"), dirEntry("lib", [fileEntry("c.js")])]),
      dirEntry("empty", []),
      fileEntry("README.md"),
    ]),
    fileEntry("logo.png"),
    dirEntry("docs", [fileEntry("guide.md")], 1),
  ];
}

async function flatten(list) {
  return Promise.all(list.map(async ({ path, file }) => [path, file.name, await file.text()]));
}

// --- directory input -----------------------------------------------------------

test("directory input groups files by the picked folder, paths relative to it", () => {
  const files = [
    pickedFile("site/index.html", "<h1>hi</h1>"),
    pickedFile("site/src/app.js", "app"),
    pickedFile("报告/第一章.md", "一"),
    pickedFile("site/src/lib/util.js", "util"),
    pickedFile("loose.txt", "not from a folder pick"),
  ];
  const folders = dropped.foldersFromDirectoryInput(files);
  assert.deepEqual(
    folders.map((folder) => [folder.name, folder.entries.map((item) => item.path)]),
    [
      ["site", ["index.html", "src/app.js", "src/lib/util.js"]],
      ["报告", ["第一章.md"]],
    ],
  );
  assert.equal(folders[0].entries[1].file, files[1]);
  assert.deepEqual(dropped.foldersFromDirectoryInput([]), []);
});

// --- zip layout ----------------------------------------------------------------

test("zip is <name>.zip with every file under one top-level <name>/ directory", async () => {
  const zip = await upload.zipDroppedFolder({
    name: "我的项目",
    entries: [entry("README.md", "# 标题"), entry("src/app/page.tsx", "export {}"), entry("a b/c.txt", "c")],
  });
  assert.ok(zip instanceof File);
  assert.equal(zip.name, "我的项目.zip");
  assert.equal(zip.type, "application/zip");
  const unpacked = await unzipFile(zip);
  assert.deepEqual(Object.keys(unpacked), ["我的项目/README.md", "我的项目/src/app/page.tsx", "我的项目/a b/c.txt"]);
  assert.deepEqual(unpacked["我的项目/README.md"], encoder.encode("# 标题"));
  assert.deepEqual(unpacked["我的项目/src/app/page.tsx"], encoder.encode("export {}"));
  assert.deepEqual(unpacked["我的项目/a b/c.txt"], encoder.encode("c"));
});

test("a folder holding one subfolder keeps that subfolder inside the top directory", async () => {
  const bytes = randomBytes(4096);
  const zip = await upload.zipDroppedFolder({
    name: "site",
    entries: [{ path: "src/logo.bin", file: new File([bytes], "logo.bin") }],
  });
  const unpacked = await unzipFile(zip);
  assert.deepEqual(Object.keys(unpacked), ["site/src/logo.bin"]);
  assert.deepEqual(Buffer.from(unpacked["site/src/logo.bin"]), bytes);
});

// --- upload --------------------------------------------------------------------

test("over 20 MB once zipped: plain error, the API is never called", async () => {
  const calls = api({ ok: true, data: { id: "never" } });
  const phases = [];
  const result = await upload.uploadDroppedFolder(
    { name: "media", entries: [{ path: "noise.bin", file: new File([randomBytes(21 * MB)], "noise.bin") }] },
    { onPhase: (phase) => phases.push(phase) },
  );
  assert.deepEqual(result, { ok: false, error: "文件夹太大：压缩后超过 20 MB" });
  assert.equal(calls.length, 0);
  assert.deepEqual(phases, ["zipping"]);
  assert.equal(upload.FOLDER_UPLOAD_MAX_BYTES, 20 * MB);
});

test("the cap is on the zipped size: 30 MB that zips small is uploaded", async () => {
  const folderRow = { id: "f-big", title: "logs" };
  const calls = api({ ok: true, data: folderRow });
  await withWindow(async () => {
    const result = await upload.uploadDroppedFolder({
      name: "logs",
      entries: [{ path: "zeros.log", file: new File([new Uint8Array(30 * MB)], "zeros.log") }],
    });
    assert.deepEqual(result, { ok: true, folder: folderRow });
  });
  assert.equal(calls.length, 1);
  const [sent] = calls[0];
  assert.ok(sent.size < upload.FOLDER_UPLOAD_MAX_BYTES);
  assert.equal(calls[0].length, 1, "no project id is passed");
});

test("an API error is returned verbatim and nothing is announced", async () => {
  const failure = { ok: false, error: "压缩包里有不安全的路径，已拒绝导入", code: "unsafe_path", status: 400 };
  api(failure);
  await withWindow(async (win) => {
    let fired = 0;
    win.addEventListener(upload.LIBRARY_FOLDERS_CHANGE_EVENT, () => {
      fired += 1;
    });
    const result = await upload.uploadDroppedFolder({ name: "x", entries: [entry("a.txt", "a")] });
    assert.deepEqual(result, { ok: false, error: failure.error });
    assert.equal(fired, 0);
  });
});

test("success sends <name>.zip through importFolderZip and dispatches the change event", async () => {
  const folderRow = { id: "f1", title: "brand-kit", skill: null };
  const calls = api({ ok: true, data: folderRow });
  const phases = [];
  await withWindow(async (win) => {
    const events = [];
    win.addEventListener(upload.LIBRARY_FOLDERS_CHANGE_EVENT, (event) => events.push(event));
    const result = await upload.uploadDroppedFolder(
      { name: "brand-kit", entries: [entry("logo.svg", "<svg/>"), entry("fonts/a.woff2", "font")] },
      { onPhase: (phase) => phases.push(phase) },
    );
    assert.deepEqual(result, { ok: true, folder: folderRow });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "oceanleo:library-folders-change");
    assert.equal(events[0].detail.folder, folderRow);
  });
  assert.equal(upload.LIBRARY_FOLDERS_CHANGE_EVENT, "oceanleo:library-folders-change");
  assert.deepEqual(phases, ["zipping", "uploading"]);
  assert.equal(calls.length, 1);
  const [sent] = calls[0];
  assert.equal(sent.name, "brand-kit.zip");
  assert.equal(sent.type, "application/zip");
  assert.deepEqual(Object.keys(await unzipFile(sent)), ["brand-kit/logo.svg", "brand-kit/fonts/a.woff2"]);
});

test("an empty folder is refused before zipping", async () => {
  const calls = api({ ok: true, data: {} });
  const phases = [];
  const result = await upload.uploadDroppedFolder(
    { name: "empty", entries: [] },
    { onPhase: (phase) => phases.push(phase) },
  );
  assert.deepEqual(result, { ok: false, error: "这个文件夹是空的" });
  assert.equal(calls.length, 0);
  assert.deepEqual(phases, []);
});

test("a file the browser can no longer read returns the browser's message", async () => {
  const calls = api({ ok: true, data: {} });
  const gone = { name: "gone.txt", arrayBuffer: () => Promise.reject(new Error("The file could not be read")) };
  const result = await upload.uploadDroppedFolder({ name: "x", entries: [{ path: "gone.txt", file: gone }] });
  assert.deepEqual(result, { ok: false, error: "The file could not be read" });
  assert.equal(calls.length, 0);
});

// --- canPickFolder -------------------------------------------------------------

test("canPickFolder needs webkitdirectory and a fine primary pointer", () => {
  const saved = { window: globalThis.window, document: globalThis.document };
  const setEnv = ({ directory, fine }) => {
    globalThis.document = {
      createElement: () => (directory ? { webkitdirectory: false } : {}),
    };
    globalThis.window = {
      matchMedia: (query) => ({ matches: query === "(pointer: fine)" && fine }),
    };
  };
  try {
    delete globalThis.window;
    delete globalThis.document;
    assert.equal(dropped.canPickFolder(), false, "server render");
    setEnv({ directory: true, fine: true });
    assert.equal(dropped.canPickFolder(), true, "desktop");
    setEnv({ directory: true, fine: false });
    assert.equal(dropped.canPickFolder(), false, "phone: property present, coarse pointer");
    setEnv({ directory: false, fine: true });
    assert.equal(dropped.canPickFolder(), false, "no webkitdirectory");
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

// --- drop walker ---------------------------------------------------------------

test("readDataTransfer splits loose files and folders, batching readEntries until empty", async () => {
  const { transfer, end } = transferOf(sampleTree());
  const pending = dropped.readDataTransfer(transfer);
  end(); // the drop event is over; entries must already have been taken
  const { files, folders } = await pending;
  assert.deepEqual(
    files.map((file) => file.name),
    ["notes.txt", "logo.png"],
  );
  assert.deepEqual(
    await Promise.all(
      folders.map(async (folder) => [folder.name, (await flatten(folder.entries)).map(([path]) => path)]),
    ),
    [
      ["site", ["index.html", "src/a.js", "src/b.js", "src/lib/c.js", "README.md"]],
      ["docs", ["guide.md"]],
    ],
  );
  assert.equal(await folders[0].entries[3].file.text(), "c.js");
});

test("readDataTransfer keeps an empty dropped folder so the caller can say it is empty", async () => {
  const { transfer } = transferOf([dirEntry("blank", [])]);
  assert.deepEqual(await dropped.readDataTransfer(transfer), { files: [], folders: [{ name: "blank", entries: [] }] });
  assert.deepEqual(await dropped.readDataTransfer(null), { files: [], folders: [] });
});

test("legacy flat reader returns the same list ProjectImportPanel always got", async () => {
  const { transfer, end } = transferOf(sampleTree());
  const pending = dropped.readDroppedDirectories(transfer);
  end();
  // Expected list recorded from the pre-lift ProjectImportPanel walker (base 70d6e5e4).
  assert.deepEqual(await flatten(await pending), [
    ["notes.txt", "notes.txt", "notes.txt"],
    ["site/index.html", "index.html", "index.html"],
    ["site/src/a.js", "a.js", "a.js"],
    ["site/src/b.js", "b.js", "b.js"],
    ["site/src/lib/c.js", "c.js", "c.js"],
    ["site/README.md", "README.md", "README.md"],
    ["logo.png", "logo.png", "logo.png"],
    ["docs/guide.md", "guide.md", "guide.md"],
  ]);
  assert.deepEqual(await dropped.readDroppedDirectories(null), []);
});

test("legacy flat reader still stops at 60 000 files across all roots", async () => {
  const many = (prefix, count) => Array.from({ length: count }, (_, i) => fileEntry(`${prefix}${i}.txt`, ""));
  const { transfer } = transferOf([dirEntry("a", many("a", 40_000), 1000), dirEntry("b", many("b", 30_000), 1000)]);
  const list = await dropped.readDroppedDirectories(transfer);
  assert.equal(list.length, 60_000);
  assert.equal(list[39_999].path, "a/a39999.txt");
  assert.equal(list[59_999].path, "b/b19999.txt");
});
