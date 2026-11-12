// UX wave 2026-11-07, LU-F: direct folder upload into Library.
// Direct folder session tests live in library-large-uploads.test.mjs.
// The drop walker remains shared with ProjectImportPanel. The drop walker is the one lifted out of
// ProjectImportPanel; its flat reader must keep returning what it always did.

import assert from "node:assert/strict";
import test from "node:test";


import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const dropped = await import(await compileModule("src/shell/dropped-entries.ts"));

function pickedFile(relativePath, text) {
  const file = new File([text], relativePath.split("/").pop());
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  return file;
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

test("large directory drops do not silently discard files after 60 000 entries", async () => {
  const many = (prefix, count) => Array.from({ length: count }, (_, i) => fileEntry(`${prefix}${i}.txt`, ""));
  const { transfer } = transferOf([dirEntry("a", many("a", 40_000), 1000), dirEntry("b", many("b", 30_000), 1000)]);
  const list = await dropped.readDroppedDirectories(transfer);
  assert.equal(list.length, 70_000);
  assert.equal(list[39_999].path, "a/a39999.txt");
  assert.equal(list[69_999].path, "b/b29999.txt");
});

test("an unreadable dropped file refuses the drop instead of uploading an incomplete folder", async () => {
  const unreadable = { name: "lost.txt", isFile: true, isDirectory: false, file(_done, error) { error(); } };
  const { transfer } = transferOf([dirEntry("folder", [fileEntry("good.txt"), unreadable])]);
  await assert.rejects(dropped.readDataTransfer(transfer), /无法读取文件：lost.txt/);
});

test("a browser without entry APIs can still drop a large plain file", async () => {
  const file = new File(["bytes"], "large.mp4");
  Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 * 1024 });
  const result = await dropped.readDataTransfer({ items: [{ kind: "file" }], files: [file] });
  assert.equal(result.files[0], file);
  assert.deepEqual(result.folders, []);
});
