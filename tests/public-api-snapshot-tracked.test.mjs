// ============================================================================
// 判据 ④ —— 公开面快照只许描述**已入库**的东西（W45，2026-09-01）
// ----------------------------------------------------------------------------
// 这道门禁本来是绿的：`c1a9951^` 上是 35 对 35。`9550c45` 往 `package.json`
// 的 `exports` 里加了 11 条却没重生成快照，从那一刻起 `npm run api:check` 一直红。
//
// 但「把快照重生成一遍」这个动作本身是有毒的，因为它会**照单全收**：
// `9550c45` 同时还把两条入口指向了**没入库的文件**（`./shell/plugin-ai` 与
// `./shell/plugin-store`）。那一类坏 main 在本机看不出来——文件就在盘上，
// `tsc` 和 `node` 都找得到——但新克隆与 CI 必炸。`ffc84c2` 的话说得最准：
// 校验脚本当时用 `os.path.exists` 查「盘上」，**应当用 `git ls-tree -r HEAD`
// 查「库里」**。它已经把那两条分别处置掉了（plugin-ai 补 barrel、plugin-store 撤入口）。
//
// 所以这份判据锁的不是「快照内容对不对」（`--check` 自己会比字节），
// 而是**快照有没有资格被信任**：它描述的每一条路径，都必须在 HEAD 上真实存在。
// 少了这一条，「重生成快照」就成了把未入库的 export 洗白的最短路径——
// 门禁转绿，坏 main 原样留在库里，而且从此再没人看得见。
//
// 四条读数，从外到内：
//   1. `package.json` 的每个 export 目标都在 HEAD 上（`ffc84c2` 那一类的正面拦截）
//   2. 快照的每个 entrypoint 目标都在 HEAD 上
//   3. 每个 entrypoint 里的每条相对 `source` 都解析得到 HEAD 上的文件
//   4. 快照与生成器同步（`--check` 的等价物，顺带保证 1-3 描述的是当前这份）
//
// 「盘上」一律不作数：全程只问 `git ls-tree -r HEAD`，一次 `existsSync` 都不用。
// 这正是 `ffc84c2` 复盘里点名的那处口径错误，不重犯。
// ============================================================================

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// 解析一个模块说明符可能落到的文件名。`public-api-snapshot.mjs` 只解析
// entrypoint 文件本身、不跟着 `source` 往下走，所以这里要自己补一遍查找顺序；
// `.css` 是因为 exports 表里确实有纯样式入口（`route-transition.css`）。
const RESOLVE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".d.ts",
  ".css",
  ".js",
  ".mjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

function trackedFilesAtHead() {
  try {
    const out = execFileSync("git", ["ls-tree", "-r", "HEAD", "--name-only"], {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return new Set(out.split("\n").filter(Boolean));
  } catch (error) {
    return { error };
  }
}

// git 不在盘上、或这里不是一个 git 检出时**明说跳过并打印原因**，不假装绿。
// 与 `5094c70` 给浏览器探针定的口径一致：拿不到读数就说拿不到。
function requireHead(t) {
  const tracked = trackedFilesAtHead();
  if (tracked instanceof Set) {
    return tracked;
  }
  t.skip(
    `拿不到 git ls-tree -r HEAD 的读数，本判据无法判断「在不在库里」：${
      tracked.error?.message ?? tracked.error
    }`,
  );
  return null;
}

function resolveAgainstHead(tracked, fromDir, specifier) {
  const base = path.posix.normalize(path.posix.join(fromDir, specifier));
  return RESOLVE_SUFFIXES.some((suffix) => tracked.has(base + suffix));
}

function repoRelative(target) {
  return target.replace(/^\.\//, "");
}

function readPackageJson() {
  return JSON.parse(
    readFileSync(path.join(packageRoot, "package.json"), "utf8"),
  );
}

function readSnapshot() {
  return JSON.parse(
    readFileSync(
      path.join(packageRoot, "src/architecture/public-api.snapshot.json"),
      "utf8",
    ),
  );
}

test("package.json 的每条 exports 目标都在 HEAD 上（不许指向未入库文件）", (t) => {
  const tracked = requireHead(t);
  if (!tracked) return;

  const { exports: exportsMap } = readPackageJson();
  const offenders = [];
  for (const [specifier, target] of Object.entries(exportsMap)) {
    if (typeof target !== "string") continue;
    if (!tracked.has(repoRelative(target))) {
      offenders.push(`${specifier} -> ${target}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "这些 exports 入口指向 git ls-tree -r HEAD 上不存在的文件——" +
      "本机看不出来（文件在盘上），新克隆与 CI 必炸，与 ffc84c2 修的是同一失效类：\n  " +
      offenders.join("\n  "),
  );
});

test("快照的每个 entrypoint 目标都在 HEAD 上", (t) => {
  const tracked = requireHead(t);
  if (!tracked) return;

  const snapshot = readSnapshot();
  const offenders = [];
  for (const [specifier, info] of Object.entries(snapshot.entrypoints)) {
    if (!tracked.has(repoRelative(info.target))) {
      offenders.push(`${specifier} -> ${info.target}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "快照描述了未入库的 entrypoint。重生成快照不许把未入库的 export 洗白：\n  " +
      offenders.join("\n  "),
  );
});

test("快照里每条相对 source 都解析得到 HEAD 上的文件", (t) => {
  const tracked = requireHead(t);
  if (!tracked) return;

  const snapshot = readSnapshot();
  const offenders = [];
  let checked = 0;
  for (const [specifier, info] of Object.entries(snapshot.entrypoints)) {
    const fromDir = path.posix.dirname(repoRelative(info.target));
    for (const declaration of info.declarations) {
      const source = declaration.source;
      if (!source || !source.startsWith(".")) continue;
      checked += 1;
      if (!resolveAgainstHead(tracked, fromDir, source)) {
        offenders.push(`${specifier}: ${source}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "这些 re-export 的来源在 HEAD 上不存在：\n  " + offenders.join("\n  "),
  );
  // 解析了 0 条只能说明上面那个循环没跑起来，不能说明「都合格」。
  assert.ok(
    checked > 100,
    `只解析到 ${checked} 条相对 source，判据自身失效了（结构性假绿）`,
  );
});

test("快照与生成器同步：每个 ts/tsx 入口都有 entrypoint 块，且没有多余块", () => {
  const { exports: exportsMap } = readPackageJson();
  const snapshot = readSnapshot();

  const expected = Object.entries(exportsMap)
    .filter(
      ([, target]) =>
        typeof target === "string" && /\.tsx?$/.test(path.extname(target)),
    )
    .map(([specifier]) => specifier)
    .sort();
  const actual = Object.keys(snapshot.entrypoints).sort();

  assert.deepEqual(
    actual,
    expected,
    "快照的 entrypoint 集合与 package.json 的 ts/tsx 入口对不上——" +
      "快照过期了，跑 `npm run api:snapshot`",
  );
  assert.deepEqual(
    Object.keys(snapshot.packageExports).sort(),
    Object.keys(exportsMap).sort(),
    "快照的 packageExports 与 package.json 的 exports 对不上——" +
      "快照过期了，跑 `npm run api:snapshot`",
  );
});
