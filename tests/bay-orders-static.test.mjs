// W07（oceanleo-bay）：订单目录的静态红线。
// 用户内容只当纯文本渲染（契约 §8）；不出现 talent 正式站；争议只叫「争议评估」「平台裁定」；
// 站名与子域名只来自 W03 的 bay-links，订单目录里不留自己的站名表。
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const FILES = [
  ...walk(join(REPO, "src/shell/bay/orders")),
  ...["src/lib/bay/orders.ts", "src/lib/bay/disputes.ts", "src/lib/bay/repeat.ts", "src/i18n/ui/messages/bay-orders-copy.ts"]
    .map((path) => join(REPO, path))
    .filter((path) => existsSync(path)),
];

const read = (path) => readFileSync(path, "utf8");
const name = (path) => relative(REPO, path);

test("订单目录与取数层都在扫描范围里", () => {
  const names = FILES.map(name);
  for (const required of [
    "src/shell/bay/orders/index.ts",
    "src/shell/bay/orders/BayOrderCard.tsx",
    "src/lib/bay/orders.ts",
    "src/lib/bay/disputes.ts",
    "src/lib/bay/repeat.ts",
  ]) {
    assert.ok(names.includes(required), `少了 ${required}`);
  }
});

test("没有 dangerouslySetInnerHTML / innerHTML，也没有 talent 正式站", () => {
  for (const file of FILES) {
    const text = read(file);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML|innerHTML/, `${name(file)} 里出现了 HTML 注入点`);
    assert.doesNotMatch(text, /talent\.oceanleo\.com/, `${name(file)} 里出现了 talent 正式站`);
  }
});

test("争议的叫法：不出现法律程序的那个词", () => {
  for (const file of FILES) {
    assert.doesNotMatch(read(file), /仲裁|人工裁定/, `${name(file)} 里出现了不许用的叫法`);
  }
});

test("站名与子域名只来自 bay-links：订单目录里没有站名表、没有写死的子站域名", () => {
  for (const file of FILES) {
    const text = read(file);
    assert.doesNotMatch(text, /\bLeo[A-Z][A-Za-z]+/, `${name(file)} 里写死了产品名`);
    assert.doesNotMatch(text, /https?:\/\/[a-z0-9-]+\.oceanleo\.(com|cn|app)/, `${name(file)} 里写死了子站域名`);
  }
});
