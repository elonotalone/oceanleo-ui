import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resetAgentReviewInbox } from "../src/shell/agent-review/inbox.ts";
import { hostReviewSession } from "../src/shell/agent-review/session.ts";
import {
  VIEW_ONLY_REFUSAL,
  guardPluginSurface,
} from "../src/shell/collab/adapters/visual-readonly.ts";
import {
  createGameAgentSurface,
  gameAgentCommandSpecs,
  resetGameApplyTokens,
} from "../src/shell/game-editor/game-agent-gate.ts";

const MINIMAL_HTML =
  "<!doctype html><html><body><script>void 0</script></body></html>";
const NEXT_HTML =
  "<!doctype html><html><body><script>window.GAME=1</script></body></html>";
const NEXT_PARAMS = { speed: { label: "速度", min: 1, max: 10, step: 1, default: 5 } };

const MUTATING = [
  "game.set-source",
  "game.replace-in-source",
  "game.set-params",
];
const READONLY = ["game.read-source", "game.read-params"];

const MUTATING_PARAMS = {
  "game.set-source": { source: NEXT_HTML },
  "game.replace-in-source": { find: "void 0", replace: "void 1" },
  "game.set-params": { params: NEXT_PARAMS },
};

function makePort() {
  const writes = [];
  const paramWrites = [];
  const port = {
    source: () => MINIMAL_HTML,
    revision: () => 3,
    writeSource(next) {
      writes.push(next);
    },
    params: () => ({ lives: { label: "生命", min: 1, max: 9, step: 1, default: 3 } }),
    writeParams(next) {
      paramWrites.push(next);
    },
  };
  return { port, writes, paramWrites };
}

function wrapSurface(port, readOnly) {
  const inner = createGameAgentSurface(port);
  const ran = [];
  const instrumented = {
    ...inner,
    run(id, params) {
      ran.push(id);
      return inner.run(id, params);
    },
  };
  return { surface: guardPluginSurface(instrumented, readOnly), ran, inner };
}

test("gameAgentCommandSpecs 的 mutates 与 guardPluginSurface 期望的字段一致", () => {
  const specs = gameAgentCommandSpecs();
  assert.deepEqual(
    specs.map((spec) => spec.id),
    [...READONLY, ...MUTATING],
  );
  for (const spec of specs) {
    assert.equal(typeof spec.mutates, "boolean", spec.id);
  }
  assert.deepEqual(
    specs.filter((spec) => spec.mutates).map((spec) => spec.id),
    MUTATING,
  );
  assert.deepEqual(
    specs.filter((spec) => !spec.mutates).map((spec) => spec.id),
    READONLY,
  );
});

test("只读时三条改源码指令被挡（不生成审阅、不写源码），两条只读指令仍正常", async () => {
  resetGameApplyTokens();
  resetAgentReviewInbox();
  const { port, writes, paramWrites } = makePort();
  const { surface, ran } = wrapSurface(port, true);

  for (const id of MUTATING) {
    const result = await surface.run(id, MUTATING_PARAMS[id]);
    assert.equal(result.ok, false, id);
    assert.equal(result.message, VIEW_ONLY_REFUSAL, id);
    assert.equal(result.revision, undefined, `${id} 被挡时不应带 revision`);
  }
  assert.deepEqual(ran, [], "会改源码的指令不得进入 runGameAgentCommand");
  assert.deepEqual(writes, []);
  assert.deepEqual(paramWrites, []);
  assert.equal(hostReviewSession.snapshot().parked, null);

  const source = await surface.run("game.read-source", {});
  assert.equal(source.ok, true);
  assert.match(String(source.message), /当前源码 \d+ 字节/);
  assert.equal(source.revision, 3);

  const params = await surface.run("game.read-params", {});
  assert.equal(params.ok, true);
  assert.match(String(params.message), /声明了 1 项可调参数/);
  assert.equal(params.revision, 3);

  assert.deepEqual(ran, ["game.read-source", "game.read-params"]);
  assert.deepEqual(writes, []);
  assert.deepEqual(paramWrites, []);
  assert.equal(hostReviewSession.snapshot().parked, null);
});

test("非只读时四条指令与未包装完全一致（回归）", async () => {
  const ids = [
    "game.read-source",
    "game.set-source",
    "game.replace-in-source",
    "game.set-params",
  ];
  const paramsOf = {
    "game.read-source": {},
    ...MUTATING_PARAMS,
  };

  for (const id of ids) {
    const sample = createGameAgentSurface(makePort().port);
    assert.equal(
      guardPluginSurface(sample, false),
      sample,
      "非只读必须原样返回同一张指令面",
    );

    resetGameApplyTokens();
    resetAgentReviewInbox();
    const rawPack = makePort();
    const raw = createGameAgentSurface(rawPack.port);
    const rawResult = await raw.run(id, paramsOf[id]);
    const rawParked = Boolean(hostReviewSession.snapshot().parked);

    resetGameApplyTokens();
    resetAgentReviewInbox();
    const guardedPack = makePort();
    const guarded = guardPluginSurface(
      createGameAgentSurface(guardedPack.port),
      false,
    );
    const guardedResult = await guarded.run(id, paramsOf[id]);
    const guardedParked = Boolean(hostReviewSession.snapshot().parked);

    assert.deepEqual(
      {
        ok: guardedResult.ok,
        message: guardedResult.message,
        revision: guardedResult.revision,
      },
      {
        ok: rawResult.ok,
        message: rawResult.message,
        revision: rawResult.revision,
      },
      id,
    );
    assert.deepEqual(guardedPack.writes, rawPack.writes, `${id} writeSource`);
    assert.deepEqual(
      guardedPack.paramWrites,
      rawPack.paramWrites,
      `${id} writeParams`,
    );
    assert.equal(guardedParked, rawParked, `${id} 审阅提案`);
  }
});

test("非只读时 game.read-params 也与未包装一致", async () => {
  resetGameApplyTokens();
  resetAgentReviewInbox();
  const rawPack = makePort();
  const guardedPack = makePort();
  const raw = createGameAgentSurface(rawPack.port);
  const guarded = guardPluginSurface(createGameAgentSurface(guardedPack.port), false);
  const rawResult = await raw.run("game.read-params", {});
  const guardedResult = await guarded.run("game.read-params", {});
  assert.deepEqual(guardedResult, rawResult);
  assert.equal(hostReviewSession.snapshot().parked, null);
});

test("GameCodeStage 把 Leo 指令面交给 guardPluginSurface(collabReadOnly)", () => {
  const src = readFileSync(
    new URL("../src/shell/game-editor/GameCodeStage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    src,
    /guardPluginSurface\(createGameAgentSurface\(agentPort\), collabReadOnly\)/,
  );
  assert.match(
    src,
    /usePluginCommandSurface\(\s*useMemo\(\s*\(\) => guardPluginSurface\(createGameAgentSurface\(agentPort\), collabReadOnly\),\s*\[agentPort, collabReadOnly\],\s*\),\s*\)/,
  );
  assert.match(src, /import \{ guardPluginSurface \} from "\.\.\/collab\/adapters\/visual-readonly"/);
});
