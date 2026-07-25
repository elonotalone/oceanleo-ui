// W19 —— 免沙箱 PDF frame 的第一方主机白名单防线。
//
// 规范来源：docs/architecture/oceanleo-untrusted-content-isolation.md
//   §4.1（cookie 按目标地址决定，iframe 有独立 origin，「只是被嵌在里面」不降权）
//   §7.5（禁止依据域名后缀授予信任）
//   §8.1 UC-1（用户内容只落 oceanleo.app，*.oceanleo.com 下不得有用户可控代码）
//   §8.3 UC-3（不可信来源的 frame 不得取得同源能力）
//
// 为什么这两处 frame 只能用主机白名单、不能用 sandbox 属性：
//   10| Chromium 内建 PDF 查看器加**任何** sandbox 都不渲染（crbug 413851）。
//
// 为什么必须有这条防线：`item.url` 可由用户指定。后端
//   `POST /v1/database/assets`（backend/app/routers/database_router.py:389）经
//   `supa.assets_add`（backend/app/supa.py:1169）把调用方给的 url 原样落库，只做
//   `.strip()`，没有 scheme / host / rehost 校验；`GET /v1/database/overview` 与
//   `GET /v1/database/item?source=asset` 原样读回。本包又把 `normalizeWork` /
//   `buildLibraryItems` / `LibraryItemViewer` 作为公共 API 导出（src/shell/index.ts），
//   `normalizeWork` 对 url 零校验，`inferLibraryKind` 仅凭 `.pdf` 后缀就把它路由到
//   20| DocumentViewer 的免沙箱 frame。完整取证见
//   scratch/expansion-and-security-2026-07-25/W19/01-item-url-provenance.md。
//
// 改坏本文件锁定的任意一行都必须变红。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { UNTRUSTED_CONTENT_REGISTRABLE_DOMAINS } from "../src/shell/editor-sandbox-origin.ts";
import { inferLibraryKind, normalizeWork } from "../src/shell/library-data.ts";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function source(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

/**
 * `workspace-library-cover.tsx` 被渲染测试以 data: URL 加载，因此模块本身不得有
 * 相对运行时依赖；这里沿用 material-cover-rendering 的编译方式加载它。
 */
async function loadCoverModule() {
  const sourcePath = resolve("src/shell/workspace-library-cover.tsx");
  const text = await readFile(sourcePath, "utf8");
  const compiled = ts
    .transpileModule(text, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    })
    .outputText.replaceAll('from "react";', `from ${JSON.stringify(reactUrl)};`)
    .replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

/** 白名单内：会话 cookie 域内唯一放行的第一方 rendition 网关，以及 cookie 域外主机。 */
const ALLOWED_PDF_URLS = [
  // 第一方 rendition 网关：响应带 `Content-Security-Policy: sandbox`
  // （backend/app/routers/artifacts_router.py:1265），落在 opaque origin。
  "https://api.oceanleo.com/v1/artifact-renditions/access/abc123",
  "https://api.oceanleo.com/v1/media/proxy?url=x",
  // cookie 域外的对象存储主机：读不到 Domain=.oceanleo.com 的会话 cookie。
  "https://kvrtcumcmhyqhmawpzyc.supabase.co/storage/v1/object/public/media-uploads/u/a/b.pdf",
  "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/a/b.pdf",
];

/** 白名单外：任何一条被放行都等于交出全家桶 access + refresh token。 */
const BLOCKED_PDF_URLS = [
  // 共享 cookie 域内的非网关主机——包括看起来最「第一方」的那些。
  "https://oceanleo.com/x.pdf",
  "https://asset.oceanleo.com/x.pdf",
  "https://website.oceanleo.com/x.pdf",
  "https://ppt.oceanleo.com/x.pdf",
  // 迁移期仍留在 .oceanleo.com 下的预览/UGC 主机。
  `https://p8080-${"a".repeat(32)}.website.oceanleo.com/x.pdf`,
  "https://anything.preview.oceanleo.com/x.pdf",
  "https://x.usercontent.oceanleo.com/x.pdf",
  // 用户内容可注册域：即使在 cookie 域外，免沙箱 frame 仍可顶层导航/弹窗/下载。
  "https://oceanleo.app/x.pdf",
  "https://game-42.oceanleo.app/x.pdf",
  // 协议 / 端口 / 凭据 / 相对地址一律 fail closed。
  "http://api.oceanleo.com/x.pdf",
  "https://api.oceanleo.com:8443/x.pdf",
  "https://user:pw@api.oceanleo.com/x.pdf",
  "/v1/artifact-renditions/access/abc123",
  "not a url",
  "",
];

test("W19/1 免沙箱 PDF frame 的主机白名单判定（UC-1/UC-3）", async () => {
  const { isSandboxExemptPdfFrameUrl } = await loadCoverModule();
  for (const url of ALLOWED_PDF_URLS) {
    assert.equal(isSandboxExemptPdfFrameUrl(url), true, url);
  }
  for (const url of BLOCKED_PDF_URLS) {
    assert.equal(isSandboxExemptPdfFrameUrl(url), false, url);
  }
  assert.equal(isSandboxExemptPdfFrameUrl(undefined), false);
  // 后缀相似的别人的注册域不得因为「像」而被放行/误判。
  assert.equal(
    isSandboxExemptPdfFrameUrl("https://oceanleo.com.evil.test/x.pdf"),
    true,
    "别人的注册域在 cookie 域外，允许渲染但读不到会话 cookie",
  );
  assert.equal(
    isSandboxExemptPdfFrameUrl("https://evil-oceanleo.app/x.pdf"),
    true,
  );
});

// UC-1 §8.1 + UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：免沙箱 frame 一旦加载 cookie 域内的用户可控地址，该页面就在 *.oceanleo.com origin 上执行并可读走会话 cookie。
test("W19/1 封面 plan 对白名单外的 PDF 地址降级为 unavailable", async () => {
  const { workspaceCoverPlan } = await loadCoverModule();
  // 真实形态：rendition 声明 application/pdf，地址本身可以没有 .pdf 后缀。
  const planFor = (url) =>
    workspaceCoverPlan({
      kind: "document",
      url,
      rendition: { purpose: "full", mediaType: "application/pdf", url },
    });
  for (const url of BLOCKED_PDF_URLS.filter(Boolean)) {
    const plan = planFor(url);
    assert.notEqual(plan.renderer, "pdf", url);
    assert.ok(plan.failureReason, `${url}: 降级必须给出可读原因`);
  }
  const allowed = planFor(ALLOWED_PDF_URLS[0]);
  assert.equal(allowed.renderer, "pdf");
  assert.equal(allowed.failureReason, "");
});

// UC-1 §8.1 + UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：只在 plan 生成处过滤而渲染处不再校验，调用方自己拼一个 plan 就能绕开整条白名单。
test("W19/1 手工构造的 plan 也进不了免沙箱封面 frame", async () => {
  const { WorkspaceCoverResource } = await loadCoverModule();
  const render = (url) =>
    renderToStaticMarkup(
      React.createElement(WorkspaceCoverResource, {
        plan: {
          renderer: "pdf",
          url,
          mediaType: "application/pdf",
          format: "pdf",
          fit: "contain",
          sourceAspectRatio: null,
          failureReason: "",
        },
        alt: "cover",
        className: "",
        resourceKey: "k",
        onReady: () => undefined,
        onError: () => undefined,
      }),
    );
  assert.equal(
    render(`https://p8080-${"a".repeat(32)}.website.oceanleo.com/x.pdf`),
    "",
    "白名单外的地址不得渲染出 frame",
  );
  assert.match(render(ALLOWED_PDF_URLS[0]), /<iframe/);
});

// UC-1 §8.1 + UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：两份复制实现只要漂移一侧，就出现一处没有白名单的免沙箱 frame；拒绝分支若退化成顶层导航，同样把不可信地址送上第一方 origin。
test("W19/2 两处 PDF frame 都在渲染前过白名单，且两份实现逐字一致", () => {
  const viewers = source("../src/shell/library-viewers.tsx");
  const cover = source("../src/shell/workspace-library-cover.tsx");

  // 两个模块不能互相 import（封面模块要能以 data: URL 加载），只能复制实现；
  // 这里做逐字对账，任何一侧被单独改动都会变红。
  const guardSource = (text, name) => {
    const start = text.indexOf("const PDF_FRAME_TRUSTED_GATEWAY_HOSTS");
    assert.notEqual(start, -1, `${name}: 缺少 PDF frame 主机白名单`);
    const fn = text.indexOf("function isSandboxExemptPdfFrameUrl", start);
    assert.notEqual(fn, -1, `${name}: 缺少 isSandboxExemptPdfFrameUrl`);
    const end = text.indexOf("\n}\n", fn);
    assert.notEqual(end, -1, `${name}: isSandboxExemptPdfFrameUrl 未闭合`);
    return text.slice(start, end + 3).replaceAll("export function", "function");
  };
  assert.equal(
    guardSource(viewers, "library-viewers.tsx"),
    guardSource(cover, "workspace-library-cover.tsx"),
    "两处白名单实现必须逐字一致；改一侧必须同步改另一侧",
  );

  // 白名单常量本身：cookie 域内只有写死的网关，且不可信可注册域与共享判定同源。
  const gatewayHosts = [
    ...guardSource(viewers, "library-viewers.tsx").matchAll(
      /PDF_FRAME_TRUSTED_GATEWAY_HOSTS: readonly string\[\] = \[([^\]]*)\]/g,
    ),
  ].map((match) => match[1]);
  assert.deepEqual(gatewayHosts, ['"api.oceanleo.com"']);
  assert.deepEqual([...UNTRUSTED_CONTENT_REGISTRABLE_DOMAINS], ["oceanleo.app"]);
  for (const [name, text] of [
    ["library-viewers.tsx", viewers],
    ["workspace-library-cover.tsx", cover],
  ]) {
    for (const domain of UNTRUSTED_CONTENT_REGISTRABLE_DOMAINS) {
      assert.ok(
        text.includes(`"${domain}"`),
        `${name}: 不可信可注册域 ${domain} 必须同时出现在 PDF 白名单的排除项里`,
      );
    }
  }

  // 渲染面：免沙箱 frame 前必须有守卫，且豁免标记仍各只有一处。
  assert.ok(
    /if \(!isSandboxExemptPdfFrameUrl\(item\.url\)\) \{/.test(viewers),
    "library-viewers: PDF frame 之前必须先过白名单",
  );
  assert.ok(
    /plan\.renderer === "pdf" && !isSandboxExemptPdfFrameUrl\(plan\.url\)/.test(
      cover,
    ),
    "workspace-library-cover: 封面 frame 之前必须先过白名单",
  );
  for (const [name, text] of [
    ["library-viewers.tsx", viewers],
    ["workspace-library-cover.tsx", cover],
  ]) {
    assert.equal(
      (text.match(/sandbox-exempt: pdf-plugin/g) || []).length,
      1,
      `${name}: 豁免数量变化必须重新评审`,
    );
    assert.ok(
      text.includes("crbug 413851"),
      `${name}: 必须保留「不能改用 sandbox」的浏览器约束依据`,
    );
  }
  // 被拒绝的地址不得再以「打开原文件」的形式变成顶层导航（隔离文档 §4.3）。
  const rejected = viewers.slice(
    viewers.indexOf("if (!isSandboxExemptPdfFrameUrl(item.url))"),
  );
  const errorView = rejected.slice(
    rejected.indexOf("<ErrorView"),
    rejected.indexOf("/>", rejected.indexOf("<ErrorView")),
  );
  assert.equal(
    /url=/.test(errorView),
    false,
    "拒绝分支不得把不可信地址交给顶层导航链接",
  );
});

// UC-1 §8.1（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：这条记录的是事实：url 零校验且仅凭 .pdf 后缀路由。后人若误以为 url 恒由服务端生成而删掉主机白名单，攻击链立刻恢复。
test("W19/3 前提锁死：item.url 由调用方给定，本包不做任何来源校验", () => {
  // 这条断言记录的是**事实**，不是期望：`normalizeWork` 对 url 零校验，`.pdf`
  // 后缀足以把任意地址路由到 document 查看器。后人若因此认为「url 恒由服务端
  // 生成」而删掉主机白名单，本用例会连同上面的守卫断言一起变红。
  const hostile = "https://p8080-aaa.website.oceanleo.com/steal.pdf";
  const item = normalizeWork({ id: "w1", url: hostile, site_id: "asset" });
  assert.equal(item.url, hostile, "url 原样落到 LibraryItem 上，没有被过滤");
  assert.equal(item.kind, "document");
  assert.equal(inferLibraryKind({ url: hostile }), "document");
  // 该条目在 DocumentViewer 里走 isPdf 分支（artifactType 为空，仅凭扩展名）。
  assert.equal(item.artifactType, undefined);
  const viewers = source("../src/shell/library-viewers.tsx");
  assert.ok(
    viewers.includes(
      `const isPdf = item.artifactType === "pdf" || ext === "pdf";`,
    ),
    "isPdf 判据变化必须重新评审白名单覆盖面",
  );
});
