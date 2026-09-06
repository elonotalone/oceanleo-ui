// R8 —— 家族嵌入源覆盖。生产宿主不可被 query/cookie/env 改；LeoDev 只接受
// 槽位主机或 Hosted 编辑器全串。
//
// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：生产页若认 `?embed_origin=`，任意分享链接就能把 iframe 指到
// 攻击者 origin，且该 frame 仍可能拿到 allow-scripts + allow-same-origin。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildEditorEmbedUrl } from "../src/shell/editor-protocol.ts";
import { HOSTED_EDITOR_ORIGINS } from "../src/shell/hosted-editor-origins.ts";
import { TRUSTED_EMBED_EDITOR_SANDBOX, UNTRUSTED_FRAME_SANDBOX } from "../src/shell/editor-sandbox-origin.ts";
import { isLeoDevPreviewHost } from "../src/lib/auth/config.ts";
import {
  FAMILY_EMBED_PATHS,
  applyFamilyEmbedOriginOverride,
  canLoadFamilyEmbedBase,
  familyEmbedFrameSandbox,
  isAllowedFamilyEmbedOverrideOrigin,
  isFamilyEmbedOverrideHost,
  isLeoDevFamilyEmbedBase,
} from "../src/shell/family-embed-origin.ts";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const SLOT = "p-07e5e1a19413945e8eecf1fec4877269.dev.oceanleo.com";
const SLOT_B = "p-3364800b1d5563d4c0b4ae6904e391fd.dev.oceanleo.com";
const WEBSITE_BASE = "https://website.oceanleo.com/embed/site-editor";
const DESIGN_BASE = "https://design.oceanleo.com/embed/editor";
const VIDEO_BASE = "https://video.oceanleo.com/canvas-board";
const SLOT_ORIGIN = `https://${SLOT}`;
const SLOT_WEBSITE = `${SLOT_ORIGIN}/embed/site-editor`;

const PRODUCTION_HOSTS = [
  "website.oceanleo.com",
  "design.oceanleo.com",
  "video.oceanleo.com",
  "excel.oceanleo.com",
  "oceanleo.com",
  "www.oceanleo.com",
];

function apply(base, host, extras = {}) {
  return applyFamilyEmbedOriginOverride(base, { host, ...extras });
}

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：LeoDev 宿主判定一旦放宽成后缀，任意 `*.dev.oceanleo.com` 都能改嵌入源。
test("LeoDev 宿主判定与 isLeoDevPreviewHost 同一条正则", () => {
  assert.equal(isFamilyEmbedOverrideHost(SLOT), true);
  assert.equal(isLeoDevPreviewHost(SLOT), true);
  assert.equal(isFamilyEmbedOverrideHost("p-nothex.dev.oceanleo.com"), false);
  assert.equal(isFamilyEmbedOverrideHost("evil.dev.oceanleo.com"), false);
  assert.equal(isFamilyEmbedOverrideHost("website.oceanleo.com"), false);
  assert.match(
    source("../src/shell/family-embed-origin.ts"),
    /\^p-\[0-9a-f\]\{32\}\\.dev\\.oceanleo\\.com\$/,
  );
});

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：按 `*.oceanleo.app` 后缀授信会把用户站和 UGC 预览当成可嵌编辑器。
test("覆盖目标只接受 LeoDev 槽或 Hosted 编辑器全串，拒绝 UGC 与后缀猜测", () => {
  assert.equal(isAllowedFamilyEmbedOverrideOrigin(SLOT_ORIGIN), true);
  for (const origin of HOSTED_EDITOR_ORIGINS) {
    assert.equal(isAllowedFamilyEmbedOverrideOrigin(origin), true, origin);
  }
  for (const origin of [
    "https://p1--base.oceanleo.app",
    "https://game-42.oceanleo.app",
    "https://user.oceanleo.app",
    "https://oceanleo.app",
    "https://evil.dev.oceanleo.com",
    "https://p-nothex.dev.oceanleo.com",
    "https://website.oceanleo.com",
    "https://evil.com",
    "http://p-07e5e1a19413945e8eecf1fec4877269.dev.oceanleo.com",
  ]) {
    assert.equal(isAllowedFamilyEmbedOverrideOrigin(origin), false, origin);
  }
});

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：生产宿主认覆盖，分享链接就能把 iframe 指到攻击者 origin。
test("生产宿主忽略 query / cookie / env，正式域一字不动", () => {
  const attack = {
    search: `?embed_origin=${encodeURIComponent(SLOT_ORIGIN)}&website_embed_origin=${encodeURIComponent("https://evil.com")}`,
    cookieHeader: `embed_origin=${SLOT_ORIGIN}`,
    envValue: SLOT_ORIGIN,
  };
  for (const host of PRODUCTION_HOSTS) {
    assert.equal(apply(WEBSITE_BASE, host, attack), WEBSITE_BASE, host);
    assert.equal(apply(DESIGN_BASE, host, attack), DESIGN_BASE, host);
    assert.equal(apply(VIDEO_BASE, host, attack), VIDEO_BASE, host);
    assert.equal(canLoadFamilyEmbedBase(SLOT_WEBSITE, host), false, host);
    assert.equal(
      familyEmbedFrameSandbox(SLOT_WEBSITE, host),
      UNTRUSTED_FRAME_SANDBOX,
      host,
    );
  }
});

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：覆盖若连路径一起换，就能指到白名单外的 `/embed/attacker`。
test("LeoDev 宿主接受槽位 origin，只换源不换路径", () => {
  assert.equal(
    apply(WEBSITE_BASE, SLOT, { search: `?embed_origin=${encodeURIComponent(SLOT_ORIGIN)}` }),
    SLOT_WEBSITE,
  );
  assert.equal(
    apply(DESIGN_BASE, SLOT, {
      search: `?embed_origin=${encodeURIComponent(`https://${SLOT_B}`)}`,
    }),
    `https://${SLOT_B}/embed/editor`,
  );
  assert.equal(
    apply(VIDEO_BASE, SLOT, { envValue: `https://${SLOT_B}` }),
    `https://${SLOT_B}/canvas-board`,
  );
  assert.equal(
    apply(WEBSITE_BASE, SLOT, {
      search: `?embed_origin=${encodeURIComponent(`${SLOT_ORIGIN}/stolen/path?x=1`)}`,
    }),
    SLOT_WEBSITE,
  );
});

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：http / 凭据 / 端口 / UGC 预览一旦放行，覆盖就不再是第一方编辑器。
test("LeoDev 宿主拒绝攻击者 origin，包括带凭据、端口、http、UGC .app", () => {
  const rejected = [
    "https://evil.com",
    "https://website.oceanleo.com",
    "https://p1--base.oceanleo.app",
    "https://game-42.oceanleo.app",
    "https://user:pass@p-07e5e1a19413945e8eecf1fec4877269.dev.oceanleo.com",
    "https://p-07e5e1a19413945e8eecf1fec4877269.dev.oceanleo.com:444",
    "http://p-07e5e1a19413945e8eecf1fec4877269.dev.oceanleo.com",
    "javascript:alert(1)",
    "https://evil.com/?next=https://p-07e5e1a19413945e8eecf1fec4877269.dev.oceanleo.com",
  ];
  for (const raw of rejected) {
    assert.equal(
      apply(WEBSITE_BASE, SLOT, { search: `?embed_origin=${encodeURIComponent(raw)}` }),
      WEBSITE_BASE,
      raw,
    );
  }
});

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：通用 query 压过分子站参数时，design/video 会被指到错误 origin。
test("分站 query 优先于通用 embed_origin；Hosted 编辑器 origin 可被接受", () => {
  assert.equal(
    apply(WEBSITE_BASE, SLOT, {
      search: `?embed_origin=${encodeURIComponent("https://evil.com")}&website_embed_origin=${encodeURIComponent(SLOT_ORIGIN)}`,
    }),
    SLOT_WEBSITE,
  );
  assert.equal(
    apply(WEBSITE_BASE, SLOT, {
      search: `?embed_origin=${encodeURIComponent(HOSTED_EDITOR_ORIGINS[0])}`,
    }),
    `${HOSTED_EDITOR_ORIGINS[0]}/embed/site-editor`,
  );
});

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：生产宿主给槽位 URL 同源沙箱，等于允许任意页面嵌开发机并读 cookie。
test("LeoDev 家族路径才给同源沙箱；UGC 与生产宿主上的槽位 URL 都不给", () => {
  assert.equal(isLeoDevFamilyEmbedBase(SLOT_WEBSITE), true);
  assert.equal(isLeoDevFamilyEmbedBase(`${SLOT_ORIGIN}/embed/attacker`), false);
  assert.equal(canLoadFamilyEmbedBase(SLOT_WEBSITE, SLOT), true);
  assert.equal(canLoadFamilyEmbedBase(WEBSITE_BASE, SLOT), true);
  assert.equal(
    familyEmbedFrameSandbox(SLOT_WEBSITE, SLOT),
    TRUSTED_EMBED_EDITOR_SANDBOX,
  );
  assert.equal(
    familyEmbedFrameSandbox("https://p1--base.oceanleo.app/", SLOT),
    UNTRUSTED_FRAME_SANDBOX,
  );
  assert.deepEqual(
    [...Object.values(FAMILY_EMBED_PATHS)].sort(),
    ["/canvas-board", "/embed/editor", "/embed/site-editor"],
  );
});

// UC-3 §8.3 + UC-6 §8.6（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：生产页若能构造 LeoDev embed URL，白名单 sandbox 与 targetOrigin 都被绕开。
test("构造器：生产宿主拒 LeoDev base，LeoDev 宿主可以构造", () => {
  assert.throws(
    () =>
      buildEditorEmbedUrl(SLOT_WEBSITE, {
        instanceId: "instance-1",
        hostOrigin: "https://website.oceanleo.com",
      }),
    /Untrusted/,
  );
  const built = buildEditorEmbedUrl(SLOT_WEBSITE, {
    instanceId: "instance-1",
    hostOrigin: SLOT_ORIGIN,
  });
  assert.equal(new URL(built).origin, SLOT_ORIGIN);
  assert.match(built, /embed=1/);
});

// UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：覆盖若发生在白名单校验之前，未认证的 editorBase 也能被换成任意 origin。
test("工作台在白名单校验之后才应用覆盖，生产路由表不被改写", () => {
  // base 解析（白名单 → 覆盖 → 可加载性）住在 workbench-embed-base.ts（600 行拆分闸），
  // 画格本体只消费它；契约按两份源码合起来看。
  const embed =
    source("../src/shell/workbench-embed.tsx") +
    source("../src/shell/workbench-embed-base.ts");
  const routes = source("../src/shell/workbench-routes.ts");
  assert.match(embed, /isTrustedEmbedEditorBase\(editorBase\)/);
  assert.match(embed, /applyFamilyEmbedOriginOverride\(/);
  assert.match(embed, /canLoadFamilyEmbedBase\(/);
  assert.equal(
    [...routes.matchAll(/base:\s*"(https:\/\/[^"]+)"/g)].length,
    0,
    "workbench-routes.ts 不得写死 embed base",
  );
});
