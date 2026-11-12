import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

test("folder paths are preserved for 1,000 files without creating a zip", async () => {
  const calls = []; const queued = [];
  globalThis.__luFolderFiles = calls; globalThis.__luFolderQueue = queued;
  const module = await import(await compileModule("src/shell/library-folder-upload.ts", {
    "../lib/library-uploads": dataModule(`
      export async function createLibraryFolder(title){return {id:"folder-1",title};}
      export async function queueLibraryFile(file,opts){globalThis.__luFolderQueue.push({file,opts});}
      export async function uploadLibraryFile(file,opts){globalThis.__luFolderFiles.push({file,opts}); opts.onProgress(file.size); return {id:"f"};}
      export async function libraryRequest(){return {folder:{id:"folder-1",title:"project",file_count:1000}};}
    `),
  }));
  const entries = Array.from({ length: 1000 }, (_, i) => ({ path: `src/section-${i}/file.bin`, file: new File([String(i)], "file.bin") }));
  const result = await module.uploadDroppedFolder({ name: "project", entries });
  assert.equal(result.ok, true); assert.equal(result.folder.file_count, 1000);
  assert.equal(calls.length, 1000); assert.equal(queued.length, 1000);
  assert.deepEqual(calls.map((call) => call.opts.path), entries.map((entry) => entry.path));
  assert.ok(calls.every((call) => call.opts.folderId === "folder-1" && call.file.name === "file.bin"));
});

test("folder traversal paths are rejected before creating anything", async () => {
  const module = await import(await compileModule("src/shell/library-folder-upload.ts", {
    "../lib/library-uploads": dataModule('export function createLibraryFolder(){throw Error("must not call");} export function queueLibraryFile(){} export function uploadLibraryFile(){} export function libraryRequest(){}'),
  }));
  assert.equal((await module.uploadDroppedFolder({ name: "bad", entries: [{ path: "../escape", file: new File(["x"], "escape") }] })).ok, false);
});

