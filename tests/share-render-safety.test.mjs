// UC-4：分享面（长图 / 卡片 / 正文 markdown）不得有 HTML 注入槽。
// 仲裁 A-2 定的是源码级判据——不是「消毒后再塞 innerHTML」，而是源码里根本没有
// HTML 字符串这一步：公式走 katex.render(tex, node, …)，由 KaTeX 自己建 DOM。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shareDir = path.join(root, "src/shell/share");

/** 只看会执行的代码：注释里点名这些禁用写法是文档，不是注入面。 */
function read(relative) {
  return readFileSync(path.join(root, relative), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");
}

const shareSources = readdirSync(shareDir)
  .filter((name) => /\.tsx?$/.test(name))
  .map((name) => [`src/shell/share/${name}`, read(`src/shell/share/${name}`)]);

test("UC-4 分享面与对话正文都没有 innerHTML / dangerouslySetInnerHTML 注入槽", () => {
  const sources = [
    ...shareSources,
    ["src/shell/Markdown.tsx", read("src/shell/Markdown.tsx")],
    ["src/shell/AgentChat.tsx", read("src/shell/AgentChat.tsx")],
    ["src/shell/AgentTranscriptBubble.tsx", read("src/shell/AgentTranscriptBubble.tsx")],
  ];
  assert.ok(shareSources.length >= 10, "share 目录没扫到文件，判据形同虚设");
  for (const [file, code] of sources) {
    assert.equal(
      /\.innerHTML\s*=/.test(code),
      false,
      `${file} 出现了 innerHTML 赋值`,
    );
    assert.equal(
      code.includes("dangerouslySetInnerHTML"),
      false,
      `${file} 出现了 dangerouslySetInnerHTML`,
    );
    assert.equal(
      /\.outerHTML\s*=/.test(code) || code.includes("insertAdjacentHTML"),
      false,
      `${file} 出现了等价于 innerHTML 的写法`,
    );
  }
});

test("UC-4 公式渲染只有 katex.render 一条路，源码里不存在 renderToString", () => {
  const math = read("src/shell/share/share-math.ts");
  assert.ok(
    /katex\.render\(\s*item\.tex,\s*node,/.test(math),
    "share-math.ts 应当用 katex.render 往元素里建 DOM",
  );
  for (const [file, code] of [
    ["src/shell/share/share-math.ts", math],
    ["src/shell/share/katex-runtime.ts", read("src/shell/share/katex-runtime.ts")],
  ]) {
    assert.equal(
      code.includes("renderToString"),
      false,
      `${file} 还留着 renderToString（会吐 HTML 字符串）`,
    );
  }
});

test("UC-4 正文与长图共用同一组 KaTeX 选项，且 trust 关着", async () => {
  const runtime = await import("../src/shell/share/katex-runtime.ts");
  assert.equal(runtime.KATEX_OPTIONS.trust, false);
  assert.equal(runtime.KATEX_OPTIONS.strict, "ignore");
  // Markdown.tsx（正文）不许自己另起一套选项。
  const markdown = read("src/shell/Markdown.tsx");
  assert.ok(markdown.includes('from "./share/katex-runtime"'));
  assert.equal(/trust\s*:/.test(markdown), false);
});
