// 会话模型回归防线（W11）。
//
// 锁死两件事：
//   1. 共享 SSO cookie 的作用域 —— 只有真正的 *.oceanleo.com 能拿到
//      Domain=.oceanleo.com；其余一律 host-only（undefined）。特别是
//      oceanleo.app（用户生成内容域）永远不得进入共享 cookie 域。
//   2. 代码里对会话模型的描述与实现一致 —— cookie 不是 HttpOnly，
//      域边界是唯一的保护。注释谎报会让后人做出错误的安全判断。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { cookieDomainFor, cookieOptions } from "../src/lib/auth/config.ts";

const CONFIG_URL = new URL("../src/lib/auth/config.ts", import.meta.url);
const MIDDLEWARE_URL = new URL("../src/lib/auth/middleware.ts", import.meta.url);
const CLIENT_URL = new URL("../src/lib/auth/client.ts", import.meta.url);

const configSource = await readFile(CONFIG_URL, "utf8");
const middlewareSource = await readFile(MIDDLEWARE_URL, "utf8");
const clientSource = await readFile(CLIENT_URL, "utf8");

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：共享域判定收得太紧会打断跨子域 SSO；这条是 UC-7 的正向对照，防止「收紧」变成功能回归。
test("真正的 oceanleo.com 子域才共享 SSO cookie", () => {
  for (const host of [
    "oceanleo.com",
    "ppt.oceanleo.com",
    "website.oceanleo.com",
    "p8080-deadbeef.website.oceanleo.com",
    "PPT.OCEANLEO.COM",
    "ppt.oceanleo.com:3000",
    "ppt.oceanleo.com.", // 绝对域名写法
  ]) {
    assert.equal(
      cookieDomainFor(host),
      ".oceanleo.com",
      `${host} 应当共享 .oceanleo.com cookie`,
    );
  }
});

// 这是本文件的核心断言：任何非 oceanleo.com 结尾的 host 必须 host-only。
// 后人若把 oceanleo.app 纳入共享 cookie 域，或把判定退回裸 endsWith，
// 这条会立刻变红。
// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：把 oceanleo.app 或形似域纳入共享 cookie 域，用户内容页面就能直接读写全家桶会话 cookie，回到事故原点（§7.5）。
test("非 oceanleo.com 的 host 一律 host-only（undefined）", () => {
  for (const host of [
    // 用户生成内容域 —— 绝不能拿到全家桶身份
    "oceanleo.app",
    "www.oceanleo.app",
    "p8080-deadbeef.oceanleo.app",
    "preview.website.oceanleo.app",
    // 形似域（裸 endsWith("oceanleo.com") 会误判成自己人）
    "notoceanleo.com",
    "evil-oceanleo.com",
    "myoceanleo.com",
    // 后缀在别处的攻击者域
    "oceanleo.com.attacker.net",
    "oceanleo.com.evil.io",
    // 本地与预览
    "localhost",
    "localhost:3000",
    "127.0.0.1",
    "oceanleo-ppt.vercel.app",
    // 空值
    "",
    null,
    undefined,
  ]) {
    assert.equal(
      cookieDomainFor(host),
      undefined,
      `${host} 必须是 host-only cookie，不得进入共享 SSO 域`,
    );
  }
});

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：给用户内容域下发 domain 属性等于扩张共享域；把 httpOnly 写成 true 则与实现不符，会让后人误判「域边界不是唯一保护」。
test("cookieOptions 只在 oceanleo.com 上带 domain，且不谎称 httpOnly", () => {
  const shared = cookieOptions("ppt.oceanleo.com");
  assert.equal(shared.domain, ".oceanleo.com");
  assert.equal(shared.path, "/");
  assert.equal(shared.secure, true);
  // lax 而非 strict：strict 会打断微信回跳 / 邮件确认链接的第一跳。
  assert.equal(shared.sameSite, "lax");
  // 如实反映实现：浏览器客户端要读 document.cookie，所以不可能是 HttpOnly。
  assert.equal(shared.httpOnly, false);

  const hostOnly = cookieOptions("p8080-deadbeef.oceanleo.app");
  assert.equal("domain" in hostOnly, false, "用户内容域不得下发 domain 属性");
});

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：红线若能被一条环境变量放开，它就不是红线；这里要求 env 指向用户内容域时 fail closed。
test("env 覆盖也不能把共享 cookie 域挪到 oceanleo.com 之外", () => {
  const probe = `
    const m = await import(${JSON.stringify(CONFIG_URL.href)});
    process.stdout.write(JSON.stringify({
      com: m.cookieDomainFor("ppt.oceanleo.com") ?? null,
      app: m.cookieDomainFor("x.oceanleo.app") ?? null,
    }));
  `;
  const run = (cookieDomain) => {
    const child = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", probe],
      {
        encoding: "utf8",
        env: { ...process.env, NEXT_PUBLIC_OCEANLEO_COOKIE_DOMAIN: cookieDomain },
      },
    );
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };

  // 有人把 env 指到用户内容域 → fail closed，两边都是 host-only。
  assert.deepEqual(run(".oceanleo.app"), { com: null, app: null });
  assert.deepEqual(run("oceanleo.app"), { com: null, app: null });
  // 留空 = 用默认 .oceanleo.com（不是 host-only）；本地开发靠 host 判定兜住。
  assert.deepEqual(run(""), { com: ".oceanleo.com", app: null });
  // 正常生产配置仍然工作（零回归）。
  assert.deepEqual(run(".oceanleo.com"), { com: ".oceanleo.com", app: null });
});

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：附则明确要求描述与实现一致：注释谎称 httpOnly 会让后人以为 XSS 拿不到 token，从而放松域边界。
test("注释与实现一致：没有任何地方声称会话 cookie 是 httpOnly", () => {
  // 旧注释 "(httponly, server-set)" 与实现不符，已删除，不得回潮。
  assert.doesNotMatch(middlewareSource, /httponly,\s*server-set/i);
  for (const [name, source] of [
    ["config.ts", configSource],
    ["middleware.ts", middlewareSource],
    ["client.ts", clientSource],
  ]) {
    assert.doesNotMatch(
      source,
      /httpOnly:\s*true/,
      `${name} 不得把会话 cookie 设成 httpOnly —— 浏览器客户端会读不到 session`,
    );
  }
  // 真实模型必须写在代码里。
  assert.match(configSource, /SESSION MODEL/);
  assert.match(configSource, /Domain 是唯一的保护边界/);
  assert.match(middlewareSource, /不是 HttpOnly/);
});

// UC-NONE：不对应 UC-1…UC-7 中的任何一条。
// 判断依据：刷新 token 的响应被 CDN 缓存属会话缓存污染，UC-1…UC-7 无对应条款。已登记进 W25 的「无对应 UC 规则」清单。
test("带 Set-Cookie 的响应必须应用 @supabase/ssr 下发的 no-store 头", () => {
  // 忽略 setAll 的第二个参数 = 刷新 token 的响应可能被 CDN 缓存，
  // 下一个访客拿到别人的 session。
  assert.match(middlewareSource, /setAll\(\s*cookiesToSet[^)]*headers/);
  assert.match(middlewareSource, /Object\.entries\(headers\)/);
  assert.match(middlewareSource, /Vercel-CDN-Cache-Control/);
});

// UC-NONE：不对应 UC-1…UC-7 中的任何一条。
// 判断依据：会话吊销与 token 生命周期，UC-1…UC-7 无对应条款。已登记进 W25 的「无对应 UC 规则」清单。
test("全局登出失败时兜底清掉本地会话", () => {
  assert.match(clientSource, /signOut\(\{\s*scope:\s*"global"\s*\}\)/);
  assert.match(clientSource, /signOut\(\{\s*scope:\s*"local"\s*\}\)/);
});

// —————————————————————————————————————————————————————————————————————
// 身份实现的唯一性（W10，2026-07-29）
//
// 附录 3 §3：此前 35 份分叉登录实现散在 32 个站仓里，其中 `game/components/
// GameShell.tsx` 那第七套**名字里没有 Auth**，按文件名清点直接漏掉。所以这里
// 按**实现特征**清点，不按文件名：整个共享包里只允许 `src/lib/auth/client.ts`
// 一处直接调 Supabase 的身份 API；`src/pages/AuthDialog.tsx` 只许消费它。
// —————————————————————————————————————————————————————————————————————

const SRC_ROOT = new URL("../src/", import.meta.url);
const IDENTITY_API = /signInWithPassword|signInWithOtp|verifyOtp|auth\.signUp|signInWithOAuth/;

async function sourceFilesUnder(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) out.push(...(await sourceFilesUnder(child)));
    else if (/\.tsx?$/.test(entry.name)) out.push(child);
  }
  return out;
}

const packageSources = new Map();
for (const url of await sourceFilesUnder(SRC_ROOT)) {
  packageSources.set(url.href.slice(SRC_ROOT.href.length), await readFile(url, "utf8"));
}

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：共享域判定只活在 config.ts 的 cookieDomainFor()/cookieOptions() 里，而它只在 lib/auth/client.ts 那唯一一处 createBrowserClient 上生效（client.ts:28-30）。包里再出现一套身份实现，它会自带一份 cookie 配置绕过这个判定，把会话 cookie 的 Domain 交给别处决定——而本文件上面 7 条只读 config.ts 的 UC-7 断言仍然全绿，共享 cookie 域已被悄悄扩张却无人变红。
test("共享包里只有一处直接调 Supabase 身份 API（按实现特征清点，不按文件名）", () => {
  const implementations = [...packageSources]
    .filter(([, source]) => IDENTITY_API.test(source))
    .map(([path]) => path)
    .sort();
  assert.deepEqual(
    implementations,
    ["lib/auth/client.ts"],
    "共享包出现了第二套身份实现——登录必须只有 lib/auth/client.ts 一个落点",
  );
  // 清点本身没有空转：那个唯一实现确实被认出来了。
  assert.match(packageSources.get("lib/auth/client.ts"), IDENTITY_API);
});

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：登录 UI 是全家桶唯一的登录入口，它一旦自建 Supabase 客户端、直写 document.cookie 或自定 cookie 域，会话 cookie 的 Domain 就不再由 cookieDomainFor() 单点决定，共享域随之可被扩张；末尾那条禁 httpOnly 的断言守的是 §8.7 附则的另一半——描述必须与实现一致，谎称 httpOnly 会让后人误判域边界不是唯一保护。
test("共享登录 UI 只消费 lib/auth，不自建 Supabase 客户端、不碰会话 cookie", () => {
  const dialog = packageSources.get("pages/AuthDialog.tsx");
  assert.ok(dialog, "src/pages/AuthDialog.tsx 不存在——共享登录 UI 是全家桶唯一的门");
  assert.match(
    dialog,
    /from\s+"\.\.\/lib\/auth\/client"/,
    "AuthDialog 必须从 lib/auth/client 取登录函数",
  );
  for (const symbol of [
    "signIn",
    "sendPhoneOtp",
    "verifyPhoneOtp",
    "wechatLoginUrl",
    "normalizeCnPhone",
    "oceanleoConfigured",
  ]) {
    assert.match(dialog, new RegExp(`\\b${symbol}\\b`), `AuthDialog 没用上既有的 ${symbol}`);
  }
  // 下面几条查的是**实现**，注释里点名 cookieDomainFor / .oceanleo.com 是在解释
  // 会话模型（该写），所以先把整行注释去掉再断言。
  const code = dialog
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
  // 自建客户端 / 自设 cookie / 自定 cookie 域，都是「第二套身份逻辑」的形态。
  assert.doesNotMatch(code, /createBrowserClient|createClient|@supabase/);
  assert.doesNotMatch(code, /document\.cookie|cookieOptions|cookieDomainFor|SSO_REGISTRABLE_DOMAIN/);
  // 微信回跳必须取当前页；硬编码一个门户 URL 就等于「子站登录后弹回门户」。
  assert.doesNotMatch(code, /https:\/\/[\w.-]*oceanleo\.com/);
  // httpOnly 是显式的 false（config.ts），登录 UI 这一侧不得有任何相关"加固"。
  assert.doesNotMatch(code, /httpOnly/);
});
