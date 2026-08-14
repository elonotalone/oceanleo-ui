// ============================================================================
// 闸：测试不许拿仓外绝对路径当夹具（带理由的显式登记除外）
// ----------------------------------------------------------------------------
// 为什么要有这道闸（W25，2026-08-05）
//
// 同一个毛病在这个仓里已经发生了五次，`verdicts/W22-red-list.md` 一次抓到四条：
//
//   · 第 10 条 `w13-advanced-editor-resilience.test.mjs` 读
//     `/opt/cursor-workspaces/oceandino/scratch/advanced-editors-hardening-2026-07-24/…`
//     —— `ce7e3bf`（2026-07-24）加的，那个 scratch 目录早没了；
//   · 第 12 条 `w7-aclass-composite-parse.test.mjs` 读
//     `/tmp/w7-aclass-rebuild/db-triples.json`
//     —— `32ee2bb`（2026-07-27）加的，`/tmp` 早清了。
//
// 形态完全一样：**写测试的人手边正好有一份文件，就直接把它的绝对路径写进了测试。**
// 那份文件在他的会话里活着，在别人的会话里、在明天，都不活着。
// 后果不是「一条断言失败」，是 `ENOENT` 抛在顶层，**整份测试文件一条断言都不执行** ——
// 静默失去覆盖，然后每个做收尾的人都要重查一遍它为什么红。
//
// 所以：`/tmp`、`scratch/`、家目录、任何仓外绝对路径，一律不许再当夹具。
// 夹具放 `tests/fixtures/`，跟着代码一起进版本库。
//
// 真有非进不可的（比如要跟另一个仓的源码对账），在下面 `REGISTERED` 里显式登记并写理由。
// 登记是给人看的判断留痕，不是绕过闸的后门：理由太短判红，登记了却已经不在了也判红。
// ============================================================================

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ts from "typescript";

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SELF = basename(fileURLToPath(import.meta.url));

/**
 * 文件系统根。只认这些开头才算「绝对路径」——
 * 仓里大量字符串以 `/` 开头但那是 HTTP 路由（`/workspace?tab=materials`、`/explore?app=`），
 * 不是文件路径，不该被这道闸碰。
 */
const FS_ROOTS = [
  "/tmp/",
  "/root/",
  "/home/",
  "/opt/",
  "/var/",
  "/etc/",
  "/usr/",
  "/mnt/",
  "/media/",
  "/srv/",
  "/private/",
  "~/",
];

/** 仓外路径以外，`scratch/` 目录本身也不许当夹具，哪怕有人把它挪成相对路径。 */
const SCRATCH = /(^|\/)scratch\//;

/**
 * 显式登记。**key 是路径原文，value 是理由（≥10 字）。**
 * 登记的判断口径：这份东西是不是**跟着版本库一起活着的长期存在**。
 * 是 → 可以登记；只是「我这台机器上现在有」→ 不许登记，搬进 `tests/fixtures/`。
 */
const REGISTERED = {
  "/root/projects/asset/lib/template-dna.ts":
    "asset 仓的套装 DNA（调色板 key/label/十个色位的权威），deck-packs.test.mjs 拿它验套装有没有对着权威漂移；asset 仓在 main 上长期存在，抄副本进来两边会一起漂移，那条用例本来就在缺仓时自己 skip",
  "/root/projects/oceanleo/backend/app/routers/template_materials_router.py":
    "后端仓的模板素材路由，深链契约要跟它对账；同上，跨仓对账不能抄副本",
  "/root/projects/oceanleo/backend":
    "上面那条后端路由的仓根，测试用它拼路径并在缺仓时优雅跳过，不是夹具本体",
  "/root/projects":
    "同上，探测同级仓是否存在用的目录前缀",
  "/tmp/oceanleo-ui-ffmpeg-probe.mp4":
    "ffmpeg 探针自己写出来的产物，不是读进来的夹具；测试先写后判，缺了会自己重造",
};

/** 读一份源码里所有字符串字面量（含无插值模板串）。**只取字面量，不取注释** —— */
/** 本文件自己的注释里就写满了 `/tmp` 和 `scratch/`，用正则扫全文会把说明文字也判红。 */
async function stringLiteralsIn(path) {
  const text = await readFile(path, "utf8");
  const sourceFile = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".ts") || path.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.JS,
  );
  const literals = [];
  const visit = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      literals.push({
        value: node.text,
        line:
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
            .line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return literals;
}

/**
 * 一条字符串字面量是不是「仓外文件系统路径」。
 * URL 一律不算：`file:///tmp/mesh.bin` 是
 * `media-source-integrity.test.mjs` 用来验「依赖协议不受支持」的反面数据，
 * 它从来不会被当路径打开，判它红是误伤。
 */
function offendingPathIn(value) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return "";
  if (SCRATCH.test(value)) return value;
  for (const root of FS_ROOTS) {
    // 根后面必须真的还有东西。光秃秃一个 `/home` 是页面路由
    // （`app-shell-model-visibility.test.mjs` 的可见性用例表里就有一排），
    // 不是任何人的夹具；把它判红是误伤。
    if (value.startsWith(root) && value.length > root.length) return value;
  }
  return "";
}

async function testSourceFiles() {
  const entries = await readdir(TESTS_DIR, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /\.(mjs|ts|tsx)$/.test(entry.name) &&
        entry.name !== SELF,
    )
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
}

/** 每条登记路径今天真的还被某份测试用着 → path[]；没人用了 → 空数组。 */
async function registeredUsage() {
  const usage = new Map(Object.keys(REGISTERED).map((key) => [key, []]));
  for (const file of await testSourceFiles()) {
    for (const { value } of await stringLiteralsIn(file)) {
      if (usage.has(value)) usage.get(value).push(basename(file));
    }
  }
  return usage;
}

test("没有测试拿未登记的仓外绝对路径当夹具", async () => {
  const offenders = [];
  for (const file of await testSourceFiles()) {
    for (const { value, line } of await stringLiteralsIn(file)) {
      const offending = offendingPathIn(value);
      if (!offending) continue;
      if (Object.hasOwn(REGISTERED, offending)) continue;
      offenders.push(`${basename(file)}:${line} → ${offending}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "夹具要放进 tests/fixtures/ 跟着版本库走。/tmp 与 scratch/ 一律不许当夹具 —— " +
      "它们在你的会话里活着，在别人的会话里是 ENOENT，而 ENOENT 抛在顶层会让整份测试" +
      "文件一条断言都不执行。真有跨仓对账这类非进不可的，登记进 REGISTERED 并写清理由。",
  );
});

test("每条登记都写了理由，且理由不是敷衍", async () => {
  const thin = [];
  for (const [path, reason] of Object.entries(REGISTERED)) {
    if (typeof reason !== "string" || reason.trim().length < 10) {
      thin.push(`${path} 的理由只有 ${String(reason ?? "").trim().length} 字`);
    }
  }
  assert.deepEqual(thin, [], "登记必须带 ≥10 字的理由，空登记等于没有闸");
});

test("登记表不许留死条目：登记了却没人用的要删掉", async () => {
  const usage = await registeredUsage();
  const dead = [...usage]
    .filter(([, files]) => files.length === 0)
    .map(([path]) => path);
  assert.deepEqual(
    dead,
    [],
    "这些路径已经没有任何测试在用了，把它们从 REGISTERED 里删掉 —— " +
      "让登记表烂掉正是这一族缺陷当初能潜伏 8 天的原因",
  );
});

test("反面用例：这道闸真的拦得住，也真的不误伤", () => {
  // 拦得住：红清单第 10、12 条那两条原文。
  assert.equal(
    offendingPathIn("/tmp/w7-aclass-rebuild/db-triples.json"),
    "/tmp/w7-aclass-rebuild/db-triples.json",
  );
  assert.equal(
    offendingPathIn(
      "/opt/cursor-workspaces/oceandino/scratch/advanced-editors-hardening-2026-07-24/V7-advanced/live_acceptance.py",
    ),
    "/opt/cursor-workspaces/oceandino/scratch/advanced-editors-hardening-2026-07-24/V7-advanced/live_acceptance.py",
  );
  assert.equal(offendingPathIn("~/fixtures/whatever.json"), "~/fixtures/whatever.json");
  // 相对的 scratch/ 也拦：换成相对路径不算解决问题。
  assert.equal(offendingPathIn("scratch/2026-07-24/out.json"), "scratch/2026-07-24/out.json");

  // 不误伤：HTTP 路由、URL、仓内相对路径。
  assert.equal(offendingPathIn("/workspace?tab=materials&mode=preview"), "");
  assert.equal(offendingPathIn("/explore?app=travel"), "");
  // `/home` 是页面路由，不是家目录；根后面没东西就不是路径。
  assert.equal(offendingPathIn("/home"), "");
  assert.equal(offendingPathIn("/tmp"), "");
  // 但它下面挂了段就是路径了 —— 证明上面两条绿不是因为闸对这些根失灵。
  assert.equal(offendingPathIn("/home/agent/fix.json"), "/home/agent/fix.json");
  assert.equal(offendingPathIn("file:///tmp/mesh.bin"), "");
  assert.equal(offendingPathIn("https://cdn.example/scene.gltf"), "");
  assert.equal(offendingPathIn("tests/fixtures/artifact-capability-triples.json"), "");
  assert.equal(offendingPathIn("src/shell/artifact-contract.ts"), "");
});

test("反面用例：闸是从字面量里取路径的，不会被注释里的例子骗到", async () => {
  const withCommentOnly = ts.createSourceFile(
    "sample.mjs",
    ['// 反例：不要再读 /tmp/whatever.json 了', 'const ok = "tests/fixtures/a.json";'].join("\n"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const literals = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node)) literals.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(withCommentOnly);
  assert.deepEqual(literals, ["tests/fixtures/a.json"]);
  assert.deepEqual(literals.filter((value) => offendingPathIn(value)), []);
  // 而同一个路径真写成字面量时，必须被拦下 —— 证明上面那条绿不是因为闸失灵。
  assert.equal(offendingPathIn("/tmp/whatever.json"), "/tmp/whatever.json");
});

test("闸扫的是整个 tests/ 目录，不是几个点名的文件", async () => {
  const files = await testSourceFiles();
  assert.ok(files.length > 150, `只扫到 ${files.length} 份测试源码，像是没走进目录`);
  assert.ok(
    files.some((file) => basename(file) === "w7-aclass-composite-parse.test.mjs"),
    "刚搬完夹具的那份不在扫描范围里，这道闸就白加了",
  );
  assert.ok(
    files.some((file) => basename(file) === "w13-advanced-editor-resilience.test.mjs"),
    "刚删掉 scratch 夹具的那份不在扫描范围里",
  );
});
