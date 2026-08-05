// ============================================================================
// 「ref + 空依赖 useCallback 包出来的翻译包装，必须把 `vars` 一起转发」的机检
// ----------------------------------------------------------------------------
// 为什么要有这道闸（W25，2026-08-05）：
//
// `effect-tt-dependency.test.mjs` 只判「effect 依赖里那个翻译函数身份稳不稳」。
// 它对包装**怎么写**是不管的：`(zh) => translateRef.current(zh)` 一样能让它变绿。
// 但本仓的翻译函数是 `UITranslate = (zh, vars?) => string`，插值靠第二个参数
// （`i18n/ui/useUI.ts:28-33` 的 `interpolate`）。包装少接一个参数，编译期不报错、
// 上面那道闸也不红，用户看到的却是没替换的 `{name}` —— W20 在
// `SkillPromptPanel.tsx` 上真踩过一次，`signals/W20-request.md` §4 明写为红线。
//
// 所以这里判的是另一件事：**W25 这一轮引入的 10 个包装，vars 真的送得到底层。**
// 判法不是读注释、也不是抄一份形状自测，而是把源码里那行箭头函数**原文取出来实际
// 求值**，喂一个会把收到的 vars 原样吐回来的假翻译函数。少转发一个参数，下面的
// 断言当场失败。
//
// 纯静态取文 + 纯函数求值，不开浏览器、不起渲染器。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

/**
 * W25 本轮改掉的 10 处。清单写死是有意的：这道闸罩的就是这一批，
 * 谁把其中一份的包装退回单参数形，这里立刻红。
 */
const W25_WRAPPER_FILES = [
  "src/shell/chart-editor/use-chart-workbench.ts",
  "src/shell/media-editors/use-audio-wave-loader.ts",
  "src/shell/media-editors/use-model3d-director.ts",
  "src/shell/media-editors/use-model3d-project-bootstrap.ts",
  "src/shell/media-editors/use-model3d-source-loader.ts",
  "src/shell/media-editors/use-pdf-annotations.ts",
  "src/shell/media-editors/use-pdf-document.ts",
  "src/shell/media-editors/use-pdf-preview-render.ts",
  "src/shell/media-editors/use-pdf-workbench.ts",
  "src/shell/use-embed-editor-messages.ts",
];

/**
 * 取出一份源码里所有「空依赖 `useCallback` 且函数体调用 `<某个 ref>.current(...)`」
 * 的包装，连箭头函数原文一起返回。
 */
function translateWrappersIn(relativePath) {
  const absolute = join(REPO, relativePath);
  const text = readFileSync(absolute, "utf8");
  const sourceFile = ts.createSourceFile(
    absolute,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found = [];
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "useCallback" &&
      node.initializer.arguments.length >= 2 &&
      ts.isArrayLiteralExpression(node.initializer.arguments[1]) &&
      node.initializer.arguments[1].elements.length === 0
    ) {
      const body = node.initializer.arguments[0];
      const bodyText = body.getText(sourceFile);
      if (/\btranslateRef\.current\s*\(/.test(bodyText)) {
        found.push({
          name: node.name.text,
          arrowText: bodyText,
          paramCount: ts.isArrowFunction(body) ? body.parameters.length : -1,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * 把包装原文当成真代码跑起来：`translateRef` 换成一个把收到的参数原样吐回来的桩。
 * 转发了 vars 就能在返回值里看见，没转发就看不见 —— 判据不靠读代码，靠取值。
 */
function callWrapper(arrowText, zh, vars) {
  const seen = [];
  const stub = {
    current: (receivedZh, receivedVars) => {
      seen.push({ zh: receivedZh, vars: receivedVars });
      return receivedVars === undefined
        ? receivedZh
        : `${receivedZh}::${JSON.stringify(receivedVars)}`;
    },
  };
  // 包装原文里出现的自由变量只有 `translateRef`，注进去即可求值。
  const wrapper = new Function("translateRef", `return (${arrowText});`)(stub);
  const result = wrapper(zh, vars);
  return { result, seen };
}

test("W25 那 10 份文件每一份都真有一个 ref 包装", () => {
  const missing = W25_WRAPPER_FILES.filter(
    (file) => translateWrappersIn(file).length === 0,
  );
  assert.deepEqual(
    missing,
    [],
    "这些文件里找不到 ref + 空依赖 useCallback 的翻译包装：要么被退回原样，要么改了写法",
  );
});

test("每个包装都收两个形参，一个都不许少", () => {
  const offenders = [];
  for (const file of W25_WRAPPER_FILES) {
    for (const wrapper of translateWrappersIn(file)) {
      if (wrapper.paramCount !== 2) {
        offenders.push(`${file} 的 ${wrapper.name} 只有 ${wrapper.paramCount} 个形参`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "少接一个参数，插值形文案会露出没替换的 {name}（W20 在 SkillPromptPanel.tsx 踩过）",
  );
});

test("把包装原文实际跑一遍：vars 必须原样送到底层翻译函数", () => {
  for (const file of W25_WRAPPER_FILES) {
    for (const wrapper of translateWrappersIn(file)) {
      const { result, seen } = callWrapper(
        wrapper.arrowText,
        "你是「{name}」。",
        { name: "张三" },
      );
      assert.equal(seen.length, 1, `${file} 的 ${wrapper.name} 没有调用底层翻译函数`);
      assert.deepEqual(
        seen[0].vars,
        { name: "张三" },
        `${file} 的 ${wrapper.name} 把 vars 丢了`,
      );
      assert.equal(
        result,
        '你是「{name}」。::{"name":"张三"}',
        `${file} 的 ${wrapper.name} 没有把底层返回值原样交回去`,
      );
    }
  }
});

test("不带 vars 的调用照常成立：单参数调用不许被包装改坏", () => {
  for (const file of W25_WRAPPER_FILES) {
    for (const wrapper of translateWrappersIn(file)) {
      const { result, seen } = callWrapper(wrapper.arrowText, "图表源读取失败");
      assert.equal(seen[0].vars, undefined, `${file} 的 ${wrapper.name} 凭空造了 vars`);
      assert.equal(result, "图表源读取失败");
    }
  }
});

test("反面用例：单参数包装必须被这道闸判红", () => {
  // 判据本身要能失败，否则上面几圈等于空转。这是 W20 踩过的那个写法。
  const leaky = "(zh) => translateRef.current(zh)";
  const { result, seen } = callWrapper(leaky, "你是「{name}」。", { name: "张三" });
  assert.equal(seen[0].vars, undefined, "单参数包装竟然把 vars 传出去了，桩写错了");
  assert.equal(
    result,
    "你是「{name}」。",
    "单参数包装的返回值里不该带 vars —— 这正是用户看见 {name} 的原因",
  );
  // 形参计数那一关同样要拦得住它。
  const arrow = ts
    .createSourceFile("leaky.ts", `const t = useCallback(${leaky}, []);`, ts.ScriptTarget.Latest, true)
    .statements[0].declarationList.declarations[0].initializer.arguments[0];
  assert.equal(arrow.parameters.length, 1);
  assert.notEqual(arrow.parameters.length, 2);
});
