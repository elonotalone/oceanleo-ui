// ============================================================================
// 「引擎活着，但屏幕上进不去」的机检（W29，2026-08-31）
// ----------------------------------------------------------------------------
// 这道闸拦的不是引擎有没有写好，是**外壳有没有向用户申报出入口**。
//
// V4 裁决 §0 的实测：`RichDocCommentRail`（批注侧栏）与 `DeckPresenterView`
// （演讲者视图，1,117 行）都写完并被自己的测试锁住了，但两者在 `src/` 里
// **零消费方** —— 两条路由从来没向外壳申报过挂载位。用户侧的表现是：
// 富文档建得出批注却读不到、回不了、解决不了（W15 合了六个工具栏控件之后，
// 这变成「写得进读不出」，半接的入口比没有入口更糟）；幻灯根本点不开放映。
//
// 判据全部是**静态形状断言**，不是快照：prop 名单与两个 interface 对拴，
// 谁改了引擎 API 又没改接线，这里当场红。纯 TypeScript AST，不开浏览器。
//
// 四条各自守什么、把它改回去会红在哪一条，见每个 test 上方的注释。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const SRC = new URL("../src/", import.meta.url);

function parse(relativePath) {
  const url = new URL(relativePath, SRC);
  const text = readFileSync(url, "utf8");
  return ts.createSourceFile(
    relativePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function walk(node, visit) {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function collect(node, predicate) {
  const found = [];
  walk(node, (child) => {
    if (predicate(child)) found.push(child);
  });
  return found;
}

/** 剥掉 `as const` / 括号，拿到真正的字面量。 */
function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) || ts.isParenthesizedExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

/** 取对象字面量里某个属性的初始化表达式。 */
function prop(objectLiteral, name) {
  for (const member of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(member)) continue;
    if (member.name.getText() !== name) continue;
    return unwrap(member.initializer);
  }
  return undefined;
}

function stringProp(objectLiteral, name) {
  const value = prop(objectLiteral, name);
  return value && ts.isStringLiteral(value) ? value.text : undefined;
}

/**
 * 路由传给 `<AdvancedWorkbenchShell adapter={{ … }}>` 的那个适配器字面量。
 * 必须从这个 JSX 属性起手：`DeckRoute` 里还有一个 `materialAdapter`，
 * 它也有个 `actions`（`["insert","replace"]`），按属性名满树找会把两者混在一起。
 */
function adapterObject(sourceFile) {
  const [attribute] = collect(
    sourceFile,
    (node) =>
      ts.isJsxAttribute(node) &&
      node.name.getText() === "adapter" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      ts.isObjectLiteralExpression(unwrap(node.initializer.expression)),
  );
  assert.ok(attribute, `${sourceFile.fileName} 没有 adapter={{…}} 适配器字面量`);
  return unwrap(attribute.initializer.expression);
}

/** 适配器上那个数组属性（`drawers` / `actions`）里的对象元素（跳过条件展开）。 */
function adapterArrayEntries(sourceFile, propertyName) {
  const value = prop(adapterObject(sourceFile), propertyName);
  assert.ok(
    value && ts.isArrayLiteralExpression(value),
    `${sourceFile.fileName} 的 adapter 上没有数组属性 \`${propertyName}\``,
  );
  return value.elements
    .map(unwrap)
    .filter((element) => ts.isObjectLiteralExpression(element));
}

function interfaceMembers(sourceFile, interfaceName) {
  const [declaration] = collect(
    sourceFile,
    (node) =>
      ts.isInterfaceDeclaration(node) && node.name.text === interfaceName,
  );
  assert.ok(declaration, `找不到 interface ${interfaceName}`);
  return new Set(
    declaration.members
      .filter((member) => member.name)
      .map((member) => member.name.getText()),
  );
}

/** JSX 元素上的属性表：属性名 → 值表达式的源码文本。 */
function jsxAttributes(sourceFile, tagName) {
  const [element] = collect(sourceFile, (node) => {
    if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText() === tagName;
    if (ts.isJsxOpeningElement(node)) return node.tagName.getText() === tagName;
    return false;
  });
  assert.ok(element, `${sourceFile.fileName} 里没有 <${tagName}>`);
  const attributes = new Map();
  for (const attribute of element.attributes.properties) {
    if (!ts.isJsxAttribute(attribute)) continue;
    const initializer = attribute.initializer;
    const value =
      initializer && ts.isJsxExpression(initializer) && initializer.expression
        ? initializer.expression.getText()
        : "";
    attributes.set(attribute.name.getText(), value);
  }
  return attributes;
}

/** 按源码位置排好序的 `await` 表达式。 */
function awaitsInOrder(node) {
  return collect(node, ts.isAwaitExpression).sort(
    (left, right) => left.pos - right.pos,
  );
}

function calleeName(awaitExpression) {
  const inner = unwrap(awaitExpression.expression);
  if (!ts.isCallExpression(inner)) return inner.getText();
  return unwrap(inner.expression).getText();
}

// ---------------------------------------------------------------------------
// A1 判据 1：富文档申报的抽屉里，批注与「插入」必须同时在场
//
// 这里的陷阱值一条判据：`resolveInlineAdvancedDrawers`
// （`inline-advanced-shell-helpers.ts:22`）一旦看到 `drawers` 非空就 `return`，
// 下面那条把 `toolbox` 合成成 `editor-global` 抽屉的回落**整段不再执行**。
// 所以给富文档加批注抽屉的人，必须把原来的「插入」也原样写成一项；
// 漏了它，用户看到的是「插入面板一夜之间没了」，而且没有任何报错。
//
// 反面验证（已做，当场红）：删掉 `editor-global` 那一项。
// ---------------------------------------------------------------------------
test("W29 A1: 富文档路由申报的 drawers 同时有「插入」与批注两项", () => {
  const route = parse("shell/advanced-routes/RichDocRoute.tsx");
  const drawers = adapterArrayEntries(route, "drawers");
  const ids = drawers.map((drawer) => stringProp(drawer, "id"));

  assert.ok(
    drawers.length >= 2,
    `富文档 drawers 只有 ${drawers.length} 项：申报了 drawers 就没有 toolbox 回落了`,
  );

  // 「插入」：id 必须仍是 `editor-global` —— 那正是回落原本合成出来的 id，
  // 换个名字等于把用户认识的那个面板换了个身份。
  const insert = drawers.find(
    (drawer) => stringProp(drawer, "id") === "editor-global",
  );
  assert.ok(
    insert,
    `drawers 里没有 editor-global：插入面板会从界面上消失。实得 ${JSON.stringify(ids)}`,
  );
  assert.equal(stringProp(insert, "label"), "插入");
  assert.equal(stringProp(insert, "icon"), "add");
  assert.match(prop(insert, "content").getText(), /<RichDocControls\b/);

  // 批注：真的挂了侧栏组件，不是挂个空面板占位。
  const review = drawers.find((drawer) =>
    /<RichDocCommentRail\b/.test(prop(drawer, "content")?.getText() || ""),
  );
  assert.ok(
    review,
    `没有任何抽屉挂 RichDocCommentRail：批注仍然只写得进读不出。实得 ${JSON.stringify(ids)}`,
  );
  assert.ok(
    stringProp(review, "label"),
    "批注抽屉得有 label，否则轨道上是一个没名字的按钮",
  );

  // 侧栏必须真的被 import 进来（`content` 里那个标签名不能是个巧合的字符串）。
  const imports = collect(route, ts.isImportDeclaration).map((node) =>
    node.getText(),
  );
  assert.ok(
    imports.some((text) => /RichDocCommentRail/.test(text)),
    "RichDocCommentRail 没有被 import",
  );
});

// ---------------------------------------------------------------------------
// A1 判据 2：侧栏的 12 个 prop 与引擎 API 逐条对得上
//
// 形状断言，不是快照：下面这张表同时与**三处**对拴 ——
//   · `RichDocCommentRailProps`（侧栏要什么）：少接一个就红；
//   · `RichDocReviewApi`（引擎给什么）：引擎改名就红；
//   · 路由里的 JSX（实际接了什么）：接错对象就红。
// 三者任意一处漂移，这条当场红，而且报得出漂的是哪一边。
//
// 反面验证（已做，当场红）：把 `onResolve` 接成 `editor.review.removeComment`
// —— 那也是一个真实存在的 API 成员，光查「成员在不在」是抓不到的，
// 必须靠这张一一对应表。
// ---------------------------------------------------------------------------
const REVIEW_RAIL_WIRING = {
  comments: "comments",
  changes: "changes",
  activeCommentId: "activeCommentId",
  trackChangesEnabled: "trackChangesEnabled",
  onFocusComment: "focusComment",
  onReply: "replyToComment",
  onResolve: "resolveComment",
  onRemove: "removeComment",
  onAcceptChange: "acceptChange",
  onRejectChange: "rejectChange",
  onAcceptAll: "acceptAllChanges",
  onRejectAll: "rejectAllChanges",
};

test("W29 A1: 批注侧栏拿到的每个 prop 都接在引擎 API 的对应成员上", () => {
  const route = parse("shell/advanced-routes/RichDocRoute.tsx");
  const rail = parse("shell/doc-editors/richdoc-review/RichDocCommentRail.tsx");
  const engine = parse("shell/doc-editors/richdoc-review/use-richdoc-review.ts");

  const required = interfaceMembers(rail, "RichDocCommentRailProps");
  const api = interfaceMembers(engine, "RichDocReviewApi");
  const wired = jsxAttributes(route, "RichDocCommentRail");

  // ① 表覆盖侧栏要求的全部必填 prop（`?:` 可选的不强求）。
  assert.deepEqual(
    [...required].sort(),
    Object.keys(REVIEW_RAIL_WIRING).sort(),
    "RichDocCommentRailProps 变了：接线表要跟着改（多出来的没接，少掉的接了个不存在的）",
  );

  for (const [propName, apiMember] of Object.entries(REVIEW_RAIL_WIRING)) {
    // ② 引擎真有这个成员。
    assert.ok(
      api.has(apiMember),
      `RichDocReviewApi 没有 ${apiMember}：引擎改名了，${propName} 的接线是空的`,
    );
    // ③ 路由真的接了，且接的正是它。
    assert.equal(
      wired.get(propName),
      `editor.review.${apiMember}`,
      `${propName} 接错了：应当是 editor.review.${apiMember}`,
    );
  }

  assert.equal(
    wired.size,
    Object.keys(REVIEW_RAIL_WIRING).length,
    `<RichDocCommentRail> 上有表外的 prop：${[...wired.keys()].join(", ")}`,
  );
});

// ---------------------------------------------------------------------------
// A2 判据 3：幻灯路由有放映入口
//
// V4 逐个查过 `DeckRoute.tsx` 原有的 12 个抽屉，无一是放映
// （`deck-notes`「便签」是往画布插贴纸，不是演讲者备注，别接错对象）。
// 入口做成顶栏 action 而不是抽屉，是因为放映要换掉整个舞台，不是开个面板。
// ---------------------------------------------------------------------------
test("W29 A2: 幻灯路由有放映入口，且不藏在下载组里", () => {
  const route = parse("shell/advanced-routes/DeckRoute.tsx");
  const actions = adapterArrayEntries(route, "actions");

  const present = actions.find((action) => {
    const trigger = prop(action, "onTrigger");
    return /startPresentation/.test(trigger?.getText() || "");
  });
  assert.ok(
    present,
    `幻灯顶栏没有任何 action 走 startPresentation：演讲者视图仍然零入口。实得 ${JSON.stringify(
      actions.map((action) => stringProp(action, "id")),
    )}`,
  );

  assert.match(
    prop(present, "label").getText(),
    /放映/,
    "放映入口得叫得出名字，用户才找得到",
  );
  // `group: "download"` 会被折进下载菜单（`AdvancedWorkspaceActionBar.tsx:56`），
  // 那条路径点开菜单才看得见，且不是放映该待的地方。
  assert.equal(stringProp(present, "group"), undefined);

  // 视图与开窗函数都真的被 import 了（降级分屏渲染在主窗，靠的是前者）。
  const imports = collect(route, ts.isImportDeclaration)
    .map((node) => node.getText())
    .join("\n");
  assert.match(imports, /openDeckPresenterWindow/);
  assert.match(imports, /DeckPresenterView/);
});

// ---------------------------------------------------------------------------
// A2 判据 4：放映 handler 的第一个 await 就是 `openDeckPresenterWindow`
//
// 这是整份活里最容易无声坏掉的一条。`openDeckPresenterWindow` 把 `window.open`
// 放在它自己的第一个 `await` 之前（同步开窗、异步挂 root），靠的是调用它的时候
// 还留在用户手势的调用栈里。谁在它前面先 `await` 一下别的（存个盘、取个数），
// 手势栈就出栈了，浏览器一律按「程序自发弹窗」拦掉 ——
// **不抛错、不提示、控制台干净，用户点了就是没反应。**
//
// 所以这里锁的是顺序，不是「有没有调用」。
// 反面验证（已做，当场红）：在它前面插一句 `await editor.save()`。
// ---------------------------------------------------------------------------
test("W29 A2: 放映 handler 的第一个 await 就是 openDeckPresenterWindow", () => {
  const route = parse("shell/advanced-routes/DeckRoute.tsx");
  const [declaration] = collect(
    route,
    (node) =>
      ts.isVariableDeclaration(node) &&
      node.name.getText() === "startPresentation",
  );
  assert.ok(declaration, "找不到 startPresentation");

  const awaits = awaitsInOrder(declaration);
  assert.ok(
    awaits.length >= 1,
    "startPresentation 里一个 await 都没有：开窗结果没被消费，降级分支也就无从谈起",
  );
  assert.equal(
    calleeName(awaits[0]),
    "openDeckPresenterWindow",
    "第一个 await 不是开窗：出了用户手势栈，弹窗会被静默拦截（不报错、不提示、就是没反应）",
  );

  // 拦截了要说得出为什么：`outcome.reason` 得透进降级视图。
  const body = declaration.getText();
  assert.match(
    body,
    /outcome\.ok/,
    "没有分支处理开窗失败：blocked / unsupported 时用户什么都得不到",
  );
  assert.match(
    body,
    /outcome\.reason/,
    "降级时没有把 reason 透出去，界面只能说一句通用话",
  );
});

// ---------------------------------------------------------------------------
// 判据 4b：从 onClick 到 onTrigger 这一段外壳派发必须全程同步
//
// 上面那条只管住了 handler 自己。真正的手势栈是从按钮的 onClick 起算的，
// 中间还隔着外壳的两跳。这两跳今天是同步的（实测）：
//   · `AdvancedWorkspaceActionBar.tsx:132` `onClick={() => void triggerAction(action)}`
//   · 同文件 `:67` `await onTriggerAction(action)` —— 实参在挂起前同步求值
//   · `InlineAdvancedWorkbenchHeader.tsx:139` `return action.onTrigger?.()`
// 谁哪天在这两跳里插一个先行的 `await`，放映会在**不改 DeckRoute 一个字**的情况下
// 静默失效。那两个文件不归 W29，这里只下机检不改它们。
// ---------------------------------------------------------------------------
test("W29 A2: 外壳派发 action 时没有先 await 别的（手势栈不许断）", () => {
  const bar = parse("shell/AdvancedWorkspaceActionBar.tsx");
  const [triggerAction] = collect(
    bar,
    (node) =>
      ts.isVariableDeclaration(node) && node.name.getText() === "triggerAction",
  );
  assert.ok(triggerAction, "AdvancedWorkspaceActionBar 里找不到 triggerAction");

  const awaits = awaitsInOrder(triggerAction);
  assert.ok(awaits.length >= 1, "triggerAction 里没有 await，判据前提变了，回来重读");
  assert.equal(
    calleeName(awaits[0]),
    "onTriggerAction",
    "外壳在派发 action 之前先 await 了别的：所有靠用户手势开窗的入口都会被静默拦截",
  );
});
