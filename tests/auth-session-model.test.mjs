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
import vm from "node:vm";
import { cookieDomainFor, cookieOptions } from "../src/lib/auth/config.ts";
import { compileModule } from "./helpers/module-bench.mjs";

const CONFIG_URL = new URL("../src/lib/auth/config.ts", import.meta.url);
const LOADER_URL = new URL("./ts-extension-loader.mjs", import.meta.url).href;
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
      [
        "--experimental-strip-types",
        "--no-warnings",
        // config.ts 引了 lib/domain-family.ts（家族表）。子进程和父进程一样要带
        // 扩展名解析 loader，否则那条相对 import 会 ERR_MODULE_NOT_FOUND，
        // 整条 env 探针变成「进程起不来」而不是「断言不成立」。
        "--experimental-loader",
        LOADER_URL,
        "--input-type=module",
        "-e",
        probe,
      ],
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

// —————————————————————————————————————————————————————————————————————
// 域名家族隔离（C5，2026-08-08）—— 一套代码同时服务 .com 与 .cn
//
// 下面 5 条对应 C5 任务书列出的 5 条必须成立的性质。它们守的是同一件事：
// 会话 cookie 不是 HttpOnly，Domain 是唯一的保护边界，所以「.com 的身份在 .cn
// 上生效」与「用户内容域拿到共享身份」是同一类事故，只是域名不同。
// —————————————————————————————————————————————————————————————————————

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：境内站拿不到共享 cookie 域，跨子站 SSO 不成立；或更糟——拿到 .com 的域，境内会话被写到境外可注册域上。
test("C5/1+2 家族内：.com host 只拿 .oceanleo.com，.cn host 只拿 .oceanleo.cn", () => {
  for (const host of [
    "oceanleo.com",
    "ppt.oceanleo.com",
    "p8080-deadbeef.website.oceanleo.com",
    "PPT.OCEANLEO.COM",
    "ppt.oceanleo.com:3000",
    "ppt.oceanleo.com.",
  ]) {
    assert.equal(cookieDomainFor(host), ".oceanleo.com", host);
  }
  for (const host of [
    "oceanleo.cn",
    "ppt.oceanleo.cn",
    "p8080-deadbeef.website.oceanleo.cn",
    "PPT.OCEANLEO.CN",
    "ppt.oceanleo.cn:3000",
    "ppt.oceanleo.cn.",
  ]) {
    assert.equal(cookieDomainFor(host), ".oceanleo.cn", host);
  }
});

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：两个家族互相拿得到对方的 cookie 域，就等于在 .com 登录的身份在 .cn 上生效——境内会话与境外会话合流，既是身份事故也是数据出境事故。
test("C5/3 家族之间没有任何一条互相拿到对方 cookie 域的路径", () => {
  // 穷举两族的代表 host：每个 host 的结果只能是自己那一族的 cookie 域。
  const byFamily = {
    ".oceanleo.com": ["oceanleo.com", "a.oceanleo.com", "a.b.oceanleo.com"],
    ".oceanleo.cn": ["oceanleo.cn", "a.oceanleo.cn", "a.b.oceanleo.cn"],
  };
  for (const [expected, hosts] of Object.entries(byFamily)) {
    for (const host of hosts) {
      const got = cookieDomainFor(host);
      assert.equal(got, expected, host);
      // 反向断言：结果里绝不能出现另一族的可注册域。
      const other = expected === ".oceanleo.com" ? "oceanleo.cn" : "oceanleo.com";
      assert.equal(String(got).includes(other), false, `${host} 串到了 ${other}`);
    }
  }
  // 同一个字符串里同时含两族片段的 host 不属于任何一族。
  for (const host of [
    "oceanleo.cn.oceanleo.com.evil.test",
    "oceanleo.com.oceanleo.cn.evil.test",
  ]) {
    assert.equal(cookieDomainFor(host), undefined, host);
  }
});

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：用户内容域上跑的是用户自己的代码；把它纳入共享 cookie 域，那段代码就能直接读走 access token 和 refresh token（§7.5）。leoapp.cn 是境内版的同一个角色，漏掉它等于境内重演一次同样的事故。
test("C5/4 两个用户内容域 oceanleo.app 与 leoapp.cn 都必须是 host-only", () => {
  for (const host of [
    "oceanleo.app",
    "www.oceanleo.app",
    "p8080-deadbeef.oceanleo.app",
    "preview.website.oceanleo.app",
    "leoapp.cn",
    "www.leoapp.cn",
    "p8080-deadbeef.leoapp.cn",
    "preview.website.leoapp.cn",
  ]) {
    assert.equal(
      cookieDomainFor(host),
      undefined,
      `${host} 是用户生成内容域，绝不能进入任何共享 SSO 域`,
    );
    assert.equal("domain" in cookieOptions(host), false, host);
  }
});

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：形似域一旦被判成自己人，攻击者只要注册 evil-oceanleo.cn 就能收到本该发给境内站的会话 cookie。
test("C5/5 形似域与本地/预览域一律 fail closed 到 host-only", () => {
  for (const host of [
    // .com 侧的形似域（裸 endsWith 会误判）
    "notoceanleo.com",
    "evil-oceanleo.com",
    "myoceanleo.com",
    // .cn 侧的同款陷阱
    "notoceanleo.cn",
    "evil-oceanleo.cn",
    "myoceanleo.cn",
    "oceanleocn",
    // 后缀在别处的攻击者域
    "oceanleo.com.attacker.net",
    "oceanleo.cn.evil.com",
    "oceanleo.cn.attacker.net",
    "x.oceanleo.app.attacker.com",
    // 别的 .cn 可注册域
    "oceanleo.com.cn",
    "leo.cn",
    "cn",
    // 本地与预览
    "localhost",
    "localhost:3000",
    "127.0.0.1",
    "oceanleo-ppt.vercel.app",
    // 空值
    "",
    "   ",
    null,
    undefined,
  ]) {
    assert.equal(cookieDomainFor(host), undefined, `${host} 必须 host-only`);
  }
});

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：红线若能被一条环境变量跨族改写，家族隔离就只是默认值而不是边界——一次部署配置写错就能把境内会话写到 .com 上。
test("C5/3 env 覆盖只能在本族内生效，跨族与用户内容域一律 fail closed", () => {
  const probe = `
    const m = await import(${JSON.stringify(CONFIG_URL.href)});
    process.stdout.write(JSON.stringify({
      com: m.cookieDomainFor("ppt.oceanleo.com") ?? null,
      cn: m.cookieDomainFor("ppt.oceanleo.cn") ?? null,
      app: m.cookieDomainFor("x.oceanleo.app") ?? null,
      leoapp: m.cookieDomainFor("x.leoapp.cn") ?? null,
    }));
  `;
  const run = (cookieDomain) => {
    const child = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--no-warnings",
        "--experimental-loader",
        LOADER_URL,
        "--input-type=module",
        "-e",
        probe,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, NEXT_PUBLIC_OCEANLEO_COOKIE_DOMAIN: cookieDomain },
      },
    );
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };

  // 没设 env：每族各自拿到自己的缺省，用户内容域两个都空。
  assert.deepEqual(run(""), {
    com: ".oceanleo.com",
    cn: ".oceanleo.cn",
    app: null,
    leoapp: null,
  });
  // env 指向 .com：.com host 照旧，.cn host **拿不到任何东西**（不是回落到 .com）。
  assert.deepEqual(run(".oceanleo.com"), {
    com: ".oceanleo.com",
    cn: null,
    app: null,
    leoapp: null,
  });
  // env 指向 .cn：镜像成立。
  assert.deepEqual(run(".oceanleo.cn"), {
    com: null,
    cn: ".oceanleo.cn",
    app: null,
    leoapp: null,
  });
  // env 指向任一用户内容域：全线 fail closed。
  for (const bad of [".oceanleo.app", "oceanleo.app", ".leoapp.cn", "leoapp.cn"]) {
    assert.deepEqual(
      run(bad),
      { com: null, cn: null, app: null, leoapp: null },
      bad,
    );
  }
  // env 只有空白 = 显式关掉共享域（改动前的行为，不得回潮成「当没设」）。
  assert.deepEqual(run("   "), {
    com: null,
    cn: null,
    app: null,
    leoapp: null,
  });
});

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：家族表是这条红线的唯一事实源；有人在别处再写一份 host 判定或让家族由任意域名字符串拼出来，隔离就只剩这份测试在纸上成立。
test("C5 家族表是写死的两行，且不接受任意域名字符串", async () => {
  const familyModule = await import("../src/lib/domain-family.ts");
  const {
    DOMAIN_FAMILIES,
    DEFAULT_DOMAIN_FAMILY,
    UNTRUSTED_CONTENT_DOMAINS,
    familyForHost,
    isFirstPartyHostOf,
  } = familyModule;
  assert.deepEqual([...DOMAIN_FAMILIES], ["com", "cn"]);
  // 缺省必须是 com：认不出来的 host 解析结果要与境内版落地之前逐字相同。
  assert.equal(DEFAULT_DOMAIN_FAMILY, "com");
  assert.deepEqual([...UNTRUSTED_CONTENT_DOMAINS], ["oceanleo.app", "leoapp.cn"]);
  assert.equal(familyForHost("ppt.oceanleo.com"), "com");
  assert.equal(familyForHost("ppt.oceanleo.cn"), "cn");
  for (const host of ["oceanleo.app", "leoapp.cn", "evil-oceanleo.cn", ""]) {
    assert.equal(familyForHost(host), undefined, host);
  }
  // 第一方判定按族分：.com 页面不信 .cn 主机，反之亦然。
  assert.equal(isFirstPartyHostOf("api.oceanleo.com", "com"), true);
  assert.equal(isFirstPartyHostOf("api.oceanleo.cn", "com"), false);
  assert.equal(isFirstPartyHostOf("api.oceanleo.cn", "cn"), true);
  assert.equal(isFirstPartyHostOf("api.oceanleo.com", "cn"), false);
  for (const family of ["com", "cn"]) {
    for (const host of ["oceanleo.app", "leoapp.cn", "x.oceanleo.app", "x.leoapp.cn"]) {
      assert.equal(isFirstPartyHostOf(host, family), false, `${host}@${family}`);
    }
  }
  // 家族名写错 = 当没写（fail closed 到缺省），不得让 env 拼出第三个家族。
  assert.match(
    configSource,
    /familyForHost\(/,
    "config.ts 必须走家族表判定，不得再写死一个可注册域",
  );
  assert.doesNotMatch(
    configSource,
    /endsWith\(`?\.?oceanleo\.(com|cn)/,
    "config.ts 不得再出现裸后缀判定",
  );
});

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：主题/语言 cookie 若比会话 cookie 铺得更宽（例如仍写死 .oceanleo.com），境内站就会往境外可注册域上写 cookie；而写死的那份一旦被当成「反正不是会话，无所谓」，下一个人就会照抄这份判定去写会话。
test("C5 非会话 cookie（主题/语言）与会话走同一条家族边界", async () => {
  const { sharedCookieDomainFor } = await import("../src/lib/domain-family.ts");
  for (const host of ["oceanleo.com", "ppt.oceanleo.com", "PPT.OCEANLEO.COM"]) {
    assert.equal(sharedCookieDomainFor(host), ".oceanleo.com", host);
  }
  for (const host of ["oceanleo.cn", "ppt.oceanleo.cn", "PPT.OCEANLEO.CN"]) {
    assert.equal(sharedCookieDomainFor(host), ".oceanleo.cn", host);
  }
  // 用户内容域与形似域：非会话 cookie 也一样 host-only，不许因为「只是主题」而放宽。
  for (const host of [
    "oceanleo.app",
    "x.oceanleo.app",
    "leoapp.cn",
    "x.leoapp.cn",
    "notoceanleo.com",
    "evil-oceanleo.cn",
    "oceanleo.cn.evil.com",
    "localhost",
    "oceanleo-ppt.vercel.app",
    "",
    null,
  ]) {
    assert.equal(sharedCookieDomainFor(host), undefined, `${host} 必须 host-only`);
  }
});

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：只要还剩一处写死 `domain=.oceanleo.com`，境内站在那一处就会退回往境外域写 cookie，而且这类回潮不会报错、只会静默生效。
test("C5 四个 cookie 写入点都从家族表取域，没有写死的 domain 字面量", async () => {
  const writers = {
    "pages/GeneralPage.tsx": "sharedCookieDomainFor",
    "i18n/LanguageSwitcher.tsx": "sharedCookieDomainFor",
    "theme/ThemeProvider.tsx": "sharedCookieDomainFor",
    // 首帧同步执行，引不了运行时模块，只能注入常量表。
    "theme/ThemeScript.tsx": "REGISTRABLE_DOMAINS",
  };
  for (const [relative, helper] of Object.entries(writers)) {
    const source = await readFile(new URL(`../src/${relative}`, import.meta.url), "utf8");
    assert.match(
      source,
      new RegExp(`import \\{[^}]*${helper}[^}]*\\} from "\\.\\.?/(\\.\\./)?lib/domain-family"`),
      `${relative} 必须从 lib/domain-family 取域，不得自己写一份判定`,
    );
    assert.doesNotMatch(
      source,
      /domain=\.oceanleo\.(com|cn)/,
      `${relative} 不得写死 cookie domain`,
    );
    assert.doesNotMatch(
      source,
      /endsWith\("\.oceanleo\.(com|cn)"\)/,
      `${relative} 不得再写裸后缀判定`,
    );
  }
});

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：这段脚本是唯一一处「安全相关的域名判定被写进内联 HTML」的地方。它拿的是注入的常量表，若有人在这里手写第二份后缀判定（历史上是 slice(-13)），家族表就不再是唯一事实源，两边会各自漂移。
test("C5 ThemeScript 内联脚本按家族清影子 cookie（实际执行，不只读源码）", async () => {
  // `.tsx` 进不了 node 的 type-stripping，走仓里的编译台（它会自动解析
  // ThemeScript 对 lib/domain-family 的那条 import，所以测的是真表、不是替身）。
  const [{ ThemeScript }, { THEME_COOKIE }, React, { renderToStaticMarkup }] =
    await Promise.all([
      import(await compileModule("src/theme/ThemeScript.tsx")),
      import("../src/theme/theme-config.ts"),
      import("react"),
      import("react-dom/server"),
    ]);

  const markup = renderToStaticMarkup(React.createElement(ThemeScript));
  const inline = markup
    .replace(/^<script[^>]*>/, "")
    .replace(/<\/script>$/, "");
  assert.ok(inline.includes("oceanleo.com"), "内联脚本必须带上 .com 可注册域");
  assert.ok(inline.includes("oceanleo.cn"), "内联脚本必须带上 .cn 可注册域");
  // 历史写法：写死长度 13 的 slice。它一旦回来，加第三个家族时就会静默失效。
  assert.equal(inline.includes("slice(-13)"), false, "不得写死后缀长度");

  const runFor = (hostname) => {
    const writes = [];
    const context = {
      location: { hostname },
      localStorage: { getItem: () => null, setItem: () => {} },
      document: {
        get cookie() {
          return "";
        },
        set cookie(value) {
          writes.push(value);
        },
        documentElement: {
          classList: { add: () => {}, remove: () => {} },
          style: {},
        },
      },
      window: { matchMedia: () => ({ matches: false }) },
    };
    vm.createContext(context);
    vm.runInContext(inline, context);
    return writes;
  };

  const clearsShadow = (hostname) =>
    runFor(hostname).some(
      (value) => value.startsWith(`${THEME_COOKIE}=;`) && value.includes("max-age=0"),
    );

  // 两族的第一方 host 都要清影子（境内站也需要这条跨站跟随的修复）。
  for (const host of ["oceanleo.com", "ppt.oceanleo.com", "oceanleo.cn", "ppt.oceanleo.cn"]) {
    assert.equal(clearsShadow(host), true, `${host} 应当清 host-only 影子 cookie`);
  }
  // 拿不到家族的 host 一律不动 cookie：那里的 host-only cookie 就是唯一事实源。
  for (const host of [
    "oceanleo.app",
    "x.oceanleo.app",
    "leoapp.cn",
    "x.leoapp.cn",
    "notoceanleo.com",
    "evil-oceanleo.cn",
    "oceanleo.cn.evil.com",
    "localhost",
    "oceanleo-ppt.vercel.app",
  ]) {
    assert.equal(clearsShadow(host), false, `${host} 不属于任何家族，不得改它的 cookie`);
  }
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
