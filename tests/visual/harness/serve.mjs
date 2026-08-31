// ============================================================================
// 夹具服务器 —— 零依赖，离线
// ----------------------------------------------------------------------------
// 用 node 内建 http 起一个只服务本套件的静态站。刻意**不**用 Next：
//   1. 仓里没有独立打包器（esbuild/vite/webpack 都不在 node_modules），
//      唯一可用的是靠 `.npmrc` auto-install-peers 带进来的 `next`；
//   2. 但 `next build` 要编译整棵被测源码树，而这道闸与它守的九份改动是**同一波
//      并发**造的——任何人手里有一份编辑到一半的文件，我的闸就整套编不出来。
//      **一道会被队友的半成品打哑的闸不是闸。**
// 逐主体编译（见 prerender.mjs）把爆炸半径关进单个用例里，这是这套架构的全部理由。
//
// 代价写在明处：夹具页是**预渲染的静态 HTML**，没有客户端 React。
// 这意味着本闸守得住 ①状态 ②进出场 ⑤持续与编排 三类（`motion-system.md` 的分类，
// 它们本来就是纯 CSS 驱动的，占动效面的九成），也守得住 token、几何与挂载节点数；
// **守不住**需要真实客户端状态机的那部分。这条限制在运行手册与交付说明里都写了。
// ============================================================================

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SUBJECTS } from "./subjects.mjs";
import { renderCase } from "./prerender.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");

const portArgIndex = process.argv.indexOf("--port");
const PORT = Number(
  portArgIndex > -1 ? process.argv[portArgIndex + 1] : process.env.LEO_HARNESS_PORT ?? 4319,
);

/**
 * `src/lib/motion/` 整个目录按规范是**无依赖、不碰 DOM**（`index.ts` 只多摸一次
 * `document` 来读标记属性）。所以它可以逐文件 tsc transpile 后直接当 ESM 进浏览器，
 * 不需要打包器——只要把相对 specifier 补上 `.mjs` 后缀即可。
 *
 * 必须加载的是 `index.ts` 而不是 `spring.ts`：`window.__leoMotionJumpAllToRest`
 * 挂在 index（`src/lib/motion/index.ts:49`），spring 自己刻意不碰 window。
 */
const MOTION_DIR = join(REPO, "src", "lib", "motion");

function absentStub(reason) {
  // 如实上报缺席，**不给假钩子**——给了就等于替 owner 把红染绿。
  return [
    "export const __leoAbsent = true;",
    `export const __leoAbsentReason = ${JSON.stringify(reason)};`,
  ].join("\n");
}

async function motionModule(name) {
  let source;
  try {
    source = await readFile(join(MOTION_DIR, `${name}.ts`), "utf8");
  } catch {
    return absentStub(
      `src/lib/motion/${name}.ts 不存在（motion-system.md §规范二 归 W02）`,
    );
  }
  const ts = (await import("typescript")).default ?? (await import("typescript"));
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
    },
    fileName: `${name}.ts`,
  });
  // 浏览器不做扩展名补全，node 的 resolver 也不在这里；显式补 `.mjs`。
  return outputText.replace(
    /(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.\.?\/[^"']+?)\2/g,
    (_match, head, quote, specifier) =>
      `${head}${quote}${/\.[a-z]+$/i.test(specifier) ? specifier : `${specifier}.mjs`}${quote}`,
  );
}

const ROUTES = {
  "/__health": async () => ({
    type: "text/plain; charset=utf-8",
    body: `ok cases=${Object.keys(SUBJECTS).length}`,
  }),
  "/__css/ui.css": async () => ({
    type: "text/css; charset=utf-8",
    // 产物本身。读不到就让请求 500——静默降级成空样式表会让全部截图假绿。
    body: await readFile(join(REPO, "src", "theme", "ui.css"), "utf8"),
  }),
  "/__client/harness.js": async () => ({
    type: "text/javascript; charset=utf-8",
    body: await readFile(join(HERE, "client", "harness.js"), "utf8"),
  }),
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const send = (status, type, body) => {
    res.writeHead(status, {
      "content-type": type,
      // 基线要可复现：任何缓存都可能让「改了却没生效」变成绿色。
      "cache-control": "no-store",
    });
    res.end(body);
  };

  (async () => {
    const route = ROUTES[url.pathname];
    if (route) {
      const { type, body } = await route();
      return send(200, type, body);
    }
    const motionMatch = /^\/__client\/motion\/([a-zA-Z0-9_-]+)\.mjs$/.exec(url.pathname);
    if (motionMatch) {
      return send(
        200,
        "text/javascript; charset=utf-8",
        await motionModule(motionMatch[1]),
      );
    }
    const caseMatch = /^\/case\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
    if (caseMatch) {
      const html = await renderCase(caseMatch[1]);
      if (!html) return send(404, "text/plain; charset=utf-8", `unknown case`);
      return send(200, "text/html; charset=utf-8", html);
    }
    send(404, "text/plain; charset=utf-8", "not found");
  })().catch((error) => {
    // 服务器内部错误必须响亮：夹具页 500 好过夹具页空白后被截成一张白图。
    send(500, "text/plain; charset=utf-8", `harness error: ${error?.stack ?? error}`);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`[leo-visual-harness] listening on http://127.0.0.1:${PORT}\n`);
});
