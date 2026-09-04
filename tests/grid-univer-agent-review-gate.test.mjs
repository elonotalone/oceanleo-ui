/**
 * V3-red-3 的复发闸：**agent 绕过审阅直接写格，当场红。**
 *
 * 这条闸盯的不是「代码长什么样」，是一件可观测的事：给 agent 指令面下一条会改
 * 表格的指令，**真 Facade 上的写方法被调用了几次**。答案必须是 0，直到用户在
 * 审阅面板点了接受为止。
 *
 * ## 为什么要有 §0 的自检
 *
 * 「零次写入」是本仓最贵的一类断言（`_COMMON.md` §6）：一个坏掉的录制器、一个
 * 名字写错的写方法清单，都会让它**永远绿**，而它保护的东西一天都没被守住。
 * V1-red-1 就是这么来的（撤掉开关 JSX，8/8 仍绿）。所以 §0 先用**未经闸门的**
 * `runGridUniverCommand` 直捅端口，证明录制器真的记得到写；§0 不绿，下面全部作废。
 *
 * ## 判 HEAD 不判工作树
 *
 * §3 的源码结构断言用 `git show HEAD:`（`_COMMON.md` §7b⑪/⑪b）：共享树上挂着
 * 十几位同事的在途改动，照工作树扫会把别人的半成品当成已入库。
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
  GRID_UNIVER_COMMANDS,
  runGridUniverCommand,
} from "../src/shell/doc-editors/grid-univer/facade-commands.ts";
import {
  GRID_APPLY_TOKEN_KEY,
  GRID_NO_INVERSE,
  gridAgentCommandSpecs,
  gridMutatingAgentCommandIds,
  resetGridApplyTokens,
  runGridAgentCommand,
} from "../src/shell/doc-editors/grid-univer/agent-write-gate.ts";
import { submitAgentReviewProposal } from "../src/shell/agent-review/inbox.ts";
import { hostReviewSession } from "../src/shell/agent-review/session.ts";
import { applyParkedReview } from "../src/shell/agent-review/gate.ts";

const STAGE = "src/shell/doc-editors/GridUniverStage.tsx";

/**
 * 真 Facade 上**会改文档**的方法全名单。
 *
 * 读方法（`getValue` / `getRange` / `getFilter` …）刻意不在里面：`grid.set-cell`
 * 造提案时要读一次原值给审阅面板显示「A1: 旧值 → 新值」，那是读，不算破戒。
 */
const WRITE_METHODS = new Set([
  "setValue",
  "setFontWeight",
  "setFontColor",
  "setBackgroundColor",
  "setHorizontalAlignment",
  "setNumberFormat",
  "merge",
  "breakApart",
  "createFilter",
  "setDataValidation",
  "clearConditionalFormatRules",
  "insertRowsBefore",
  "insertRowsAfter",
  "deleteRows",
  "insertColumnsBefore",
  "insertColumnsAfter",
  "deleteColumns",
  "sort",
  "insertSheet",
  "cf.build",
  "filter.setColumnFilterCriteria",
  "filter.removeColumnFilterCriteria",
  "filter.remove",
]);

/**
 * 遍历用的参数超集：让每条命令都拿得到它要的那几个键。
 *
 * `value` 这个键在不同命令里含义不同（对齐方式 / 格式预设 id / 单元格内容…），
 * 一个超集喂不下去 —— 下面 `ARG_OVERRIDES` 就是补这个的。**这不是凑数**：
 * §0 第二条自检最早跑出来的红就是 `align` 与 `numfmt-preset` 拿 `value:"5"`
 * 时执行器走 `return null`、一次写都没有，于是 §1 对它俩本来会是**空转绿**。
 */
const ARGS = {
  row: 0,
  column: 0,
  count: 1,
  value: "5",
  value2: "9",
  name: "新表",
  direction: "asc",
  operator: "greater-than",
  kind: "whole",
  behavior: "warn",
  type: "number",
  decimals: 2,
  color: "#ff0000",
  background: "#ffffff",
  on: true,
};

/** `value` 语义与超集冲突的那几条，逐条给真取值。 */
const ARG_OVERRIDES = {
  align: { value: "center" },
  "numfmt-preset": { value: "decimal2" },
};

function argsFor(id) {
  return { ...ARGS, ...(ARG_OVERRIDES[id] || {}) };
}

function recordingPort() {
  const calls = [];
  const cells = new Map([["0:0", "旧值"]]);
  const hit = (name, args) => {
    calls.push({ name, args });
  };
  const write = (name) => (...args) => {
    hit(name, args);
    return undefined;
  };

  const filter = {
    setColumnFilterCriteria: write("filter.setColumnFilterCriteria"),
    removeColumnFilterCriteria: write("filter.removeColumnFilterCriteria"),
    remove: write("filter.remove"),
  };

  const cfBuilder = {};
  for (const method of [
    "whenNumberGreaterThan",
    "whenNumberLessThan",
    "whenNumberEqualTo",
    "whenNumberNotEqualTo",
    "whenTextContains",
    "setFontColor",
    "setBackground",
    "setBold",
    "setRanges",
  ]) {
    cfBuilder[method] = (...args) => {
      hit(`cf.${method}`, args);
      return cfBuilder;
    };
  }
  cfBuilder.build = (...args) => {
    hit("cf.build", args);
    return { cfId: "cf-1" };
  };

  const validationBuilder = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "build") return () => ({ rule: "v" });
        return () => validationBuilder;
      },
    },
  );

  const makeRange = (row, column) => ({
    setValue: write("setValue"),
    getValue: () => {
      hit("getValue", [row, column]);
      return cells.get(`${row}:${column}`) ?? "";
    },
    setFontWeight: write("setFontWeight"),
    setFontColor: write("setFontColor"),
    setBackgroundColor: write("setBackgroundColor"),
    setHorizontalAlignment: write("setHorizontalAlignment"),
    setNumberFormat: write("setNumberFormat"),
    merge: write("merge"),
    breakApart: write("breakApart"),
    createFilter: (...args) => {
      hit("createFilter", args);
      return filter;
    },
    getFilter: () => {
      hit("getFilter", []);
      return null;
    },
    createConditionalFormattingRule: () => {
      hit("createConditionalFormattingRule", []);
      return cfBuilder;
    },
    getConditionalFormattingRules: () => {
      hit("getConditionalFormattingRules", []);
      return [];
    },
    clearConditionalFormatRules: write("clearConditionalFormatRules"),
    setDataValidation: write("setDataValidation"),
    getDataValidation: () => null,
    getValidatorStatus: () => Promise.resolve({ ok: true }),
  });

  const sheet = {
    getSheetId: () => "sheet-1",
    getSheetName: () => "Sheet1",
    getRange: (row, column) => {
      hit("getRange", [row, column]);
      return makeRange(row, column);
    },
    insertRowsBefore: write("insertRowsBefore"),
    insertRowsAfter: write("insertRowsAfter"),
    deleteRows: write("deleteRows"),
    insertColumnsBefore: write("insertColumnsBefore"),
    insertColumnsAfter: write("insertColumnsAfter"),
    deleteColumns: write("deleteColumns"),
    sort: write("sort"),
  };

  const workbook = {
    getActiveSheet: () => sheet,
    insertSheet: write("insertSheet"),
    undo: write("undo"),
    redo: write("redo"),
  };

  return {
    port: {
      api: { newDataValidation: () => validationBuilder },
      workbook,
      sheet,
      range: makeRange(0, 0),
      selection: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
    },
    calls,
    writes: () => calls.filter((call) => WRITE_METHODS.has(call.name)),
  };
}

/**
 * 舞台的替身：形状与 `GridUniverStage.tsx` 里那段 `usePluginCommandSurface`
 * 逐字同构（§3 的源码断言钉着这一点），`run` 就是生产函数本身。
 */
function stageSurface(port, options = {}) {
  let revision = options.revision ?? 3;
  let writes = 0;
  return {
    surface: {
      editorId: "grid",
      describe: gridAgentCommandSpecs,
      state: () => ({ revision }),
      run: async (id, params) =>
        runGridAgentCommand({
          id,
          params,
          port,
          revision,
          readonly: options.readonly ?? false,
          readonlyNotice: "这份旧表格是只读的，先转换。",
          submit: submitAgentReviewProposal,
          onWrite: () => {
            writes += 1;
            revision += 1;
          },
        }),
    },
    revision: () => revision,
    applyCount: () => writes,
  };
}

function freshEnv(options = {}) {
  resetGridApplyTokens();
  hostReviewSession.reset();
  const rec = recordingPort();
  const stage = stageSurface(rec.port, options);
  return { ...rec, ...stage };
}

// ── §0 自检：录制器与写方法清单本身是不是活的 ───────────────────────────────

test("§0 自检：不经闸门直捅端口，录制器确实记得到写（否则下面全是假绿）", () => {
  const rec = recordingPort();
  runGridUniverCommand("grid.insert-row", rec.port, { row: 0, count: 1 });
  assert.equal(
    rec.writes().length,
    1,
    "录制器一次写都没记到 ⇒ 是录制器坏了，不是 agent 守规矩",
  );
  assert.equal(rec.writes()[0].name, "insertRowsBefore");
});

test("§0 自检：写方法清单覆盖命令表里每一个真执行器碰得到的写口", () => {
  const rec = recordingPort();
  const uncovered = [];
  for (const command of GRID_UNIVER_COMMANDS) {
    if (!command.run) continue;
    if (command.id === "grid.read-cell" || command.id === "grid.select-cell") {
      continue;
    }
    const probe = recordingPort();
    runGridUniverCommand(command.id, probe.port, argsFor(command.id));
    if (probe.writes().length === 0) uncovered.push(command.id);
  }
  assert.deepEqual(
    uncovered,
    [],
    `这些命令直捅端口时一次写都没记到，说明 WRITE_METHODS 漏了它们的写口，` +
      `于是 §1 对它们永远绿：${uncovered.join(", ")}`,
  );
  assert.ok(rec.port, "端口构造本身不该抛");
});

// ── §1 产品判据：agent 直接下指令，Facade 一次写都不许有 ─────────────────────

test("§1 每一条会改表格的 agent 指令都只落成审阅提案，Facade 零写入", async () => {
  const ids = gridMutatingAgentCommandIds();
  assert.ok(
    ids.length >= 20,
    `只有 ${ids.length} 条会改文档的命令，命令表可疑`,
  );
  // 逐条收齐再一次性断言：中途 `assert` 会让循环停在第一条坏命令上，
  // 而下一个撞上这条闸的人最想知道的恰恰是**一共漏了哪几条**。
  const leaked = [];
  const unparked = [];
  const notSent = [];
  const bumped = [];
  for (const id of ids) {
    const env = freshEnv();
    const result = await env.surface.run(id, argsFor(id));
    if (env.writes().length > 0) {
      leaked.push(`${id} → ${env.writes().map((call) => call.name).join("/")}`);
    }
    const parked = hostReviewSession.snapshot().parked;
    if (!parked || parked.proposal.commandId !== id) unparked.push(id);
    if (!result.ok || !/审阅/.test(result.message)) {
      notSent.push(`${id}（回执：${result.message}）`);
    }
    if (result.revision !== 3) bumped.push(`${id} → ${result.revision}`);
  }
  assert.deepEqual(
    leaked,
    [],
    `这些指令绕过审阅直接写了表格 —— 用户以为要自己点头，实际已经改了：\n${leaked.join("\n")}`,
  );
  assert.deepEqual(
    unparked,
    [],
    `这些指令没把提案交给宿主收件箱，审阅面板会是空的：${unparked.join(", ")}`,
  );
  assert.deepEqual(
    notSent,
    [],
    `这些指令没告诉用户改动去了审阅：\n${notSent.join("\n")}`,
  );
  assert.deepEqual(
    bumped,
    [],
    `接受前 revision 不许前进（规范 §7 判据 3）：${bumped.join(", ")}`,
  );
});

test("§1 grid.set-cell 交的是带真原值的提案，不是空 before", async () => {
  const env = freshEnv();
  const result = await env.surface.run("grid.set-cell", {
    row: 0,
    column: 0,
    value: "新值",
  });
  assert.equal(result.ok, true);
  assert.equal(env.writes().length, 0, "set-cell 送审时不许写格");
  const parked = hostReviewSession.snapshot().parked;
  assert.ok(parked, "提案必须真的到了宿主收件箱");
  assert.equal(parked.proposal.commandId, "grid.set-cell");
  const change = parked.proposal.objects[0];
  assert.equal(change.id, "A1");
  assert.equal(change.before, "旧值", "before 要是表里真的那个值");
  assert.equal(change.after, "新值");
  assert.equal(hostReviewSession.snapshot().status, "open");
});

test("§1 只读指令不进审阅，当场执行", async () => {
  const env = freshEnv();
  const result = await env.surface.run("grid.read-cell", { row: 0, column: 0 });
  assert.equal(result.ok, true);
  assert.equal(env.writes().length, 0);
  assert.equal(hostReviewSession.snapshot().parked, null, "读不该产生提案");
});

test("§1 存量只读表格：连提案都不发，也不写", async () => {
  const env = freshEnv({ readonly: true });
  const result = await env.surface.run("grid.set-cell", {
    row: 0,
    column: 0,
    value: "x",
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /只读/);
  assert.equal(env.writes().length, 0);
  assert.equal(hostReviewSession.snapshot().parked, null);
});

// ── §2 接受之后必须真的写进去（红的另一半：set-cell 接受了也不写）───────────

test("§2 用户点接受，改动才真的落到 Facade —— set-cell", async () => {
  const env = freshEnv();
  await env.surface.run("grid.set-cell", { row: 0, column: 0, value: "新值" });
  assert.equal(env.writes().length, 0);
  const parked = hostReviewSession.snapshot().parked;
  hostReviewSession.acceptAll();
  const applied = await applyParkedReview(env.surface, parked);
  assert.equal(applied.ok, true, applied.message);
  const writes = env.writes();
  assert.equal(writes.length, 1, "接受之后应当恰好写一次");
  assert.equal(writes[0].name, "setValue");
  assert.deepEqual(writes[0].args, ["新值"]);
  assert.equal(env.applyCount(), 1, "写完要通知宿主推进 revision");
  assert.equal(applied.revision, 4, "接受之后 revision 才前进");
});

test("§2 结构类改动接受后也真的落地 —— 插入行 / 排序 / 加粗 / 新增工作表", async () => {
  const cases = [
    ["grid.insert-row", { row: 2, count: 1 }, "insertRowsBefore"],
    ["sort-asc", {}, "sort"],
    ["bold", { on: true }, "setFontWeight"],
    ["grid.add-sheet", { name: "汇总" }, "insertSheet"],
  ];
  for (const [id, params, expected] of cases) {
    const env = freshEnv();
    await env.surface.run(id, params);
    assert.equal(env.writes().length, 0, `${id} 送审时不许写`);
    const parked = hostReviewSession.snapshot().parked;
    assert.ok(parked, `${id} 的提案要在收件箱里`);
    hostReviewSession.acceptAll();
    const applied = await applyParkedReview(env.surface, parked);
    assert.equal(applied.ok, true, `${id}: ${applied.message}`);
    const writes = env.writes();
    assert.equal(writes.length, 1, `${id} 接受后应当恰好写一次`);
    assert.equal(writes[0].name, expected, `${id} 写错了方法`);
  }
});

test("§2 拒绝了就永远不写", async () => {
  const env = freshEnv();
  await env.surface.run("grid.insert-row", { row: 0, count: 1 });
  hostReviewSession.rejectAll();
  hostReviewSession.markDiscarded();
  assert.equal(env.writes().length, 0);
  assert.equal(env.revision(), 3);
});

// ── §3 令牌是能力，不是开关 ─────────────────────────────────────────────────

test("§3 伪造令牌写不进去，只会再排一次审阅", async () => {
  const env = freshEnv();
  const result = await env.surface.run("grid.set-cell", {
    row: 0,
    column: 0,
    value: "偷写",
    [GRID_APPLY_TOKEN_KEY]: "gat-猜的",
  });
  assert.equal(env.writes().length, 0, "伪造的令牌换来了一次真写入");
  assert.equal(result.ok, true);
  assert.match(result.message, /审阅/);
});

test("§3 令牌一次性：同一份接受参数重放第二次不再写", async () => {
  const env = freshEnv();
  await env.surface.run("grid.set-cell", { row: 0, column: 0, value: "A" });
  const parked = hostReviewSession.snapshot().parked;
  await applyParkedReview(env.surface, parked);
  assert.equal(env.writes().length, 1);
  hostReviewSession.reset();
  await applyParkedReview(env.surface, parked);
  assert.equal(env.writes().length, 1, "同一张令牌被兑现了两次");
});

test("§3 令牌绑命令：拿「改一格」批下来的令牌调「删除所选行」无效", async () => {
  const env = freshEnv();
  await env.surface.run("grid.set-cell", { row: 0, column: 0, value: "A" });
  const parked = hostReviewSession.snapshot().parked;
  const stolen = parked.params[GRID_APPLY_TOKEN_KEY];
  assert.equal(typeof stolen, "string");
  hostReviewSession.reset();
  await env.surface.run("row-delete", { [GRID_APPLY_TOKEN_KEY]: stolen });
  assert.equal(env.writes().length, 0, "令牌被挪用到另一条命令上还写成了");
});

test("§3 结构改动的回滚说做不到，而不是把同一条改动再执行一遍", async () => {
  const env = freshEnv();
  await env.surface.run("grid.insert-row", { row: 0, count: 1 });
  const parked = hostReviewSession.snapshot().parked;
  assert.equal(parked.inverseParams[GRID_APPLY_TOKEN_KEY], GRID_NO_INVERSE);
  const rolled = await applyParkedReview(env.surface, {
    ...parked,
    params: parked.inverseParams,
  });
  assert.equal(rolled.ok, false, "回滚不该报成功，否则宿主会记成已回滚");
  assert.match(rolled.message, /撤销/);
  assert.equal(env.writes().length, 0, "回滚把行又插了一遍");
});

test("§3 set-cell 的回滚写回原值，是真回滚", async () => {
  const env = freshEnv();
  await env.surface.run("grid.set-cell", { row: 0, column: 0, value: "新值" });
  const parked = hostReviewSession.snapshot().parked;
  const rolled = await applyParkedReview(env.surface, {
    ...parked,
    params: parked.inverseParams,
  });
  assert.equal(rolled.ok, true, rolled.message);
  const writes = env.writes();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, "setValue");
  assert.deepEqual(writes[0].args, ["旧值"], "回滚要写回表里原来那个值");
});

// ── §4 agent 看得见多少条指令 ───────────────────────────────────────────────

test("§4 describe() 放出 L1/L2，抽样面 ≥10（V3 判据）", () => {
  const specs = gridAgentCommandSpecs();
  assert.ok(specs.length >= 10, `agent 只看得到 ${specs.length} 条指令`);
  const ids = specs.map((spec) => spec.id);
  for (const id of ["bold", "align", "color", "row-before", "sort-asc"]) {
    assert.ok(ids.includes(id), `L1/L2 的「${id}」agent 调不到`);
  }
  const readOnly = specs.filter((spec) => !spec.mutates).map((spec) => spec.id);
  assert.deepEqual(
    readOnly.sort(),
    ["grid.read-cell", "grid.select-cell"],
    "只有读格子/选格子可以标成不改文档",
  );
  for (const spec of specs) {
    assert.ok(spec.summary.length > 0, `${spec.id} 没有一句人话说明`);
  }
});

// ── §5 源码结构：舞台的 run 不许再长出直接写表的分支 ─────────────────────────

function headSource(path) {
  return execFileSync("git", ["show", `HEAD:${path}`], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** 抠出 `usePluginCommandSurface({ … });` 那一段，括号配平地取。 */
function commandSurfaceBlock(source) {
  const start = source.indexOf("usePluginCommandSurface({");
  if (start < 0) return "";
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

test("§5 自检：抠 usePluginCommandSurface 的取法在 HEAD 上真的抠得到", () => {
  const block = commandSurfaceBlock(headSource(STAGE));
  assert.ok(block.length > 0, "抠不到 ⇒ 取法错了，不是舞台没有指令面");
  assert.match(block, /editorId:\s*"grid"/, "抠到的不是表格那一段");
});

test("§5 舞台的 agent run 只调 runGridAgentCommand，不许自己碰 Facade", () => {
  const block = commandSurfaceBlock(headSource(STAGE));
  assert.match(
    block,
    /run:\s*\(id,\s*params\)\s*=>\s*\n?\s*runGridAgentCommand\(/,
    "agent 的 run 必须整条委派给 runGridAgentCommand",
  );
  assert.match(
    block,
    /submit:\s*submitAgentReviewProposal/,
    "提案必须真的交给宿主收件箱，不能交给一个空函数",
  );
  const banned = [
    "runGridUniverCommand(",
    ".setValue(",
    ".insertRowsBefore(",
    ".insertColumnsBefore(",
    ".insertSheet(",
    ".sort(",
  ];
  const found = banned.filter((needle) => block.includes(needle));
  assert.deepEqual(
    found,
    [],
    `舞台的 agent 指令面里又长出了直接写表的调用：${found.join(", ")}`,
  );
});
