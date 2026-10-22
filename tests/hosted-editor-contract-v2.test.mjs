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
  COVER_FRAME_SANDBOX,
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
  isTrustedEmbedEditorBase,
  sandboxGrantsScriptedSameOrigin,
} from "../src/shell/editor-sandbox-origin.ts";
import { buildEditorEmbedUrl } from "../src/shell/editor-protocol.ts";
import { classifyProjectManifest } from "../src/shell/editor-protocol-validation.mjs";
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

// ─── 1b. project-manifest.pro（plugin-ui U5，只加不减）──────────────────────

const PRO_VIEWS = [
  { id: "preview", label: "编辑", active: true, role: "artifact" },
  { id: "code", label: "源码", active: false, role: "page" },
];

test("project-manifest 带 pro：旧宿主校验照过，classify 透出 proLabel / proUnavailableReason", () => {
  const withLabel = asEditorToHostMessage(
    envelope("project-manifest", {
      manifest: {
        revision: "website:1",
        views: PRO_VIEWS,
        actions: [],
        pro: { label: "Puck" },
      },
    }),
    INSTANCE,
  );
  assert.ok(withLabel, "带 pro 的 manifest 必须仍然被接受（只加不减）");
  const labelled = classifyProjectManifest(withLabel.manifest);
  assert.equal(labelled.proLabel, "Puck");
  assert.equal(labelled.proUnavailableReason, undefined);
  assert.equal(labelled.artifactViewId, "preview");
  assert.equal(labelled.auxViews.length, 1);

  const reason = "此网站是源码工程，专业编辑用于三轴模板站；改源码请用「源码」页";
  const withReason = asEditorToHostMessage(
    envelope("project-manifest", {
      manifest: {
        revision: "website:2",
        views: PRO_VIEWS,
        actions: [],
        pro: { unavailableReason: reason },
      },
    }),
    INSTANCE,
  );
  assert.ok(withReason);
  const unavailable = classifyProjectManifest(withReason.manifest);
  assert.equal(unavailable.proLabel, undefined);
  assert.equal(unavailable.proUnavailableReason, reason);
});

test("project-manifest 不带 pro：classify 两个字段都是 undefined；非法 pro 当没说，整条不丢", () => {
  const plain = asEditorToHostMessage(
    envelope("project-manifest", {
      manifest: { revision: 1, views: PRO_VIEWS, actions: [] },
    }),
    INSTANCE,
  );
  assert.ok(plain);
  const classified = classifyProjectManifest(plain.manifest);
  assert.equal(classified.proLabel, undefined);
  assert.equal(classified.proUnavailableReason, undefined);
  assert.equal("proLabel" in classified, true, "字段必须存在，宿主直接解构");

  for (const bad of [
    "Puck",
    42,
    null,
    [],
    { label: 7, unavailableReason: false },
    { label: "", unavailableReason: "x".repeat(201) },
  ]) {
    const message = asEditorToHostMessage(
      envelope("project-manifest", {
        manifest: { revision: 1, views: PRO_VIEWS, actions: [], pro: bad },
      }),
      INSTANCE,
    );
    assert.ok(message, `非法 pro ${JSON.stringify(bad)} 不得让整条 manifest 被丢`);
    const result = classifyProjectManifest(message.manifest);
    assert.equal(result.proLabel, undefined);
    assert.equal(result.proUnavailableReason, undefined);
  }
  assert.equal(
    classifyProjectManifest({
      revision: 1,
      views: [],
      actions: [],
      pro: { label: "x".repeat(200) },
    }).proLabel.length,
    200,
    "200 字是上限本身，允许",
  );
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

// UC-NONE: pure message-builder validation (instanceId bounds, schema fit); it
// guards protocol correctness, not an isolation rule — the origin/sandbox rules
// are asserted in the UC-3 / UC-6 cases of this file.
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

// ─── 6. Hosted 编辑器 origin 白名单已删除（2026-10-22 native-editors） ───────
// 负面守卫：前 Hosted 六件的 origin 不再被信任，也拼不出 embed URL，沙箱不含同源。
// 其余 origin 判定一字未松：家族第一方仍可信，UGC 域仍不可信。

const FORMER_HOSTED_ORIGINS = [
  "https://slides.oceanleo.app",
  "https://docs.oceanleo.app",
  "https://audio.oceanleo.app",
  "https://3d.oceanleo.app",
  "https://game-ide.oceanleo.app",
  "https://flow.oceanleo.app",
];

// UC-3 / UC-6：前 Hosted origin 与其近似形状都不再通过 postMessage 闸门。
test("UC-3 UC-6：前 Hosted origin 及近似形状一律不被信任", () => {
  for (const origin of [
    ...FORMER_HOSTED_ORIGINS,
    "https://slides.oceanleo.app.evil.com",
    "https://xslides.oceanleo.app",
    "http://slides.oceanleo.app",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app",
    "https://slides.oceanleo.app:8443",
    "https://user:pw@slides.oceanleo.app",
    "https://oceanleo.app",
  ]) {
    assert.equal(isTrustedEditorOrigin(origin), false, `gate: ${origin}`);
    assert.equal(isTrustedEmbedEditorBase(origin), false, `base: ${origin}`);
  }
});

test("UC-3：删除白名单没有放宽别的 origin 判定", () => {
  assert.equal(isTrustedEditorOrigin("https://design.oceanleo.com"), true);
  assert.equal(isTrustedEditorOrigin("https://preview.oceanleo.com"), false);
  assert.equal(isTrustedEditorOrigin("https://anything.leoapp.cn"), false);
  assert.equal(isTrustedEditorOrigin("https://evil.com"), false);
});

// UC-3：前 Hosted base 拼不出 embed URL，沙箱不含 scripts+same-origin；UGC / cover 同样没有。
test("UC-3：前 Hosted base 拼不出 URL，沙箱无同源", () => {
  for (const base of [
    ...FORMER_HOSTED_ORIGINS,
    "https://slides.oceanleo.app/embed/attacker",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app",
  ]) {
    assert.throws(
      () =>
        buildEditorEmbedUrl(base, {
          instanceId: "instance-1",
          hostOrigin: "https://oceanleo.com",
        }),
      TypeError,
      base,
    );
    assert.equal(embedEditorFrameSandbox(base), UNTRUSTED_FRAME_SANDBOX, base);
  }
  const ugc = embedEditorFrameSandbox("https://p1--base.oceanleo.app/");
  assert.equal(ugc, UNTRUSTED_FRAME_SANDBOX);
  assert.equal(ugc.includes("allow-same-origin"), false, "UGC 预览主机不得同源");
  assert.equal(COVER_FRAME_SANDBOX.includes("allow-same-origin"), false);
  assert.equal(sandboxGrantsScriptedSameOrigin(COVER_FRAME_SANDBOX), false);
  // 子站嵌入白名单同样为空：第一方 base 现在也拿不到同源沙箱。
  assert.equal(
    embedEditorFrameSandbox("https://design.oceanleo.com/embed/editor"),
    UNTRUSTED_FRAME_SANDBOX,
  );
});
