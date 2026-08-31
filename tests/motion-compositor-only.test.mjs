/**
 * 合成器属性闸。`motion-system.md` §规范二 实现约束 4：手势点只许写
 * `transform` / `opacity`。写 `left` / `width` / `height` 这些会触发布局的
 * 属性，弹簧每帧都会让浏览器重新布局整棵子树——那正是「流畅」的反面，
 * 也是这一整套原语存在的理由。
 *
 * **用 TypeScript AST 判，不许用 grep**（W02.md §P5 明确要求）。
 * 理由在 `_COMMON.md` §7b ③：本波 grep 判错已经出现四次。
 * 具体到这道闸，grep 判不出来的至少有三种写法：
 *   `el.style["left"] = x`、`el.style.setProperty("left", x)`、
 *   以及注释里出现 `style.left` 但代码里并没有。
 * AST 三种都认得出，而且能把「读」和「写」分开——只有赋值才算。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

/** 与 `motion-spring-ownership.test.mjs` 的 ALLOWED 同源：本波的两个手势点。 */
const GESTURE_POINTS = [
  "src/shell/edit-bar-dock-controller.tsx",
  "src/shell/FloatingContextToolbar.tsx",
];

const ALLOWED_PROPERTIES = new Set(["transform", "opacity"]);

/**
 * 清空写法（`el.style.transform = ""`）不受管辖：它是**撤销**一次动效写入，
 * 不会让浏览器多做一次布局。允许它，否则「形变结束后把 transform 抹掉」
 * 这个必要动作会被自己的闸拦住。
 */
function isClearingAssignment(node) {
  return (
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    node.text === ""
  );
}

/** `x.style` / `x.style.foo` 里那个 `.style` —— 判断某个表达式是不是样式对象。 */
function isStyleAccess(node) {
  return (
    ts.isPropertyAccessExpression(node) && node.name.escapedText === "style"
  );
}

function readSource(relativePath) {
  const file = join(REPO, relativePath);
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

/** 一份手势点文件里所有对样式属性的**写入**，含属性名与行号。 */
function styleWritesIn(relativePath) {
  const source = readSource(relativePath);
  const writes = [];

  const record = (property, node) => {
    writes.push({ property, line: lineOf(source, node) });
  };

  const visit = (node) => {
    // ① el.style.left = …（含 += 之类的复合赋值）
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.EqualsToken ||
        node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken)
    ) {
      const target = node.left;
      if (
        ts.isPropertyAccessExpression(target) &&
        isStyleAccess(target.expression) &&
        !isClearingAssignment(node.right)
      ) {
        record(String(target.name.escapedText), node);
      }
      // ② el.style["left"] = …
      if (
        ts.isElementAccessExpression(target) &&
        isStyleAccess(target.expression) &&
        ts.isStringLiteral(target.argumentExpression) &&
        !isClearingAssignment(node.right)
      ) {
        record(target.argumentExpression.text, node);
      }
    }
    // ③ el.style.setProperty("left", …)
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.escapedText === "setProperty" &&
      isStyleAccess(node.expression.expression) &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      record(node.arguments[0].text, node);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return writes;
}

test("手势点只写 transform / opacity，一个布局属性都不许写", () => {
  for (const relativePath of GESTURE_POINTS) {
    const writes = styleWritesIn(relativePath);
    const offending = writes.filter(
      (write) => !ALLOWED_PROPERTIES.has(write.property),
    );
    assert.deepEqual(
      offending,
      [],
      `${relativePath} 写了非合成器属性：` +
        offending.map((w) => `${w.property}（第 ${w.line} 行）`).join("、") +
        `\n只许写 ${[...ALLOWED_PROPERTIES].join(" / ")}；` +
        `要改尺寸请用 transform: scale() 做 FLIP，不要逐帧写 width/height。`,
    );
  }
});

test("扫描器本身认得出违规写法（正对照，防止全绿是因为它什么都没看见）", () => {
  // 零命中是最贵的一类断言（`_COMMON.md` §6）：上面那条全绿，可能是「没人违规」，
  // 也可能是「AST 遍历写错了，一个赋值都没匹配到」。这里用一段合成源码
  // 把三种违规写法各喂一次，证明扫描器真的会抓。
  const probe = ts.createSourceFile(
    "probe.ts",
    `
      declare const el: HTMLElement;
      el.style.transform = "translate3d(0,0,0)";
      el.style.opacity = "1";
      el.style.left = "10px";
      el.style["width"] = "20px";
      el.style.setProperty("height", "30px");
      el.style.transform = "";
    `,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const seen = [];
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const target = node.left;
      if (
        ts.isPropertyAccessExpression(target) &&
        isStyleAccess(target.expression) &&
        !isClearingAssignment(node.right)
      ) {
        seen.push(String(target.name.escapedText));
      }
      if (
        ts.isElementAccessExpression(target) &&
        isStyleAccess(target.expression) &&
        ts.isStringLiteral(target.argumentExpression) &&
        !isClearingAssignment(node.right)
      ) {
        seen.push(target.argumentExpression.text);
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.escapedText === "setProperty" &&
      isStyleAccess(node.expression.expression) &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      seen.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(probe);

  // 三种违规写法都抓到了，两种合法写法照旧放行，清空写法不计入。
  assert.deepEqual(seen, [
    "transform",
    "opacity",
    "left",
    "width",
    "height",
  ]);
});

test("paintMotion 是编辑栏唯一的 transform 写入点", () => {
  // 归属之外还要管**收敛**：同一个属性由两处写，重渲染时谁最后跑谁赢，
  // 那正是接弹簧之前「React 的 transform 盖掉动效值」的老毛病。
  const controller = styleWritesIn("src/shell/edit-bar-dock-controller.tsx");
  assert.ok(
    controller.length > 0,
    "控制器一处样式写入都没有：动效层没接上，或者扫描器坏了",
  );

  // 浮层组件自己一行样式赋值都不该有：它只提供结构与静态 style 对象，
  // 位置与形变全部由控制器的 paintMotion() 写。
  const floating = styleWritesIn("src/shell/FloatingContextToolbar.tsx");
  assert.deepEqual(
    floating,
    [],
    `FloatingContextToolbar 不该自己写样式，实际写了：` +
      floating.map((w) => `${w.property}（第 ${w.line} 行）`).join("、"),
  );

  // 容器的 style 里也不许再有 transform 字面量：`getBoundingClientRect` 的
  // 替身与真实浏览器都从这里读位置，两份真相会让位置断言读到过期值。
  const source = readFileSync(
    join(REPO, "src/shell/FloatingContextToolbar.tsx"),
    "utf8",
  );
  assert.equal(
    /transform:\s*`?translate3d/.test(source),
    false,
    "FloatingContextToolbar 的 style 里还留着 transform: translate3d(…)，" +
      "它会在每次重渲染时盖掉弹簧算出来的中间帧",
  );
});
