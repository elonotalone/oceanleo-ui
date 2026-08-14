/**
 * 让断言的**失败信息**永远不去展开 DOM 节点。
 *
 * 2026-08-13，整台服务器卡死数小时、只能重启。凶手不是被测代码，是一条红用例的
 * 失败信息：`assert.equal(<jsdom 按钮>, undefined)` 失败时，Node 的 assert 用
 * `{ depth: 1000, getters: true, customInspect: false }` 去展开被比较的值，顺着
 * `ownerDocument` / `parentNode` / `children` 把整张文档图铺开，几秒钟吃掉数 GiB，
 * 容器撞上 10 GiB 上限后开始换页，磁盘被交换 I/O 打满，中继与 agent 一起没了响应。
 * 同一个形状在 8-07 与 8-10 各发作过一次（守卫的 stall-kill 与 wall-clock-kill 记录里
 * 点名的就是这两个文件）。
 *
 * `customInspect: false` 意味着给节点挂 `util.inspect.custom` 没用——assert 明确
 * 不看它。所以改在这里：自己先判等，判等通过就什么都不渲染；判不过时才抛，
 * 且抛之前把两侧的 DOM 节点换成一行短描述。
 *
 * 判等语义与原生逐字相同（`equal`/`strictEqual` 用 `Object.is`，`deepEqual` 用
 * `util.isDeepStrictEqual`），所以红的还是红、绿的还是绿；变的只有失败信息的体积。
 * 全仓 80 余处 `assert.equal(container.querySelector(...), null)` 因此一次性脱敏，
 * 不需要逐处改写，将来新写的也自动受保护。
 */
import assert, { AssertionError } from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";

const NODE_NAMES = new Set(["nodeType", "nodeName"]);

function isDomNode(value) {
  if (!value || typeof value !== "object") return false;
  for (const key of NODE_NAMES) {
    if (!(key in value)) return false;
  }
  return typeof value.nodeType === "number";
}

/** 一行足够认出是哪个节点：标签 + id/class/data 标记 + 直接文本。 */
function describeNode(node) {
  const name = String(node.nodeName || "node").toLowerCase();
  if (node.nodeType === 3) {
    return `«#text ${JSON.stringify(String(node.data || "").slice(0, 60))}»`;
  }
  if (typeof node.getAttributeNames !== "function") return `«${name}»`;
  const attrs = node
    .getAttributeNames()
    .slice(0, 6)
    .map((key) => `${key}="${String(node.getAttribute(key) || "").slice(0, 40)}"`)
    .join(" ");
  const text = [...(node.childNodes || [])]
    .filter((child) => child.nodeType === 3)
    .map((child) => String(child.data || ""))
    .join("")
    .trim()
    .slice(0, 40);
  return `«<${name}${attrs ? ` ${attrs}` : ""}>${text ? ` ${text}` : ""}»`;
}

function safe(value, depth = 0) {
  if (isDomNode(value)) return describeNode(value);
  if (depth >= 3 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => safe(entry, depth + 1));
  return value;
}

function guard(name, passes) {
  const original = assert[name];
  if (typeof original !== "function" || original.__domGuarded) return;
  const wrapped = (actual, expected, message) => {
    if (passes(actual, expected)) return;
    if (!isDomNode(actual) && !isDomNode(expected)) {
      // 两侧都不是节点：原生实现的信息更好，让它照旧报。
      original(actual, expected, message);
      return;
    }
    throw new AssertionError({
      message:
        typeof message === "string" && message
          ? message
          : `${name}: ${JSON.stringify(safe(actual))} 与期望值不符`,
      actual: safe(actual),
      expected: safe(expected),
      operator: name,
      stackStartFn: wrapped,
    });
  };
  wrapped.__domGuarded = true;
  assert[name] = wrapped;
}

guard("equal", (actual, expected) => Object.is(actual, expected));
guard("strictEqual", (actual, expected) => Object.is(actual, expected));
guard("deepEqual", (actual, expected) => isDeepStrictEqual(actual, expected));
guard("deepStrictEqual", (actual, expected) =>
  isDeepStrictEqual(actual, expected),
);
guard("notEqual", (actual, expected) => !Object.is(actual, expected));
guard("notStrictEqual", (actual, expected) => !Object.is(actual, expected));
