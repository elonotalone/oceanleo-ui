// W03（oceanleo-bay）：Bay 外壳的静态约束。
//   1. 外壳目录里没有任何 HTML 注入点（契约 §8.1）。
//   2. AI 输入框旁的「叫真人」按钮已删，AI 对话里的求助状态行还在（契约 §0.3）。
//   3. 外壳用到的每个样式类都已编进主题产物——站点只加载编好的产物，产物里没有的类在站上不生效。
//      本文件刻意不写任何类名字面量：要比对的类全部运行时从源码里取。
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SHELL_DIR = join(REPO, "src", "shell", "bay", "shell");

function shellFiles() {
  return readdirSync(SHELL_DIR)
    .filter((name) => /\.(ts|tsx)$/.test(name))
    .map((name) => ({ name, text: readFileSync(join(SHELL_DIR, name), "utf8") }));
}

test("外壳目录没有 HTML 注入点", () => {
  const sinks = [/dangerouslySetInnerHTML/, /\binnerHTML\b/, /\bouterHTML\b/, /insertAdjacentHTML/, /document\.write/];
  const files = shellFiles();
  assert.ok(files.length >= 10, `外壳文件数 ${files.length}`);
  for (const { name, text } of files) {
    for (const sink of sinks) assert.equal(sink.test(text), false, `${name} 含 ${sink}`);
  }
});

test("AgentChat：输入框旁的叫真人按钮已删，求助状态行保留，并登记任务上下文", () => {
  const text = readFileSync(join(REPO, "src", "shell", "AgentChat.tsx"), "utf8");
  assert.equal(/HumanHandoffButton/.test(text), false, "AgentChat 里仍出现 HumanHandoffButton");
  assert.match(text, /<HumanHandoffStatus\b/);
  assert.match(text, /setBayTaskContext\(/);
});

/** 表达式里的全部字符串片段；模板字符串的静态部分算一段，`${…}` 里的再递归取。 */
function stringsIn(expr) {
  const out = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '"' || ch === "'") {
      const end = expr.indexOf(ch, i + 1);
      out.push(expr.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    if (ch === "`") {
      let j = i + 1;
      let staticText = "";
      while (j < expr.length && expr[j] !== "`") {
        if (expr[j] === "$" && expr[j + 1] === "{") {
          let depth = 1;
          let k = j + 2;
          while (k < expr.length && depth > 0) {
            if (expr[k] === "{") depth += 1;
            else if (expr[k] === "}") depth -= 1;
            k += 1;
          }
          out.push(...stringsIn(expr.slice(j + 2, k - 1)));
          staticText += " ";
          j = k;
          continue;
        }
        staticText += expr[j];
        j += 1;
      }
      out.push(staticText);
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

/** 从源码里取出 className 表达式中的全部字符串片段，拆成一个个类。 */
function classTokens(text) {
  const tokens = new Set();
  const starts = /className\s*[:=]\s*/g;
  let match;
  while ((match = starts.exec(text))) {
    let i = match.index + match[0].length;
    let expr = "";
    if (text[i] === "{") {
      let depth = 0;
      for (; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === "{") depth += 1;
        if (ch === "}") depth -= 1;
        expr += ch;
        if (depth === 0) break;
      }
    } else {
      const quote = text[i];
      const end = text.indexOf(quote, i + 1);
      expr = text.slice(i, end + 1);
    }
    for (const body of stringsIn(expr)) {
      for (const token of body.split(/\s+/)) if (token) tokens.add(token);
    }
  }
  return tokens;
}

function cssEscape(token) {
  return token.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

function regexEscape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("外壳用到的样式类都已在主题产物里", () => {
  // 产物 + 外壳自带的手机样式表（AppShell 引入，触控热区类在那里）。
  const css = ["src/theme/ui.css", "src/theme/globals.css", "src/shell/phone-shell.css"]
    .map((path) => execFileSync("git", ["show", `HEAD:${path}`], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }))
    .join("\n");
  const missing = [];
  for (const { name, text } of shellFiles()) {
    if (!name.endsWith(".tsx")) continue;
    for (const token of classTokens(text)) {
      if (!/^[a-z!-]/.test(token)) continue;
      const selector = new RegExp(`\\.${regexEscape(cssEscape(token))}(?![\\w-])`);
      if (!selector.test(css)) missing.push(`${name}: ${token}`);
    }
  }
  assert.deepEqual(missing, [], `主题产物里没有这些类（站上不会生效）：\n${missing.join("\n")}`);
});
