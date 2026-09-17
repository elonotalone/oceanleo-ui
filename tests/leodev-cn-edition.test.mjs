// LeoDev cn edition: the page host is still `p-<32hex>.dev.oceanleo.com`,
// but `NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY=cn` (plus the cn gateway/identity
// env) must drive product behaviour. Cookie Domain stays host-derived:
// a cn session must never be written as `Domain=.oceanleo.com`.
//
// CONFIGURED_DOMAIN_FAMILY is fixed at module load, so edition assertions
// spawn a child with the slot env. Default-env (com) cases run in-process
// and must stay byte-identical to production `.com`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  familyForHost,
  isFirstPartyHostOf,
} from "../src/contracts/domain-family.ts";
import {
  createLeoDevPreviewCookieJar,
  parseDocumentCookies,
} from "../src/lib/auth/preview-cookies.ts";
import {
  applyFamilyEmbedOriginOverride,
  isAllowedFamilyEmbedOverrideOrigin,
} from "../src/shell/family-embed-origin.ts";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const LOADER_URL = new URL("./ts-extension-loader.mjs", import.meta.url).href;
const FAMILY_URL = new URL("../src/contracts/domain-family.ts", import.meta.url).href;
const HELP_URL = new URL("../src/lib/help-url.ts", import.meta.url).href;
const CONFIG_URL = new URL("../src/lib/auth/config.ts", import.meta.url).href;
const AIGC_URL = new URL("../src/contracts/aigc-label.ts", import.meta.url).href;
const SHARE_URL = new URL("../src/shell/share/share-client.ts", import.meta.url).href;
const PROTOCOL_URL = new URL("../src/shell/editor-protocol.ts", import.meta.url).href;

const LEODEV_HOST = `p-${"0".repeat(32)}.dev.oceanleo.com`;
const LEODEV_ORIGIN = `https://${LEODEV_HOST}`;
const CN_SLOT_ENV = {
  NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY: "cn",
  NEXT_PUBLIC_OCEANLEO_GATEWAY_URL: "https://api-cn.dev.oceanleo.com",
  NEXT_PUBLIC_OCEANLEO_SUPABASE_URL: "https://id-cn.dev.oceanleo.com",
};

function probe(code, extraEnv = {}) {
  const child = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      "--experimental-loader",
      LOADER_URL,
      "--input-type=module",
      "-e",
      code,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, ...extraEnv },
    },
  );
  assert.equal(child.status, 0, child.stderr || child.stdout);
  return JSON.parse(child.stdout);
}

test("default env: production .com / LeoDev host behaviour is unchanged", () => {
  const clean = probe(
    `
    const family = await import(${JSON.stringify(FAMILY_URL)});
    const help = await import(${JSON.stringify(HELP_URL)});
    const config = await import(${JSON.stringify(CONFIG_URL)});
    const aigc = await import(${JSON.stringify(AIGC_URL)});
    const host = ${JSON.stringify(LEODEV_HOST)};
    process.stdout.write(JSON.stringify({
      family: family.currentDomainFamily(),
      gateway: family.currentDomainProfile().gatewayOrigin,
      website: family.currentFamilySubsiteOrigin("website"),
      hostFamily: family.familyForHost(host),
      cookieDomain: config.cookieDomainFor(host) ?? null,
      help: help.helpCenterUrl({ host }),
      aigc: aigc.aigcLabelActive(),
    }));
    `,
    {
      NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY: "",
      NEXT_PUBLIC_OCEANLEO_GATEWAY_URL: "",
      NEXT_PUBLIC_GATEWAY_URL: "",
      NEXT_PUBLIC_OCEANLEO_AIGC_LABEL: "",
    },
  );
  assert.equal(clean.family, "com");
  assert.equal(clean.gateway, "https://api.oceanleo.com");
  assert.equal(clean.website, "https://website.oceanleo.com");
  assert.equal(clean.hostFamily, "com");
  assert.equal(clean.cookieDomain, ".oceanleo.com");
  assert.equal(clean.help, "https://help.oceanleo.com/");
  assert.equal(clean.aigc, false);

  assert.equal(familyForHost(LEODEV_HOST), "com");
  assert.equal(isFirstPartyHostOf(LEODEV_HOST, "com"), true);
  assert.equal(isFirstPartyHostOf(LEODEV_HOST, "cn"), true);
  assert.equal(isFirstPartyHostOf("website.oceanleo.cn", "com"), false);
  assert.equal(isFirstPartyHostOf("user.oceanleo.app", "cn"), false);
  assert.equal(isFirstPartyHostOf("game.leoapp.cn", "cn"), false);
});

test("cn slot env: help, gateway overlay, host-only cookie, .cn subsites, LeoDev first-party", () => {
  // UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
  // 违反后果：cn 槽写 Domain=.oceanleo.com，境内会话落到海外共享 cookie 域。
  // UC-3 §8.3：LeoDev 第一方例外若放宽到 *.dev.oceanleo.com / oceanleo.app，UGC 就能 postMessage.
  const got = probe(
    `
    const family = await import(${JSON.stringify(FAMILY_URL)});
    const help = await import(${JSON.stringify(HELP_URL)});
    const config = await import(${JSON.stringify(CONFIG_URL)});
    const aigc = await import(${JSON.stringify(AIGC_URL)});
    const protocol = await import(${JSON.stringify(PROTOCOL_URL)});
    const host = ${JSON.stringify(LEODEV_HOST)};
    process.stdout.write(JSON.stringify({
      family: family.currentDomainFamily(),
      gateway: family.currentDomainProfile().gatewayOrigin,
      cookie: family.currentDomainProfile().cookieDomain,
      registrable: family.currentDomainProfile().registrableDomain,
      help: help.helpCenterUrl({ host, path: "/chat" }),
      cookieDomain: config.cookieDomainFor(host) ?? null,
      cookieHasDomain: "domain" in config.cookieOptions(host),
      website: family.currentFamilySubsiteOrigin("website"),
      excelMissing: family.currentFamilySubsiteOrigin("excel"),
      ecom: family.currentFamilySubsiteOrigin("e-commerce"),
      aitools: family.currentFamilySubsiteOrigin("aitools") ?? null,
      leoDevFirstParty: family.isCurrentFamilyFirstPartyHost(host),
      leoDevOfCn: family.isFirstPartyHostOf(host, "cn"),
      websiteCom: family.isCurrentFamilyFirstPartyHost("website.oceanleo.com"),
      websiteCn: family.isCurrentFamilyFirstPartyHost("website.oceanleo.cn"),
      app: family.isCurrentFamilyFirstPartyHost("user.oceanleo.app"),
      leoapp: family.isCurrentFamilyFirstPartyHost("game.leoapp.cn"),
      evilDev: family.isCurrentFamilyFirstPartyHost("evil.dev.oceanleo.com"),
      shortDev: family.isCurrentFamilyFirstPartyHost("p-nothex.dev.oceanleo.com"),
      aigc: aigc.aigcLabelActive(),
      editorOrigin: protocol.isTrustedEditorOrigin(${JSON.stringify(LEODEV_ORIGIN)}),
      cnHostCookie: config.cookieDomainFor("ppt.oceanleo.cn") ?? null,
      comHostCookie: config.cookieDomainFor("ppt.oceanleo.com") ?? null,
    }));
    `,
    CN_SLOT_ENV,
  );

  assert.equal(got.family, "cn");
  assert.equal(got.gateway, "https://api-cn.dev.oceanleo.com");
  assert.equal(got.cookie, ".oceanleo.cn");
  assert.equal(got.registrable, "oceanleo.cn");
  assert.equal(got.help, "https://help.oceanleo.cn/chat");
  assert.equal(got.cookieDomain, null);
  assert.equal(got.cookieHasDomain, false);
  assert.equal(got.website, "https://website.oceanleo.cn");
  assert.equal(got.excelMissing, "https://excel.oceanleo.cn");
  assert.equal(got.ecom, "https://e-commerce.oceanleo.cn");
  assert.equal(got.aitools, null);
  assert.equal(got.leoDevFirstParty, true);
  assert.equal(got.leoDevOfCn, true);
  assert.equal(got.websiteCom, false);
  assert.equal(got.websiteCn, true);
  assert.equal(got.app, false);
  assert.equal(got.leoapp, false);
  assert.equal(got.evilDev, false);
  assert.equal(got.shortDev, false);
  assert.equal(got.aigc, true);
  assert.equal(got.editorOrigin, true);
  assert.equal(got.cnHostCookie, ".oceanleo.cn");
  assert.equal(got.comHostCookie, null);
});

test("gateway overlay refuses user-content domains and http", () => {
  // UC-1 §8.1 + UC-2：网关 overlay 若接受 oceanleo.app，请求会带着第一方凭据打到 UGC 域.
  const app = probe(
    `
    const family = await import(${JSON.stringify(FAMILY_URL)});
    process.stdout.write(JSON.stringify({
      gateway: family.currentDomainProfile().gatewayOrigin,
    }));
    `,
    {
      NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY: "cn",
      NEXT_PUBLIC_OCEANLEO_GATEWAY_URL: "https://user.oceanleo.app",
    },
  );
  assert.equal(app.gateway, "https://api.oceanleo.cn");

  const http = probe(
    `
    const family = await import(${JSON.stringify(FAMILY_URL)});
    process.stdout.write(JSON.stringify({
      gateway: family.currentDomainProfile().gatewayOrigin,
    }));
    `,
    {
      NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY: "cn",
      NEXT_PUBLIC_OCEANLEO_GATEWAY_URL: "http://api-cn.dev.oceanleo.com",
    },
  );
  assert.equal(http.gateway, "https://api.oceanleo.cn");
});

test("LeoDev embed fallback keeps the caller family base; override still only exact slots", () => {
  // UC-3 §8.3（docs/architecture/oceanleo-untrusted-content-isolation.md）
  // 违反后果：覆盖目标认 oceanleo.app / leoapp.cn，内嵌编辑器拿到同源沙箱.
  const cnBase = "https://website.oceanleo.cn/embed/site-editor";
  const comBase = "https://website.oceanleo.com/embed/site-editor";
  assert.equal(
    applyFamilyEmbedOriginOverride(cnBase, { host: LEODEV_HOST }),
    cnBase,
  );
  assert.equal(
    applyFamilyEmbedOriginOverride(comBase, { host: LEODEV_HOST }),
    comBase,
  );
  assert.equal(
    applyFamilyEmbedOriginOverride(cnBase, {
      host: LEODEV_HOST,
      envValue: LEODEV_ORIGIN,
    }),
    `${LEODEV_ORIGIN}/embed/site-editor`,
  );
  assert.equal(isAllowedFamilyEmbedOverrideOrigin("https://user.oceanleo.app"), false);
  assert.equal(isAllowedFamilyEmbedOverrideOrigin("https://game.leoapp.cn"), false);
  assert.equal(isAllowedFamilyEmbedOverrideOrigin("https://evil.dev.oceanleo.com"), false);
});

test("preview cookie jar is name-agnostic for sb-id-cn-auth-token and never writes document.cookie", () => {
  const raw = "sb-id-cn-auth-token=cn-session; other=1";
  let writes = 0;
  const jar = createLeoDevPreviewCookieJar(() => {
    writes += 1;
    return raw;
  });
  const before = jar.getAll();
  assert.equal(
    before.some((row) => row.name === "sb-id-cn-auth-token" && row.value === "cn-session"),
    true,
  );
  jar.setAll([{ name: "sb-id-cn-auth-token", value: "refreshed" }]);
  const after = jar.getAll();
  assert.equal(
    after.find((row) => row.name === "sb-id-cn-auth-token")?.value,
    "refreshed",
  );
  assert.deepEqual(parseDocumentCookies(raw).map((row) => row.name).sort(), [
    "other",
    "sb-id-cn-auth-token",
  ]);
  assert.equal(writes >= 1, true);
  assert.equal(jar.peekOverlay()?.find((row) => row.name === "sb-id-cn-auth-token")?.value, "refreshed");
});

test("share client uses GATEWAY_BASE; help-url prefers configured family", () => {
  const shareSrc = source("../src/shell/share/share-client.ts");
  assert.match(shareSrc, /const gatewayBase = GATEWAY_BASE/);
  assert.doesNotMatch(shareSrc, /["']https:\/\/api\.dev\.oceanleo\.com["']/);
  assert.doesNotMatch(shareSrc, /includes\(["']\.dev\.oceanleo\.com["']\)/);

  const helpSrc = source("../src/lib/help-url.ts");
  assert.match(helpSrc, /CONFIGURED_DOMAIN_FAMILY/);
  assert.match(helpSrc, /function helpFamilyFor/);

  const familySrc = source("../src/contracts/domain-family.ts");
  assert.match(familySrc, /isLeoDevCapabilityHost/);
  assert.match(familySrc, /\^p-\[0-9a-f\]\{32\}\\.dev\\.oceanleo\\.com\$/);
  assert.match(familySrc, /configuredGatewayOrigin/);

  const configSrc = source("../src/lib/auth/config.ts");
  assert.match(configSrc, /CONFIGURED_DOMAIN_FAMILY && CONFIGURED_DOMAIN_FAMILY !== family/);
});

test("cn slot share POST hits the configured gateway, not api.dev.oceanleo.com", () => {
  const got = probe(
    `
    const share = await import(${JSON.stringify(SHARE_URL)});
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(String(url));
      return {
        ok: true,
        status: 200,
        async json() { return { share_id: "AbcdEF123456" }; },
        async text() { return ""; },
      };
    };
    const result = await share.createShareLink({
      taskId: "task-1",
      fetchImpl,
      tokenImpl: async () => "token",
    });
    process.stdout.write(JSON.stringify({ seen, url: result.url }));
    `,
    CN_SLOT_ENV,
  );
  assert.deepEqual(got.seen, ["https://api-cn.dev.oceanleo.com/v1/share/task"]);
});
