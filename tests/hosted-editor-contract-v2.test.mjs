// ============================================================================
// 宿主契约 v2 的契约测试（W01，editor-core-swap）
//
// 锁三样东西，每一样都做过反面验证（把实现改回去当场红，逐条记在
// verdicts/W01-delivery.md）：
//   1. **向后兼容**：v1 的 17+14 条一条没少，v1 形态的消息逐字仍然通过；
//   2. **新指令的校验真的在拦**：每条新消息都配一组畸形载荷，全部必须回 null；
//   3. **W18 R1 的 origin 白名单是全串匹配**：四类近似 origin 全部拒绝。
//
// 判据文件本身会被 Tailwind 自动内容探测扫进产物（_COMMON §7b⑧，实测 37 条），
// 所以**这里不举任何真实类名当例子**。
// ============================================================================

import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITOR_TO_HOST_MESSAGE_TYPES,
  HOST_TO_EDITOR_MESSAGE_TYPES,
} from "../src/shell/editor-protocol-message-types.ts";
import {
  asEditorToHostMessage,
  asHostToEditorMessage,
  isTrustedEditorOrigin,
} from "../src/shell/editor-protocol.ts";
import {
  HOSTED_EDITOR_HOST_LABELS,
  HOSTED_EDITOR_ORIGINS,
  isHostedEditorOrigin,
} from "../src/shell/hosted-editor-origins.ts";
import {
  HOSTED_EDITOR_EMBED_BASES,
  TRUSTED_EMBED_EDITOR_SANDBOX,
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
  isHostedEditorEmbedBase,
  isTrustedEmbedEditorBase,
  sandboxGrantsScriptedSameOrigin,
} from "../src/shell/editor-sandbox-origin.ts";
import { buildEditorEmbedUrl } from "../src/shell/editor-protocol.ts";
import {
  HOSTED_EDITOR_CONTRACT_VERSION,
  buildHideChromeMessage,
  buildReviewDecisionMessage,
  buildSetModeMessage,
  chipsForSelection,
  renderChipPrompt,
  validAgentChips,
  validReviewProposal,
} from "../src/shell/hosted-editor/index.ts";

const INSTANCE = "instance-1";
const PROTOCOL = "oceanleo.editor.v1";
const envelope = (type, rest) => ({
  protocol: PROTOCOL,
  type,
  instanceId: INSTANCE,
  ...rest,
});

// ─── 1. 只加不减 ────────────────────────────────────────────────────────────

test("v2 只加不减：v1 的全部指令仍在集合里", () => {
  // v1 的原始成员逐条列出。少一条 = 某个 v1 编辑器的消息会被白名单直接丢掉，
  // 而它表现为「编辑器打开后没反应」，没有任何报错——所以必须钉死。
  for (const type of [
    "artifact-created",
    "artifact-updated",
    "close-request",
    "dirty",
    "error",
    "export-result",
    "history-changed",
    "material-result",
    "project-manifest",
    "project-result",
    "ready",
    "recovery-result",
    "recovery-snapshot",
    "selection-changed",
    "selection-result",
    "tools-manifest",
    "viewport-changed",
  ]) {
    assert.equal(EDITOR_TO_HOST_MESSAGE_TYPES.has(type), true, type);
  }
  for (const type of [
    "dispose",
    "export-request",
    "init",
    "material-insert",
    "open-asset",
    "project-action",
    "project-view",
    "recovery-capture",
    "recovery-restore",
    "save-request",
    "save-result",
    "selection-command",
    "set-host-layout",
    "viewport-command",
  ]) {
    assert.equal(HOST_TO_EDITOR_MESSAGE_TYPES.has(type), true, type);
  }
  assert.equal(HOSTED_EDITOR_CONTRACT_VERSION, "2.0");
});

test("plugin-chrome 可选字段：v1 project-manifest 不带 role/placement 照旧通过", () => {
  const v1 = asEditorToHostMessage(
    envelope("project-manifest", {
      manifest: {
        revision: 3,
        views: [{ id: "preview", label: "Preview", active: true }],
        actions: [{ id: "publish", label: "Publish" }],
      },
    }),
    INSTANCE,
  );
  assert.ok(v1, "v1 project-manifest 必须仍然被接受");
  assert.equal(v1.manifest.views[0].role, undefined);
  assert.equal(v1.manifest.views[0].unavailableReason, undefined);
  assert.equal(v1.manifest.actions[0].placement, undefined);
  assert.ok(asHostToEditorMessage(envelope("init", {}), INSTANCE));
  assert.ok(
    asHostToEditorMessage(envelope("init", { chrome: "host" }), INSTANCE),
  );
});

test("plugin-chrome 可选字段：非法 role/placement/chrome 整条丢掉", () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => {
    errors.push(args.map(String).join(" "));
  };
  try {
    assert.equal(
      asEditorToHostMessage(
        envelope("project-manifest", {
          manifest: {
            revision: 3,
            views: [
              { id: "preview", label: "Preview", active: true, role: "tab" },
            ],
            actions: [],
          },
        }),
        INSTANCE,
      ),
      null,
    );
    assert.equal(
      asEditorToHostMessage(
        envelope("project-manifest", {
          manifest: {
            revision: 3,
            views: [{ id: "preview", label: "Preview", active: true }],
            actions: [
              { id: "publish", label: "Publish", placement: "header" },
            ],
          },
        }),
        INSTANCE,
      ),
      null,
    );
    assert.equal(
      asHostToEditorMessage(envelope("init", { chrome: "iframe" }), INSTANCE),
      null,
    );
  } finally {
    console.error = original;
  }
  assert.ok(errors.some((line) => line.includes("invalid view.role")));
  assert.ok(errors.some((line) => line.includes("invalid action.placement")));
  assert.ok(errors.some((line) => line.includes("invalid chrome")));
});

test("v2 只加不减：v1 形态的 tools-manifest（没有 manifestVersion/chips）照样通过", () => {
  const v1Manifest = envelope("tools-manifest", {
    revision: 7,
    tools: [
      {
        id: "tool-a",
        label: "工具甲",
        controlId: "control-a",
        choices: [{ value: "one", label: "一" }],
      },
    ],
  });
  const accepted = asEditorToHostMessage(v1Manifest, INSTANCE);
  assert.ok(accepted, "v1 manifest 必须仍然被接受");
  assert.equal(accepted.manifestVersion, undefined);
  assert.equal(accepted.chips, undefined);
});

// ─── 2. 新指令：合法通过 / 畸形拒绝 ─────────────────────────────────────────

test("set-mode 只认 normal 与 pro", () => {
  for (const mode of ["normal", "pro"]) {
    assert.ok(
      asHostToEditorMessage(envelope("set-mode", { mode }), INSTANCE),
      mode,
    );
  }
  for (const bad of ["Pro", "PRO", "expert", "", null, 1, undefined, {}]) {
    assert.equal(
      asHostToEditorMessage(envelope("set-mode", { mode: bad }), INSTANCE),
      null,
      String(bad),
    );
  }
});

test("hide-chrome 的两个字段必须是真布尔，不接受真值等价物", () => {
  assert.ok(
    asHostToEditorMessage(
      envelope("hide-chrome", { toolbar: true, panels: false }),
      INSTANCE,
    ),
  );
  for (const bad of [
    { toolbar: "true", panels: false },
    { toolbar: 1, panels: 0 },
    { toolbar: true },
    { panels: true },
    {},
  ]) {
    assert.equal(
      asHostToEditorMessage(envelope("hide-chrome", bad), INSTANCE),
      null,
      JSON.stringify(bad),
    );
  }
});

test("review-decision 只认 accept / reject 且要有 proposalId", () => {
  for (const decision of ["accept", "reject"]) {
    assert.ok(
      asHostToEditorMessage(
        envelope("review-decision", { proposalId: "p-1", decision }),
        INSTANCE,
      ),
      decision,
    );
  }
  for (const bad of [
    { proposalId: "p-1", decision: "maybe" },
    { proposalId: "", decision: "accept" },
    { decision: "accept" },
    { proposalId: "p-1" },
    { proposalId: "x".repeat(129), decision: "accept" },
  ]) {
    assert.equal(
      asHostToEditorMessage(envelope("review-decision", bad), INSTANCE),
      null,
      JSON.stringify(bad),
    );
  }
});

const goodProposal = {
  proposalId: "p-1",
  commandId: "text-rewrite",
  summary: { before: "旧文案", after: "新文案" },
  diff: "- 旧文案\n+ 新文案",
  targetSelection: null,
  revision: 3,
};

test("review-proposal：diff 与 objects 必须恰好给一个", () => {
  assert.equal(validReviewProposal(goodProposal), true);
  assert.equal(
    validReviewProposal({
      ...goodProposal,
      diff: undefined,
      objects: [{ id: "o1", op: "update", label: "标题" }],
    }),
    true,
  );
  // 两个都给 = 两份会互相矛盾的事实源，审阅面板得挑一份信，挑错没人看得出来。
  assert.equal(
    validReviewProposal({
      ...goodProposal,
      objects: [{ id: "o1", op: "update", label: "标题" }],
    }),
    false,
    "两个都给必须拒绝",
  );
  // 一个都不给 = 用户在审阅面板上看不到任何将要发生的事。
  assert.equal(
    validReviewProposal({ ...goodProposal, diff: undefined }),
    false,
    "一个都不给必须拒绝",
  );
});

test("review-proposal：缺字段 / 非法 op / 超量对象一律拒绝", () => {
  for (const bad of [
    { ...goodProposal, proposalId: "" },
    { ...goodProposal, commandId: "不是合法 id" },
    { ...goodProposal, revision: undefined },
    { ...goodProposal, summary: { before: "只有前" } },
    { ...goodProposal, summary: undefined },
    {
      ...goodProposal,
      diff: undefined,
      objects: [{ id: "o1", op: "rewrite", label: "x" }],
    },
    { ...goodProposal, diff: undefined, objects: [] },
    {
      ...goodProposal,
      diff: undefined,
      objects: Array.from({ length: 201 }, (_unused, i) => ({
        id: `o${i}`,
        op: "add",
        label: "x",
      })),
    },
    null,
    "字符串",
  ]) {
    assert.equal(validReviewProposal(bad), false, JSON.stringify(bad));
  }
});

test("review-proposal 走得通整条 asEditorToHostMessage", () => {
  const accepted = asEditorToHostMessage(
    envelope("review-proposal", { proposal: goodProposal }),
    INSTANCE,
  );
  assert.ok(accepted);
  assert.equal(accepted.proposal.proposalId, "p-1");
  assert.equal(
    asEditorToHostMessage(
      envelope("review-proposal", { proposal: { ...goodProposal, diff: 1 } }),
      INSTANCE,
    ),
    null,
  );
});

// ─── 3. tools-manifest v2 的 chips ─────────────────────────────────────────

const chip = {
  id: "summarize-doc",
  label: "总结全文",
  kind: "summarize",
  appliesTo: ["*"],
  prompt: "请总结：{document}",
};

test("chips：缺省放行（v1 编辑器），超过 8 条拒绝，id 不许重复", () => {
  assert.equal(validAgentChips(undefined), true, "v1 编辑器不发 chips");
  assert.equal(validAgentChips([chip]), true);
  assert.equal(
    validAgentChips(
      Array.from({ length: 9 }, (_unused, i) => ({ ...chip, id: `c${i}` })),
    ),
    false,
    "9 条必须拒绝（五层规范 §2：≤8）",
  );
  assert.equal(
    validAgentChips([chip, { ...chip }]),
    false,
    "id 重复必须拒绝",
  );
  for (const bad of [
    { ...chip, kind: "做点什么" },
    { ...chip, appliesTo: [] },
    { ...chip, appliesTo: ["有空格的 kind"] },
    { ...chip, prompt: "" },
    { ...chip, label: "" },
    { ...chip, id: "带空格 的 id" },
  ]) {
    assert.equal(validAgentChips([bad]), false, JSON.stringify(bad));
  }
});

test("tools-manifest v2：manifestVersion 只认 2", () => {
  const withChips = (extra) =>
    envelope("tools-manifest", {
      revision: 7,
      tools: [
        {
          id: "tool-a",
          label: "工具甲",
          controlId: "control-a",
          choices: [{ value: "one", label: "一" }],
        },
      ],
      ...extra,
    });
  assert.ok(
    asEditorToHostMessage(
      withChips({ manifestVersion: 2, chips: [chip] }),
      INSTANCE,
    ),
  );
  for (const bad of [1, 3, "2", null]) {
    assert.equal(
      asEditorToHostMessage(withChips({ manifestVersion: bad }), INSTANCE),
      null,
      String(bad),
    );
  }
});

test("W18 R2：L0-only 件可以发空能力集的 tools-manifest", () => {
  // audio / 3d / game-ide / flow 是整站式应用，只接 L0，能力集本来就是空的。
  // 若契约要求 tools 非空，这四件永远握不上手（W18 R2 原文）。
  const l0Only = envelope("tools-manifest", {
    revision: 1,
    tools: [],
    manifestVersion: 2,
    chips: [],
  });
  assert.ok(asEditorToHostMessage(l0Only, INSTANCE), "空能力集必须被接受");
  assert.ok(
    asEditorToHostMessage(envelope("ready", {}), INSTANCE),
    "ready 不要求先有非空 manifest",
  );
});

// ─── 4. chips 的挑选与提示词渲染 ───────────────────────────────────────────

test("chipsForSelection：无选区时只出通配 chip", () => {
  const textChip = { ...chip, id: "rewrite-text", appliesTo: ["text"] };
  assert.deepEqual(
    chipsForSelection([chip, textChip], null).map((c) => c.id),
    ["summarize-doc"],
  );
  assert.deepEqual(
    chipsForSelection([chip, textChip], "text").map((c) => c.id),
    ["summarize-doc", "rewrite-text"],
  );
  assert.deepEqual(chipsForSelection(undefined, "text"), []);
});

test("renderChipPrompt 只替换一轮，用户内容里的占位符不再展开", () => {
  const rendered = renderChipPrompt(
    { ...chip, prompt: "总结：{document}" },
    { document: "这里出现了 {document} 字样" },
  );
  assert.equal(rendered, "总结：这里出现了 {document} 字样");
  assert.equal(
    renderChipPrompt({ ...chip, prompt: "{selection}" }, {}),
    "",
    "缺省上下文替换成空串而不是留下占位符",
  );
});

// ─── 5. builder 拼错当场抛 ─────────────────────────────────────────────────

test("builder 产出的消息一定能过校验；instanceId 非法当场抛", () => {
  assert.ok(asHostToEditorMessage(buildSetModeMessage(INSTANCE, "pro"), INSTANCE));
  assert.ok(
    asHostToEditorMessage(
      buildHideChromeMessage(INSTANCE, { toolbar: true, panels: true }),
      INSTANCE,
    ),
  );
  assert.ok(
    asHostToEditorMessage(
      buildReviewDecisionMessage(INSTANCE, "p-1", "accept"),
      INSTANCE,
    ),
  );
  assert.throws(() => buildSetModeMessage("", "pro"), TypeError);
  assert.throws(() => buildSetModeMessage("x".repeat(129), "pro"), TypeError);
  assert.throws(
    () => buildReviewDecisionMessage(INSTANCE, "", "accept"),
    TypeError,
  );
});

// ─── 6. W18 R1：Hosted 编辑器 origin 全串白名单 ────────────────────────────

test("W18 R1：六个 Hosted origin 被信任", () => {
  assert.equal(HOSTED_EDITOR_ORIGINS.length, 6);
  assert.deepEqual([...HOSTED_EDITOR_HOST_LABELS], [
    "slides",
    "docs",
    "audio",
    "3d",
    "game-ide",
    "flow",
  ]);
  for (const origin of HOSTED_EDITOR_ORIGINS) {
    assert.equal(isHostedEditorOrigin(origin), true, origin);
    assert.equal(isTrustedEditorOrigin(origin), true, origin);
  }
});

test("W18 R1：四类近似 origin 一律拒绝（全串匹配，不做后缀推断）", () => {
  for (const origin of [
    // ① 后缀挂靠：攻击者自己的可注册域，尾部长得像我们的主机
    "https://slides.oceanleo.app.evil.com",
    // ② 前缀粘连：多一个字母就是另一台主机
    "https://xslides.oceanleo.app",
    "https://slides.oceanleo.appx",
    // ③ 明文降级：六个主机都在通配证书后面，没有任何理由收 http
    "http://slides.oceanleo.app",
    // ④ UGC 主机：同一个可注册域上跑用户代码的那一类，正是白名单要挡的
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app",
    "https://p1-aaaabbbbccccddddeeeeffff00001111.oceanleo.app",
    // 另加几种形状：带端口、带路径、带凭据、大小写、子域再套一层
    "https://slides.oceanleo.app:8443",
    "https://slides.oceanleo.app/",
    "https://user:pw@slides.oceanleo.app",
    "https://deep.slides.oceanleo.app",
    "https://oceanleo.app",
  ]) {
    assert.equal(isHostedEditorOrigin(origin), false, `allowlist: ${origin}`);
    assert.equal(isTrustedEditorOrigin(origin), false, `gate: ${origin}`);
  }
});

test("W18 R1：白名单没有放宽别的 origin 判定", () => {
  // 白名单是**并列**分支，不是替换。既有结论必须逐字不变：
  // 家族第一方仍然可信，别的 UGC 域仍然不可信。
  assert.equal(isTrustedEditorOrigin("https://design.oceanleo.com"), true);
  assert.equal(isTrustedEditorOrigin("https://preview.oceanleo.com"), false);
  assert.equal(isTrustedEditorOrigin("https://anything.leoapp.cn"), false);
  assert.equal(isTrustedEditorOrigin("https://evil.com"), false);
});

// ─── 7. A-24 / W07 R2：embed base 放行，但沙箱面**不给同源** ───────────────

test("A-24：六件的 embed base 能拼出 URL", () => {
  assert.equal(HOSTED_EDITOR_EMBED_BASES.length, 6);
  for (const base of HOSTED_EDITOR_EMBED_BASES) {
    assert.equal(isHostedEditorEmbedBase(base), true, base);
    assert.equal(isTrustedEmbedEditorBase(base), true, base);
    const url = buildEditorEmbedUrl(base, {
      instanceId: "instance-1",
      hostOrigin: "https://oceanleo.com",
    });
    assert.equal(new URL(url).origin, base, base);
    assert.equal(new URL(url).searchParams.get("embed"), "1");
  }
});

test("A-24 的要害：六件拿的是不可信沙箱，一个都不许拿到同源", () => {
  for (const base of HOSTED_EDITOR_EMBED_BASES) {
    const sandbox = embedEditorFrameSandbox(base);
    assert.equal(sandbox, UNTRUSTED_FRAME_SANDBOX, base);
    // 直说一遍为什么：allow-scripts + allow-same-origin 同时给 = 沙箱失效。
    // 六件里四件是未修改的第三方整站应用（Langflow / microStudio …）。
    assert.equal(
      sandboxGrantsScriptedSameOrigin(sandbox),
      false,
      `${base} 拿到了同源沙箱`,
    );
  }
  // 反过来，家族内第一方仍然拿同源——本条改动不许把既有能力也一起收走。
  const firstParty = "https://design.oceanleo.com/embed/editor";
  assert.equal(
    embedEditorFrameSandbox(firstParty),
    TRUSTED_EMBED_EDITOR_SANDBOX,
  );
  assert.equal(sandboxGrantsScriptedSameOrigin(TRUSTED_EMBED_EDITOR_SANDBOX), true);
});

test("A-24：近似 base 仍然拼不出 URL（全串，不做后缀推断）", () => {
  for (const base of [
    "https://slides.oceanleo.app/embed/attacker",
    "https://slides.oceanleo.app.evil.com",
    "https://xslides.oceanleo.app",
    "http://slides.oceanleo.app",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app",
  ]) {
    assert.equal(isHostedEditorEmbedBase(base), false, base);
    assert.throws(
      () =>
        buildEditorEmbedUrl(base, {
          instanceId: "instance-1",
          hostOrigin: "https://oceanleo.com",
        }),
      TypeError,
      base,
    );
  }
});
