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
  "/root/projects/oceanleo/backend/app/artifact_cover_gate.py":
    "后端仓的封面白名单权威，material-cover-rendering.test.mjs 拿它与本仓那份逐字比；与上面那条路由同一档，抄副本进来两张白名单会一起漂移，那条用例本来就在缺仓时明说跳过",
  "/root/projects/oceanleo/backend":
    "上面那条后端路由的仓根，测试用它拼路径并在缺仓时优雅跳过，不是夹具本体",
  "/root/projects":
    "同上，探测同级仓是否存在用的目录前缀",
  "/tmp/oceanleo-ui-ffmpeg-probe.mp4":
    "ffmpeg 探针自己写出来的产物，不是读进来的夹具；测试先写后判，缺了会自己重造",
  "/opt/cursor-workspaces/oceandino/docs/architecture/oceanleo-shell-spec-five-layers.md":
    "五层规范是 L4 chips 那八个标签的权威（§3 第 1 行），design-mode.test.mjs 拿它逐条对账；抄一份副本进来两边会各自漂移，而漂了就等于 chips 与规范不一致却没人发现。与上面几条跨仓对账同一档：oceandino 仓不在时那条用例自己 skip，不抛 ENOENT",
  // ── X9 2026-09-06 登记的跨仓契约（三份测试早于本闸就在读这些路径，闸立起来后一直红）──
  "/root/projects/oceandino/front/lib/editor-board-catalog.ts":
    "oceandino 控制面的编辑器看板目录，advanced-plugin-open.test.mjs 拿它与本仓 ADVANCED_PLUGIN_FEATURE_IDS 对账 13 件插件是否同一张名单；控制面仓在 main 上长期存在（/root/projects/oceandino 是 /opt/cursor-workspaces/oceandino 的软链），抄副本进来两张名单会各自漂移",
  "/root/projects/umo-hosted/src/bridge/tools-manifest.ts":
    "umo-hosted 仓（富文本托管叶子）的 RICHDOC_CHIPS 权威，quick-actions-chips.test.mjs 拿它八个 label 与本仓 fallbackChipLabels 对账；跨仓契约不能抄副本，否则两边一起漂移却没人发现",
  "/root/projects/umo-hosted/src/bridge/host-bridge.ts":
    "umo-hosted 仓的宿主桥实现，rich-doc-hosted-review.test.mjs 直接驱动**对端真实代码**验「agent 改文档必须过审阅」（W08 闸①行为层）；复述件验不了对端接线，所以只能跨仓 import",
  "/root/projects/umo-hosted/src/bridge/hosted-selection-wire.ts":
    "同上，umo-hosted 侧的选区指令路由入口，rich-doc-hosted-review.test.mjs 跑真实路由而不是自写复述件",
  "/root/projects/umo-hosted/src/bridge/protocol.ts":
    "同上，umo-hosted 侧的 EDITOR_PROTOCOL 常量，rich-doc-hosted-review.test.mjs 拿它与本仓 editor-protocol.ts 逐字对账",
  "/root/projects/umo-hosted/src/bridge/review.ts":
    "同上，umo-hosted 侧的 ReviewStore，rich-doc-hosted-review.test.mjs 用真实审阅存储跑完整条提案路",
  "/root/projects/umo-hosted/src/bridge/selection-command-route.ts":
    "同上，umo-hosted 侧的 mutatesDocument / requiresReview 判定，rich-doc-hosted-review.test.mjs 验对端判定与本仓协议一致",
  "/root/projects/umo-hosted/src/umo-commands.ts":
    "同上，umo-hosted 侧 SUPPORTED_CONTROL_IDS 权威，rich-doc-hosted-review.test.mjs 拿它对账指令面",
  "/root/projects/umo-hosted":
    "上面几条 umo-hosted 路径的仓根，rich-doc-hosted-review.test.mjs 用它拼 App.vue 路径做结构层判据（闸②），不是夹具本体",
};

/**
 * 不是夹具：这些绝对路径是**喂给纯函数的题材数据**，本进程一次都不会去打开它们。
 * 它们不可能 ENOENT，也就不落在这道闸要防的那类缺陷里。
 *
 * 与 `REGISTERED` 分成两张表，是因为两者问的问题不同：那张问「这份文件是不是跟着
 * 版本库长期活着」，这张问「这个字符串会不会被当成路径打开」。混成一张表，下一个人
 * 就会拿「反正登记一下」把真夹具塞进来，闸也就废了。
 *
 * 口径与 `REGISTERED` 一致：**按值逐条**登记、理由 ≥10 字、不许留死条目。
 */
const NOT_A_FIXTURE = {
  "/etc/passwd": "越权反例，喂给浏览器侧纯字符串函数 isInsideLocalRoot 判 false，本进程从不打开它",
  "/srv/inbox": "配对设备上的收件目录，只作为交接协议报文里的一个字段出现在对端，观看端不碰文件系统",
  "/srv/in": "同上，手机交接的对端目录，出现在文案与协议报文里",
  "/srv/in/a.jpg": "同上，对端落盘后回报的路径，只用来生成那句「已送到」的文案",
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

/** 两张表合起来才是「登记过的路径」全集。 */
const DECLARED = { ...REGISTERED, ...NOT_A_FIXTURE };

/** 每条登记路径今天真的还被某份测试用着 → path[]；没人用了 → 空数组。 */
async function registeredUsage() {
  const usage = new Map(Object.keys(DECLARED).map((key) => [key, []]));
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
      if (Object.hasOwn(DECLARED, offending)) continue;
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
  for (const [path, reason] of Object.entries(DECLARED)) {
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
