// W8 —— 前端不可信内容渲染面加固的回归防线。
//
// 硬规则（改坏任意一行都必须让本文件变红）：
//   1. 对不可信来源，allow-scripts 与 allow-same-origin 不得同时出现；
//   2. 只有 workbench-routes.ts 写死的白名单 base 能走 same-origin 嵌入路径；
//   3. 域名后缀不构成信任依据——oceanleo.app 与预览/UGC 子域永远不可信；
//   4. postMessage 双向校验 origin，targetOrigin 不得为 `*`；
//   5. 来自 frame 的消息限定为白名单指令集。

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EDITOR_PROTOCOL,
  EDITOR_TO_HOST_MESSAGE_TYPES,
  HOST_TO_EDITOR_MESSAGE_TYPES,
  acceptEditorFrameMessage,
  buildEditorEmbedUrl,
  isTrustedEditorOrigin,
  isValidEditorTargetOrigin,
} from "../src/shell/editor-protocol.ts";
import {
  COVER_FRAME_SANDBOX,
  PDF_FRAME_SANDBOX_EXEMPTION,
  SANDBOX_ORIGIN_CONTRACT,
  TRUSTED_EMBED_EDITOR_BASES,
  TRUSTED_EMBED_EDITOR_ORIGINS,
  TRUSTED_EMBED_EDITOR_SANDBOX,
  TRUSTED_INTERACTIVE_VIEWER_SANDBOX,
  UNTRUSTED_CONTENT_REGISTRABLE_DOMAINS,
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
  isTrustedEmbedEditorBase,
  isTrustedInteractiveViewerUrl,
  isUntrustedContentHostname,
  isUntrustedContentUrl,
  sandboxGrantsScriptedSameOrigin,
  sandboxTokens,
  webViewerFrameSandbox,
} from "../src/shell/editor-sandbox-origin.ts";

import { compileModule, realModule } from "./helpers/module-bench.mjs";

function source(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const PREVIEW_HOST = `p8080-${"a".repeat(32)}.website.oceanleo.com`;

const UNTRUSTED_URLS = [
  "https://oceanleo.app/",
  "https://game-42.oceanleo.app/index.html",
  "https://p3000-deadbeefdeadbeefdeadbeefdeadbeef.website.oceanleo.com/",
  `https://${PREVIEW_HOST}/`,
  "https://anything.preview.oceanleo.com/",
  "https://evil.test/",
  "https://oceanleo.com.evil.test/",
];

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：两者同时出现时 frame 内脚本可以自己移除 sandbox 属性再重载，等于把不可信内容放回宿主 origin。
test("W8/1 沙箱组合：不可信来源永不同时拿到 allow-scripts 与 allow-same-origin", () => {
  assert.equal(SANDBOX_ORIGIN_CONTRACT, "oceanleo.sandbox-origin.v1");
  // 不可信 frame 与封面 frame 的组合本身就不允许同源。
  assert.equal(sandboxGrantsScriptedSameOrigin(UNTRUSTED_FRAME_SANDBOX), false);
  assert.equal(sandboxGrantsScriptedSameOrigin(COVER_FRAME_SANDBOX), false);
  assert.ok(UNTRUSTED_FRAME_SANDBOX.includes("allow-scripts"));
  assert.equal(UNTRUSTED_FRAME_SANDBOX.includes("allow-same-origin"), false);
  assert.equal(COVER_FRAME_SANDBOX.includes("allow-same-origin"), false);
  // 只有第一方白名单来源才被明确允许同源（并被本断言锁死其定义）。
  assert.equal(
    sandboxGrantsScriptedSameOrigin(TRUSTED_EMBED_EDITOR_SANDBOX),
    true,
  );
  assert.equal(
    sandboxGrantsScriptedSameOrigin(TRUSTED_INTERACTIVE_VIEWER_SANDBOX),
    true,
  );
});

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：白名单外的 URL 若还能拿到 allow-same-origin 组合，任意来源都取得了第一方 origin 能力。
test("W8/1 workbench 嵌入：白名单 base 保留同源，任何其他 URL 立即降级", () => {
  for (const base of TRUSTED_EMBED_EDITOR_BASES) {
    assert.equal(isTrustedEmbedEditorBase(base), true, base);
    assert.equal(embedEditorFrameSandbox(base), TRUSTED_EMBED_EDITOR_SANDBOX);
  }
  const userControlled = [
    ...UNTRUSTED_URLS,
    // 同一台第一方主机上的其他路径也不在白名单内。
    "https://website.oceanleo.com/embed/attacker",
    "https://design.oceanleo.com/embed/editor?next=https://evil.test",
    "https://user.oceanleo.app/embed/editor",
    "",
  ];
  for (const base of userControlled) {
    assert.equal(isTrustedEmbedEditorBase(base), false, base);
    assert.equal(embedEditorFrameSandbox(base), UNTRUSTED_FRAME_SANDBOX, base);
    assert.equal(
      sandboxGrantsScriptedSameOrigin(embedEditorFrameSandbox(base)),
      false,
      base,
    );
  }
});

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：§8.3 只允许「URL 恒来自写死白名单」的可信来源保留该组合；两侧漂移就意味着有一条嵌入路由不在证明范围内。
test("W8/1 白名单 base 与 workbench-routes.ts 的写死字面量保持一一对应", () => {
  const routes = source("../src/shell/workbench-routes.ts");
  const declared = [
    ...routes.matchAll(/base:\s*"(https:\/\/[^"]+)"/g),
  ].map((match) => match[1]);
  assert.ok(declared.length >= 3, "workbench-routes.ts 必须写死 embed base");
  for (const base of declared) {
    assert.equal(
      isTrustedEmbedEditorBase(base),
      true,
      `${base} 不在 TRUSTED_EMBED_EDITOR_BASES 中；新增嵌入路由必须同步白名单`,
    );
  }
  for (const base of TRUSTED_EMBED_EDITOR_BASES) {
    assert.ok(
      declared.includes(base),
      `${base} 已从 workbench-routes.ts 消失，白名单必须收窄`,
    );
  }
});

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：内联字面量绕过共享策略，新增 iframe 或改宽 sandbox 都不会被任何断言看见。
test("W8/1 iframe 渲染面不得内联 sandbox 字面量，必须取自共享策略", () => {
  const surfaces = {
    "workbench-embed.tsx": source("../src/shell/workbench-embed.tsx"),
    "library-viewers.tsx": source("../src/shell/library-viewers.tsx"),
    "WebsiteArtifactViewer.tsx": source(
      "../src/shell/WebsiteArtifactViewer.tsx",
    ),
    "workspace-library-cover.tsx": source(
      "../src/shell/workspace-library-cover.tsx",
    ),
  };
  // 每个渲染面的 iframe 数量、sandbox 表达式与豁免数量全部锁死：任何新增
  // iframe 或改动 sandbox 表达式都会让本用例变红，必须重新评审。
  const expected = {
    "workbench-embed.tsx": {
      iframes: 1,
      exemptions: 0,
      sandbox: ["{frameSandbox}"],
    },
    "library-viewers.tsx": {
      iframes: 2,
      exemptions: 1,
      sandbox: ["{webViewerFrameSandbox(trustedInteractive)}"],
    },
    // 网站素材的就地预览承载（W3）：只允许最严的那一档，`false` 是写死的，
    // 因此它永远拿不到 TRUSTED_INTERACTIVE_VIEWER_SANDBOX 那条 same-origin 分支。
    "WebsiteArtifactViewer.tsx": {
      iframes: 1,
      exemptions: 0,
      sandbox: ["{webViewerFrameSandbox(false)}"],
    },
    // 该模块被渲染测试以 data: URL 加载，无法引入相对运行时依赖，因此保留
    // 与 COVER_FRAME_SANDBOX 等值的字面量，由本断言锁住取值。
    "workspace-library-cover.tsx": {
      iframes: 1,
      exemptions: 1,
      sandbox: ['{plan.renderer === "website" ? "allow-scripts" : undefined}'],
    },
  };
  let exemptions = 0;
  for (const [name, text] of Object.entries(surfaces)) {
    const sandboxAttributes = [...text.matchAll(/sandbox=(\{[^}]*\}|"[^"]*")/g)]
      .map((match) => match[1]);
    const exempt = (text.match(/sandbox-exempt: pdf-plugin/g) || []).length;
    exemptions += exempt;
    assert.equal((text.match(/<iframe/g) || []).length, expected[name].iframes,
      `${name}: iframe 数量变化必须重新评审 sandbox 组合`);
    assert.deepEqual(sandboxAttributes, expected[name].sandbox, name);
    assert.equal(exempt, expected[name].exemptions, `${name}: 豁免数量`);
    // 注释里可以谈论 allow-same-origin，但不得以字符串字面量出现在代码里。
    assert.equal(
      /["'`][^"'`\n]*allow-same-origin/.test(text),
      false,
      `${name}: 渲染面不得内联 allow-same-origin 字符串`,
    );
  }
  assert.equal(
    sandboxGrantsScriptedSameOrigin("allow-scripts"),
    false,
    "封面字面量必须与 COVER_FRAME_SANDBOX 同义",
  );
  assert.equal(COVER_FRAME_SANDBOX, "allow-scripts");
  // 豁免只允许存在于两处 PDF frame（封面 + 文档查看器），且必须写明理由。
  assert.equal(exemptions, 2, "sandbox 豁免数量变化必须重新评审");
  assert.ok(
      PDF_FRAME_SANDBOX_EXEMPTION === "sandbox-exempt: pdf-plugin" &&
      source("../src/shell/editor-sandbox-origin.ts").includes("crbug 413851"),
    "PDF 豁免必须保留其浏览器约束依据",
  );
  for (const name of [
    "library-viewers.tsx",
    "WebsiteArtifactViewer.tsx",
    "workspace-library-cover.tsx",
  ]) {
    assert.ok(
      surfaces[name].includes('referrerPolicy="no-referrer"'),
      `${name}: 免沙箱的 PDF frame 至少要阻断 Referer 外泄`,
    );
  }
  assert.ok(
    surfaces["workbench-embed.tsx"].includes(
      "isTrustedEmbedEditorBase(editorBase)",
    ),
    "workbench-embed 必须在构造 src 前校验 base 属于写死白名单",
  );
});

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：依据域名后缀授信会把未来任何新开的子域自动纳入可信集合（§7.5），预览/UGC 域首当其冲。
test("W8/2 预览与 UGC 域不因域名后缀获得信任", () => {
  // C5：不可信集合只增不减 —— 境内用户内容域 leoapp.cn 与海外的 oceanleo.app 同级。
  assert.deepEqual(
    [...UNTRUSTED_CONTENT_REGISTRABLE_DOMAINS],
    ["oceanleo.app", "leoapp.cn"],
  );
  for (const host of [
    "oceanleo.app",
    "www.oceanleo.app",
    "p1-abc.oceanleo.app",
    PREVIEW_HOST,
    "anything.website.oceanleo.com",
    "preview.oceanleo.com",
    "x.sandbox.oceanleo.com",
    // C5：境内家族的同款主机，在 `.com` 页面上也必须是不可信的。
    "leoapp.cn",
    "www.leoapp.cn",
    "p1-abc.leoapp.cn",
    `p8080-${"a".repeat(32)}.website.oceanleo.cn`,
    "preview.oceanleo.cn",
    "x.sandbox.oceanleo.cn",
    "x.usercontent.oceanleo.cn",
  ]) {
    assert.equal(isUntrustedContentHostname(host), true, host);
    assert.equal(isTrustedEditorOrigin(`https://${host}`), false, host);
    assert.equal(
      isTrustedInteractiveViewerUrl(`https://${host}/workflow.html`),
      false,
      host,
    );
  }
  // 第一方主机不受影响。
  for (const host of [
    "oceanleo.com",
    "website.oceanleo.com",
    "design.oceanleo.com",
    "video.oceanleo.com",
    "asset.oceanleo.com",
  ]) {
    assert.equal(isUntrustedContentHostname(host), false, host);
    assert.equal(isTrustedEditorOrigin(`https://${host}`), true, host);
    assert.equal(
      isTrustedInteractiveViewerUrl(`https://${host}/workflow.html`),
      true,
      host,
    );
  }
  // C5/3 跨族不互信：本进程是默认家族（com），因此 `.cn` 的第一方主机在这里
  // 一律不可信。境内页面去嵌一个 .com 主机（或反过来）不只是信任问题 ——
  // 它把境内用户的请求送出境。注意这些 host 都**不是** UGC 域，挡住它们的是
  // 家族判定本身，不是不可信集合。
  for (const host of [
    "oceanleo.cn",
    "api.oceanleo.cn",
    "asset.oceanleo.cn",
    "design.oceanleo.cn",
  ]) {
    assert.equal(isUntrustedContentHostname(host), false, host);
    assert.equal(isTrustedEditorOrigin(`https://${host}`), false, host);
    assert.equal(isValidEditorTargetOrigin(`https://${host}`), false, host);
    assert.equal(
      isTrustedInteractiveViewerUrl(`https://${host}/workflow.html`),
      false,
      host,
    );
  }

  // W7 契约 §2 点名的两个「朴素后缀匹配」陷阱：都必须落在不可信一侧。
  for (const host of [
    "evil-oceanleo.app",
    "x.oceanleo.app.attacker.com",
    "oceanleo.com.evil.test",
  ]) {
    assert.equal(isTrustedEditorOrigin(`https://${host}`), false, host);
    assert.equal(
      isTrustedInteractiveViewerUrl(`https://${host}/a.html`),
      false,
      host,
    );
  }
  assert.equal(isUntrustedContentUrl("not a url"), true);
  assert.equal(isUntrustedContentUrl("https://asset.oceanleo.com/a.html"), false);
  // http、带端口、带凭据的地址不得取得交互式信任。
  assert.equal(
    isTrustedInteractiveViewerUrl("http://asset.oceanleo.com/a.html"),
    false,
  );
  assert.equal(
    isTrustedInteractiveViewerUrl("https://asset.oceanleo.com:8443/a.html"),
    false,
  );
  assert.equal(
    isTrustedInteractiveViewerUrl("https://user:pw@asset.oceanleo.com/a.html"),
    false,
  );
  assert.equal(
    webViewerFrameSandbox(
      isTrustedInteractiveViewerUrl(`https://${PREVIEW_HOST}/index.html`),
    ),
    UNTRUSTED_FRAME_SANDBOX,
  );
});

// UC-3 §8.3 + UC-6 §8.6（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：境内家族若还能拿到 .com 的内嵌白名单，境内页面就会给一个境外主机
// allow-same-origin，并把 postMessage 投过去 —— 既是跨族身份事故，也是数据出境事故
// （_COMMON.md §1b.2）。反过来，白名单为空必须表现为「整条嵌入路径不可用」，
// 而不是「降级成不可信沙箱后照样加载那个 .com 地址」。
test("C5 境内家族：内嵌编辑器白名单为空，整条嵌入路径 fail closed", () => {
  const probe = `
    const sandbox = await import(${JSON.stringify(
      new URL("../src/shell/editor-sandbox-origin.ts", import.meta.url).href,
    )});
    const protocol = await import(${JSON.stringify(
      new URL("../src/shell/editor-protocol.ts", import.meta.url).href,
    )});
    const comBase = "https://website.oceanleo.com/embed/site-editor";
    let buildThrew = false;
    try {
      protocol.buildEditorEmbedUrl(comBase, {
        instanceId: "i1",
        hostOrigin: "https://oceanleo.cn",
      });
    } catch {
      buildThrew = true;
    }
    process.stdout.write(JSON.stringify({
      bases: [...sandbox.TRUSTED_EMBED_EDITOR_BASES],
      origins: [...sandbox.TRUSTED_EMBED_EDITOR_ORIGINS],
      comBaseTrusted: sandbox.isTrustedEmbedEditorBase(comBase),
      comBaseSandbox: sandbox.embedEditorFrameSandbox(comBase),
      comBaseGrantsSameOrigin: sandbox.sandboxGrantsScriptedSameOrigin(
        sandbox.embedEditorFrameSandbox(comBase),
      ),
      buildThrew,
      comViewer: sandbox.isTrustedInteractiveViewerUrl("https://asset.oceanleo.com/a.html"),
      cnViewer: sandbox.isTrustedInteractiveViewerUrl("https://asset.oceanleo.cn/a.html"),
      comEditorOrigin: protocol.isTrustedEditorOrigin("https://design.oceanleo.com"),
      cnEditorOrigin: protocol.isTrustedEditorOrigin("https://design.oceanleo.cn"),
      appUntrusted: sandbox.isUntrustedContentHostname("oceanleo.app"),
      leoappUntrusted: sandbox.isUntrustedContentHostname("leoapp.cn"),
      cnPreviewUntrusted: sandbox.isUntrustedContentHostname(
        "p8080-" + "a".repeat(32) + ".website.oceanleo.cn",
      ),
    }));
  `;
  const child = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      "--experimental-loader",
      new URL("./ts-extension-loader.mjs", import.meta.url).href,
      "--input-type=module",
      "-e",
      probe,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY: "cn" },
    },
  );
  assert.equal(child.status, 0, child.stderr);
  const cn = JSON.parse(child.stdout);

  // 境内 v1 没有 website/design/video 三个子站 → 白名单是空的，不是「换成 .cn 的」。
  assert.deepEqual(cn.bases, []);
  assert.deepEqual(cn.origins, []);
  // .com 的 base 在境内既不可信，也拿不到 same-origin，且构造器直接拒绝。
  assert.equal(cn.comBaseTrusted, false);
  assert.equal(cn.comBaseSandbox, UNTRUSTED_FRAME_SANDBOX);
  assert.equal(cn.comBaseGrantsSameOrigin, false);
  assert.equal(cn.buildThrew, true, "境内不得构造出指向 .com 编辑器的 embed URL");
  // 第一方判定整体换族：境内只信 .cn，不信 .com。
  assert.equal(cn.comViewer, false, "境内页面不得把 .com 主机当第一方");
  assert.equal(cn.cnViewer, true);
  assert.equal(cn.comEditorOrigin, false);
  assert.equal(cn.cnEditorOrigin, true);
  // 两个家族的 UGC 域在境内同样都不可信（只增不减）。
  assert.equal(cn.appUntrusted, true);
  assert.equal(cn.leoappUntrusted, true);
  assert.equal(cn.cnPreviewUntrusted, true);
});

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：本地再写一遍 hostname.endsWith(".oceanleo.com") 就会把预览与 UGC 主机重新判成可信交互来源。
test("W8/2 library-viewers 的 trustedInteractive 只由共享判定授予", () => {
  const viewers = source("../src/shell/library-viewers.tsx");
  assert.ok(
    viewers.includes("isTrustedInteractiveViewerUrl(item.url)"),
    "trustedInteractive 必须走共享的第一方判定",
  );
  assert.equal(
    /endsWith\(["'`]\.oceanleo\.com/.test(viewers),
    false,
    "不得再以域名后缀直接判定可信",
  );
});

// UC-6 §8.6（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：投递侧写 '*' 等于把宿主消息广播给当前占据该 frame 的任何 origin。
test("W8/3 targetOrigin 不得为 `*`，且只允许白名单编辑器 origin", () => {
  assert.deepEqual([...TRUSTED_EMBED_EDITOR_ORIGINS].sort(), [
    "https://design.oceanleo.com",
    "https://video.oceanleo.com",
    "https://website.oceanleo.com",
  ]);
  assert.equal(isValidEditorTargetOrigin("*"), false);
  assert.equal(isValidEditorTargetOrigin(""), false);
  assert.equal(isValidEditorTargetOrigin("https://oceanleo.app"), false);
  assert.equal(isValidEditorTargetOrigin(`https://${PREVIEW_HOST}`), false);
  for (const origin of TRUSTED_EMBED_EDITOR_ORIGINS) {
    assert.equal(isValidEditorTargetOrigin(origin), true, origin);
  }
  for (const file of [
    "../src/shell/workbench-embed.tsx",
    "../src/shell/use-embed-editor-messages.ts",
    "../src/shell/library-viewers.tsx",
  ]) {
    const text = source(file);
    assert.equal(
      /postMessage\([^;]*["'`]\*["'`]/s.test(text),
      false,
      `${file}: postMessage 的 targetOrigin 不得为 *`,
    );
  }
  const embed = source("../src/shell/workbench-embed.tsx");
  const posts = (embed.match(/postMessage\(/g) || []).length;
  const guards = (embed.match(/isValidEditorTargetOrigin\(editorOrigin\)/g) || [])
    .length;
  assert.ok(posts > 0 && guards >= 2, "每条投递路径都要先校验 targetOrigin");
});

// UC-6 §8.6（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：接收侧缺任一项校验，其他页面就能冒充编辑器 frame 向宿主发指令；origin 合法也不等于消息可信。
test("W8/3 收信闸门：source、origin、instance 与指令白名单缺一不可", () => {
  const frameWindow = { name: "editor-frame" };
  const gate = {
    expectedOrigin: "https://design.oceanleo.com",
    frameWindow,
    instanceId: "instance-1",
  };
  const ready = {
    protocol: EDITOR_PROTOCOL,
    instanceId: "instance-1",
    type: "ready",
  };
  assert.deepEqual(
    acceptEditorFrameMessage(
      { origin: gate.expectedOrigin, source: frameWindow, data: ready },
      gate,
    ),
    ready,
  );
  // 其他窗口（含 opener、顶层页面）冒充。
  assert.equal(
    acceptEditorFrameMessage(
      { origin: gate.expectedOrigin, source: { other: true }, data: ready },
      gate,
    ),
    null,
  );
  // origin 不匹配 / 不可信 origin / 预期 origin 本身不可信。
  assert.equal(
    acceptEditorFrameMessage(
      { origin: "https://video.oceanleo.com", source: frameWindow, data: ready },
      gate,
    ),
    null,
  );
  assert.equal(
    acceptEditorFrameMessage(
      { origin: "https://evil.oceanleo.app", source: frameWindow, data: ready },
      { ...gate, expectedOrigin: "https://evil.oceanleo.app" },
    ),
    null,
  );
  assert.equal(
    acceptEditorFrameMessage(
      { origin: "*", source: frameWindow, data: ready },
      { ...gate, expectedOrigin: "*" },
    ),
    null,
  );
  // instance 串扰。
  assert.equal(
    acceptEditorFrameMessage(
      {
        origin: gate.expectedOrigin,
        source: frameWindow,
        data: { ...ready, instanceId: "instance-2" },
      },
      gate,
    ),
    null,
  );
  // 通用代理式指令必须被白名单挡住——origin 合法 ≠ 消息可信。
  for (const type of [
    "proxy-fetch",
    "http-request",
    "read-projects",
    "call-api",
    "eval",
    "__proto__",
  ]) {
    assert.equal(
      acceptEditorFrameMessage(
        {
          origin: gate.expectedOrigin,
          source: frameWindow,
          data: { ...ready, type },
        },
        gate,
      ),
      null,
      type,
    );
  }
});

// UC-6 §8.6（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：指令集扩出 proxy-fetch/call-api 这类形态即成通用代理（§7.3），域隔离被整体撤销。
test("W8/3 协议指令集保持最小闭集", () => {
  for (const forbidden of ["proxy-fetch", "http-request", "call-api", "eval"]) {
    assert.equal(EDITOR_TO_HOST_MESSAGE_TYPES.has(forbidden), false, forbidden);
    assert.equal(HOST_TO_EDITOR_MESSAGE_TYPES.has(forbidden), false, forbidden);
  }
  assert.equal(EDITOR_TO_HOST_MESSAGE_TYPES.size, 17);
  assert.equal(HOST_TO_EDITOR_MESSAGE_TYPES.size, 14);
  // 白名单必须是入口处的 fail-closed 前置判断，而不是「逐类型校验碰巧兜住了」。
  const protocol = source("../src/shell/editor-protocol.ts");
  assert.ok(
    protocol.includes("!EDITOR_TO_HOST_MESSAGE_TYPES.has(type)"),
    "asEditorToHostMessage 必须先过指令白名单",
  );
  assert.ok(
    protocol.includes("!HOST_TO_EDITOR_MESSAGE_TYPES.has(type)"),
    "asHostToEditorMessage 必须先过指令白名单",
  );
  const messages = source("../src/shell/use-embed-editor-messages.ts");
  assert.ok(
    messages.includes("acceptEditorFrameMessage(event, {"),
    "收信必须走共享闸门，不得在 hook 内自行拼 origin 判断",
  );
});

// UC-3 §8.3 + UC-6 §8.6（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：构造器若接受任意 base，白名单 sandbox 组合与白名单 targetOrigin 都会被绕开。
test("W8/3 嵌入 URL 构造只接受白名单 base", () => {
  const url = buildEditorEmbedUrl(
    "https://design.oceanleo.com/embed/editor",
    { instanceId: "instance-1", hostOrigin: "https://oceanleo.com" },
  );
  assert.equal(new URL(url).origin, "https://design.oceanleo.com");
  for (const base of [
    "https://website.oceanleo.com/embed/attacker",
    "https://p1-aaaa.oceanleo.app/embed/editor",
    `https://${PREVIEW_HOST}/embed/site-editor`,
  ]) {
    assert.throws(
      () =>
        buildEditorEmbedUrl(base, {
          instanceId: "instance-1",
          hostOrigin: "https://oceanleo.com",
        }),
      undefined,
      base,
    );
  }
});

// ===========================================================================
// W24 —— 子站工作台内嵌 frame（此前完全没有 sandbox 属性的三处）
//
// UC-3：docs/architecture/oceanleo-untrusted-content-isolation.md §8.3
//       （契约 oceanleo.sandbox-origin.v1 §3 第三档「第一方内嵌」）
//
// 这三处的 src 不是写死字面量：origin 来自消费端注入的 siteOrigin 映射，key 来自
// 后端 /v1/agents(/mine) 的 site_id。因此下面的断言必须**双向对账**：
//   (a) 锁死 sandbox 字符串本身（档位、禁用 token、与共享常量同一事实源）；
//   (b) 锁死「什么 URL 才配拿到这个 sandbox」——第一方判定不通过就完全不渲染 frame。
// 只锁 (a) 会被「保留 sandbox、把来源换成 oceanleo.app」绕过；
// 只锁 (b) 会被「保留来源判定、把 sandbox 松开或删掉」绕过。
// ===========================================================================

/** 从源码里取出带标记的区块，直接编译真实源码来跑运行时断言（不是复刻实现）。 */
function extractRegion(text, name) {
  const start = text.indexOf(`// #region ${name}`);
  const end = text.indexOf(`// #endregion ${name}`);
  assert.ok(
    start >= 0 && end > start,
    `Playground.tsx 必须保留 #region ${name} 区块`,
  );
  return text.slice(start, end);
}

const W24_PLAYGROUND = source("../src/shell/Playground.tsx");
const W24_TRUST_REGION = extractRegion(W24_PLAYGROUND, "workspace-embed-trust");
// Playground 里那段信任判定是 `#region` 摘出来的片段，不是整份源文件；落到临时
// 真文件再走共享编译台，相对/包名边同样自动解析，只钉一条显式桩把白名单模块接上。
const workspaceEmbedTrustScratch = join(
  mkdtempSync(join(tmpdir(), "oceanleo-workspace-embed-trust-")),
  "workspace-embed-trust.ts",
);
writeFileSync(
  workspaceEmbedTrustScratch,
  `import { TRUSTED_EMBED_EDITOR_SANDBOX, isTrustedInteractiveViewerUrl } from "oceanleo-editor-sandbox-origin";\n${W24_TRUST_REGION}`,
  "utf8",
);
const workspaceEmbedTrust = await import(
  await compileModule(workspaceEmbedTrustScratch, {
    "oceanleo-editor-sandbox-origin": realModule(
      "src/shell/editor-sandbox-origin.ts",
    ),
  })
);

const W24_TRUSTED_ORIGINS = [
  "https://med.oceanleo.com",
  "https://website.oceanleo.com",
  // 末尾斜杠是消费端常见写法，归一化后仍必须落在 /workspace。
  "https://design.oceanleo.com/",
];

const W24_UNTRUSTED_ORIGINS = [
  // UGC 独立可注册域：迁移到 oceanleo.app 之后最可能被顺手接进来的来源。
  "https://user.oceanleo.app",
  "https://oceanleo.app",
  // 仍残留在 .oceanleo.com 下的预览/沙箱主机。
  `https://p8080-${"a".repeat(32)}.website.oceanleo.com`,
  "https://preview.oceanleo.com",
  "https://x.sandbox.oceanleo.com",
  // 后缀陷阱与第三方。
  "https://oceanleo.com.evil.test",
  "https://evil-oceanleo.app",
  "https://evil.test",
  // 协议/端口/凭据降级。
  "http://med.oceanleo.com",
  "https://med.oceanleo.com:8443",
  "https://user:pw@med.oceanleo.com",
  "javascript:alert(1)",
  // 相对地址会落回宿主 origin（= 共享 cookie 域），必须挡住。
  "",
  "//evil.test",
  "/proxy",
  // origin 里带路径 → 拼出来的 path 不再是 /workspace。
  "https://med.oceanleo.com/tenant",
];

test("W24/1 三处内嵌 frame 的沙箱字符串锁死在第一方档位", () => {
  // UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md §8.3
  // 与 W8 的协议编辑器同一事实源——第一方页面、同样需要同源读会话。
  assert.equal(
    workspaceEmbedTrust.WORKSPACE_EMBED_SANDBOX,
    TRUSTED_EMBED_EDITOR_SANDBOX,
  );
  assert.equal(
    workspaceEmbedTrust.WORKSPACE_EMBED_SANDBOX,
    "allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals",
  );
  const tokens = sandboxTokens(workspaceEmbedTrust.WORKSPACE_EMBED_SANDBOX);
  // W7 契约 §3：顶层导航与「弹窗脱离沙箱」任何档位都不给。
  for (const forbidden of [
    "allow-top-navigation",
    "allow-top-navigation-by-user-activation",
    "allow-top-navigation-to-custom-protocols",
    "allow-popups-to-escape-sandbox",
    "allow-presentation",
  ]) {
    assert.equal(tokens.has(forbidden), false, forbidden);
  }
  // 同时拿到 allow-scripts 与 allow-same-origin 是第三档的第一方特权，
  // 其正当性完全依赖 W24/2 的来源判定；两条断言必须一起看。
  assert.equal(
    sandboxGrantsScriptedSameOrigin(
      workspaceEmbedTrust.WORKSPACE_EMBED_SANDBOX,
    ),
    true,
  );
  assert.equal(workspaceEmbedTrust.WORKSPACE_EMBED_PATH, "/workspace");
});

test("W24/2 来源判定：不可信 origin 一律拿不到 src，因而拿不到沙箱", () => {
  // UC-3 §8.3：判定不得依据域名后缀，必须逐个 URL 证明是第一方 /workspace。
  const { workspaceEmbedSrc, isTrustedWorkspaceEmbedUrl } = workspaceEmbedTrust;
  assert.equal(
    workspaceEmbedSrc(
      { med: "https://med.oceanleo.com" },
      { agent_id: "a 1", site_id: "med", fn_id: "fn/1" },
    ),
    "https://med.oceanleo.com/workspace?embed=1&solo=1&fn=fn%2F1&agent=a%201",
  );
  assert.equal(
    workspaceEmbedSrc(
      { design: "https://design.oceanleo.com/" },
      { agent_id: "a", site_id: "design" },
    ),
    "https://design.oceanleo.com/workspace?embed=1&solo=1&agent=a",
  );
  for (const origin of W24_TRUSTED_ORIGINS) {
    const src = workspaceEmbedSrc({ s: origin }, { agent_id: "a", site_id: "s" });
    assert.notEqual(src, "", origin);
    assert.equal(isTrustedWorkspaceEmbedUrl(src), true, origin);
  }
  for (const origin of W24_UNTRUSTED_ORIGINS) {
    assert.equal(
      workspaceEmbedSrc({ s: origin }, { agent_id: "a", site_id: "s" }),
      "",
      `${origin} 必须拿不到 src`,
    );
    assert.equal(
      isTrustedWorkspaceEmbedUrl(`${origin}/workspace?embed=1&solo=1&agent=a`),
      false,
      origin,
    );
  }
  // 绑定断言：任何被渲染出去的 src 都必须自己通过第一方判定。
  for (const origin of [...W24_TRUSTED_ORIGINS, ...W24_UNTRUSTED_ORIGINS]) {
    const src = workspaceEmbedSrc({ s: origin }, { agent_id: "a", site_id: "s" });
    assert.equal(src === "" || isTrustedWorkspaceEmbedUrl(src), true, origin);
  }
  // site_id 命中 Object.prototype 的继承属性时不得拼出相对地址（会落回宿主 origin）。
  for (const siteId of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    assert.equal(
      workspaceEmbedSrc({}, { agent_id: "a", site_id: siteId }),
      "",
      siteId,
    );
  }
  assert.equal(workspaceEmbedSrc({}, null), "");
  assert.equal(workspaceEmbedSrc({}, { agent_id: "a" }), "");
  assert.equal(workspaceEmbedSrc({ s: "" }, { agent_id: "a", site_id: "s" }), "");
});

test("W24/3 三处渲染面：iframe、sandbox 与 src 表达式集合相等且互相绑定", () => {
  // UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md §8.3
  const surfaces = {
    "Playground.tsx": W24_PLAYGROUND,
    "WorkspaceMasterDetail.tsx": source("../src/shell/WorkspaceMasterDetail.tsx"),
    "WorkspaceShell.tsx": source("../src/shell/WorkspaceShell.tsx"),
  };
  for (const [name, text] of Object.entries(surfaces)) {
    const frames = [...text.matchAll(/<iframe\b/g)].map((match) =>
      text.slice(match.index, text.indexOf("/>", match.index)),
    );
    assert.equal(frames.length, 1, `${name}: 新增 iframe 必须重新评审 sandbox 组合`);
    const [frame] = frames;
    // sandbox 与 src 必须落在**同一个** iframe 上：否则「给别的 frame 加沙箱」
    // 也能让计数类断言变绿。
    assert.deepEqual(
      [...frame.matchAll(/sandbox=(\{[^}]*\}|"[^"]*")/g)].map((m) => m[1]),
      ["{WORKSPACE_EMBED_SANDBOX}"],
      `${name}: sandbox 必须取自共享常量`,
    );
    assert.deepEqual(
      [...frame.matchAll(/\bsrc=(\{[^}]*\}|"[^"]*")/g)].map((m) => m[1]),
      ["{embedSrc}"],
      `${name}: src 必须是被判定过的 embedSrc`,
    );
    // embedSrc 只有一个赋值点，且只能来自带判定的共享构造器。
    assert.equal(
      (text.match(/embedSrc\s*=/g) || []).length,
      1,
      `${name}: embedSrc 只允许一个赋值点`,
    );
    assert.ok(
      text.includes("workspaceEmbedSrc(siteOrigin, active)"),
      `${name}: embedSrc 必须来自 workspaceEmbedSrc`,
    );
    // 渲染面不得内联沙箱串，也不得出现 PDF 那种免沙箱豁免。
    assert.equal(
      /["'`][^"'`\n]*allow-same-origin/.test(text),
      false,
      `${name}: 渲染面不得内联 allow-same-origin 字符串`,
    );
    assert.equal(
      text.includes(PDF_FRAME_SANDBOX_EXEMPTION),
      false,
      `${name}: 这三处不是 PDF frame，不得套用免沙箱豁免`,
    );
  }
  // 两个消费方只能引用 Playground 的共享实现，不得各自拼 URL。
  for (const name of ["WorkspaceMasterDetail.tsx", "WorkspaceShell.tsx"]) {
    const text = surfaces[name];
    assert.match(
      text,
      /import \{[^}]*WORKSPACE_EMBED_SANDBOX[^}]*\} from "\.\/Playground"/s,
      `${name}: 沙箱常量必须来自 ./Playground`,
    );
    assert.match(
      text,
      /import \{[^}]*workspaceEmbedSrc[^}]*\} from "\.\/Playground"/s,
      `${name}: 构造器必须来自 ./Playground`,
    );
    const code = text
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    assert.equal(
      code.includes("embed=1"),
      false,
      `${name}: 不得自行拼子站内嵌 URL`,
    );
  }
  // 判定逻辑只存在于 Playground 的这一个区块里。
  assert.equal(
    (W24_PLAYGROUND.match(/isTrustedInteractiveViewerUrl\(/g) || []).length,
    1,
    "Playground.tsx: 第一方判定只允许区块内这一个调用点",
  );
  assert.ok(W24_TRUST_REGION.includes("isTrustedInteractiveViewerUrl(value)"));
  assert.ok(W24_TRUST_REGION.includes("Object.prototype.hasOwnProperty.call"));
  // 规则编号与架构文档链接必须留在区块里，防止后人当噪音删掉。
  assert.ok(W24_TRUST_REGION.includes("UC-3"));
  assert.ok(
    W24_TRUST_REGION.includes(
      "docs/architecture/oceanleo-untrusted-content-isolation.md §8.3",
    ),
  );
});
