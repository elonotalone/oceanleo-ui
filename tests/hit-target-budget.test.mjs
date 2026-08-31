// ============================================================================
// 命中区预算锁：交互元素不许小于 44px（W04，2026-08-31）
// ----------------------------------------------------------------------------
// 44 不是审美，是**能不能点中**。编辑栏那条线早就画好了——
// `src/shell/edit-bar-surface.ts` 的 `EDIT_BAR_CONTROL_SIZE_PX = 44`——
// 但工作台 chrome 一直是 `h-8 w-8`(32)、缩放键 `h-7 w-7`(28)、
// `PluginChromeEditBarButton` `h-9`(36)。同一个产品里两套纪律，
// 靠人记得选就等于没有纪律，所以：**原语默认 `lg`(44)，比 44 小的必须显式要，
// 而且只有登记在本文件白名单里的密集工具条能要。**
//
// 本文件登记全部 < 44px 的交互点位，形成白名单 + 预算，**只减不增**。
// 判据直接读 `src/ui/Button.tsx` 导出的 `BUTTON_SIZE_PX`，
// 所以改那张表会立刻反映到这里，不会出现「常量与判据各说各话」。
//
// **查证范围（`_COMMON.md` §7 要求写明）**：只扫 `src/`，只认**类名里写死了高度**
// 的交互元素（`h-<n>` / `h-[<n>px]` / `size-<n>`）与**原语的 `size` prop**。
// 没写高度的元素（靠 padding 撑、靠父容器 grid 定高）本判据看不见——
// 静态分析拿不到布局结果，硬猜只会制造假数字。所以 `PENDING_HIT_TARGET` 是
// 「**写死了小尺寸**的点位数」的下限，不是「所有小于 44px 的元素」的全集。
// 这个收窄是刻意的：一个能自证的下限，比一个猜出来的全集有用得多。
// ============================================================================

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ts from "typescript";

import { dirtyAmong, measureOnCommittedTree } from "./helpers/clean-tree-baseline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SRC = join(REPO, "src");
const FIXTURE = join(HERE, "fixtures", "hit-target-fixture.tsx");

/** 合规下限。与 `edit-bar-surface.ts` 的 `EDIT_BAR_CONTROL_SIZE_PX` 同源同值。 */
const MIN_HIT_TARGET_PX = 44;

// ------------------------------------------------- 从原语读那张像素表

/**
 * 判据读 `BUTTON_SIZE_PX` 本身，而不是自己抄一份 36/40/44。
 * 抄一份的话，谁把 `md` 改成 48 这里也不知道，预算锁就开始说谎。
 */
function buttonSizePx() {
  const file = join(REPO, "src/ui/Button.tsx");
  const sourceFile = ts.createSourceFile(
    file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  let table = null;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
      node.name.text === "BUTTON_SIZE_PX" && node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      table = {};
      for (const prop of node.initializer.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isNumericLiteral(prop.initializer)) {
          table[prop.name.getText()] = Number(prop.initializer.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return table;
}

/**
 * 原语不传 `size` 时用哪一档。判据必须知道这个默认值，否则「默认就是 44」这条
 * 承诺在本锁里是空的：把 `BUTTON_DEFAULT_SIZE` 改成 `sm` 会让全仓每一处
 * `<Button>` 悄悄缩到 36，而一处 `size=` 都没多写，纯看 `size` prop 的判据全绿。
 */
function buttonDefaultSize() {
  const file = join(REPO, "src/ui/Button.tsx");
  const sourceFile = ts.createSourceFile(
    file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  let value = null;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
      node.name.text === "BUTTON_DEFAULT_SIZE" && node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      value = node.initializer.text;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return value;
}

const BUTTON_SIZE_PX = buttonSizePx();
const BUTTON_DEFAULT_SIZE = buttonDefaultSize();

// ---------------------------------------------------------------- 判据词汇

/** 原生就能聚焦、能点的标签。 */
const INTERACTIVE_TAGS = new Set(["button", "a", "input", "select", "textarea", "summary"]);
/** 用 role 宣称自己可交互的元素——宣称了就要按可交互的标准量。 */
const INTERACTIVE_ROLES = new Set([
  "button", "link", "tab", "menuitem", "menuitemcheckbox", "menuitemradio",
  "switch", "checkbox", "radio", "option", "slider",
]);
const HANDLER = /^on(?:Click|PointerDown|MouseDown|KeyDown|TouchStart)$/;
const PRIMITIVES = new Set(["Button", "IconButton"]);

/**
 * 从类名 token 里读出**写死的**高度（px）。读不出来就返回 `null`——
 * `h-full` / `h-auto` / `h-screen` 的实际高度要跑布局才知道，静态判据不猜。
 *
 * 摊平会把**互斥的分支**一起收进来（`SIZE_CLASS[size]` 这种查表，
 * 三档 `h-9`/`h-10`/`h-11` 会同时出现在 token 集里）。分支是「或」不是「与」，
 * 所以口径是：
 *   · 所有分支都 < 44 ⇒ 无论走哪条都不够，报最小的那个；
 *   · 有任何一条分支 ≥ 44 ⇒ **量不出来**，返回 `null`。
 *
 * 这条是被实测逼出来的：不加它，`src/ui/Button.tsx` 自己会被判红 36px——
 * 而它恰恰是本波唯一默认就合规的按钮实现。取最小值在这里是错的口径，
 * 不是「更严格」。
 */
function pinnedHeightPx(tokens) {
  const heights = new Set();
  for (const raw of tokens) {
    const token = raw.replace(/^(?:[\w-]+:)*/, ""); // 去掉 md: / hover: 这类变体前缀
    let match;
    if ((match = /^(?:h|size)-(\d+(?:\.\d+)?)$/.exec(token))) heights.add(Number(match[1]) * 4);
    else if ((match = /^(?:h|size)-\[(\d+(?:\.\d+)?)px\]$/.exec(token))) heights.add(Number(match[1]));
    else if ((match = /^(?:h|size)-\[(\d+(?:\.\d+)?)rem\]$/.exec(token))) heights.add(Number(match[1]) * 16);
    else if (token === "h-px") heights.add(1);
  }
  if (!heights.size) return null;
  const values = [...heights].filter(Number.isFinite);
  if (!values.length) return null;
  if (values.some((px) => px >= MIN_HIT_TARGET_PX)) return null;
  return Math.min(...values);
}

/** `min-h-*` 能把命中区托住，即便 `h-*` 写小了。 */
function pinnedMinHeightPx(tokens) {
  let largest = null;
  for (const raw of tokens) {
    const token = raw.replace(/^(?:[\w-]+:)*/, "");
    let match;
    let px = null;
    if ((match = /^min-h-(\d+(?:\.\d+)?)$/.exec(token))) px = Number(match[1]) * 4;
    else if ((match = /^min-h-\[(\d+(?:\.\d+)?)px\]$/.exec(token))) px = Number(match[1]);
    else if ((match = /^min-h-\[(\d+(?:\.\d+)?)rem\]$/.exec(token))) px = Number(match[1]) * 16;
    if (px !== null && (largest === null || px > largest)) largest = px;
  }
  return largest;
}

// ---------------------------------------------------------------- AST 工具

function eachNode(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => eachNode(child, visit));
}

function moduleConstants(sourceFile) {
  const table = new Map();
  eachNode(sourceFile, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      table.set(node.name.text, node.initializer);
    }
  });
  return table;
}

/** 与 `focus-ring-budget` 同一套摊平：跟进模块级类名常量，深度封顶、带访问集。 */
function classTokens(expression, constants, depth = 0, seen = new Set()) {
  const tokens = new Set();
  if (!expression || depth > 4) return tokens;
  const add = (text) => {
    for (const token of String(text).split(/\s+/)) if (token) tokens.add(token);
  };
  const walk = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) add(node.text);
    else if (ts.isIdentifier(node) && constants.has(node.text) && !seen.has(node.text)) {
      const next = new Set(seen).add(node.text);
      for (const token of classTokens(constants.get(node.text), constants, depth + 1, next)) {
        tokens.add(token);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(expression);
  return tokens;
}

const keyOf = (site) => `${site.file}::${site.tag}`;

function tally(sites) {
  const counts = new Map();
  for (const site of sites) counts.set(keyOf(site), (counts.get(keyOf(site)) || 0) + 1);
  return counts;
}

// ---------------------------------------------------------------- 扫描

const PREFILTER = /\b(?:h|size)-(?:\d|\[)|\bsize\s*=\s*["'{]|\bh-px\b/;

function scanSource(absolutePath, root = REPO) {
  const text = readFileSync(absolutePath, "utf8");
  if (!PREFILTER.test(text)) return [];

  const sourceFile = ts.createSourceFile(
    absolutePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  const constants = moduleConstants(sourceFile);
  const file = relative(root, absolutePath).split("\\").join("/");
  const sites = [];

  eachNode(sourceFile, (node) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) return;
    const tag = node.tagName.getText();

    let className = null;
    let role = null;
    let sizeProp = null;
    let hasHandler = false;
    for (const attribute of node.attributes.properties) {
      if (!ts.isJsxAttribute(attribute)) continue;
      const name = attribute.name.getText();
      if (HANDLER.test(name)) hasHandler = true;
      const value = attribute.initializer;
      if (name === "className" && value) {
        className = ts.isJsxExpression(value) ? value.expression : value;
      } else if (name === "role" && value && ts.isStringLiteral(value)) {
        role = value.text;
      } else if (name === "size" && value) {
        if (ts.isStringLiteral(value)) sizeProp = value.text;
        else if (ts.isJsxExpression(value) && value.expression && ts.isStringLiteral(value.expression)) {
          sizeProp = value.expression.text;
        }
      }
    }

    const tokens = className ? classTokens(className, constants) : new Set();
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const minHeight = pinnedMinHeightPx(tokens);
    const height = pinnedHeightPx(tokens);
    // `min-h-11` 把命中区托住了就不算欠账，即便 `h-*` 写得小。
    const heightOk = minHeight !== null && minHeight >= MIN_HIT_TARGET_PX;

    if (PRIMITIVES.has(tag)) {
      // 原语用法：`size` prop 说了算，没写就是默认档；`className` 里再写死一个
      // 小 `h-*` 也算破坏。默认档必须参与判定——否则改一行 BUTTON_DEFAULT_SIZE
      // 就能让全仓每一处 <Button> 悄悄缩水，而本锁一片绿。
      const effectiveSize = sizeProp ?? BUTTON_DEFAULT_SIZE;
      const declared = effectiveSize && BUTTON_SIZE_PX[effectiveSize] !== undefined
        ? BUTTON_SIZE_PX[effectiveSize]
        : null;
      const effective = height !== null && (declared === null || height < declared) ? height : declared;
      if (effective !== null && effective < MIN_HIT_TARGET_PX && !heightOk) {
        let detail;
        if (sizeProp) detail = `size="${sizeProp}"`;
        else if (height !== null && height === effective) detail = `className h=${height}px`;
        else detail = `默认档 ${BUTTON_DEFAULT_SIZE}`;
        sites.push({ file, line, tag, px: effective, kind: "primitive", detail });
      }
      return;
    }

    const interactive =
      INTERACTIVE_TAGS.has(tag) ||
      (role !== null && INTERACTIVE_ROLES.has(role)) ||
      (hasHandler && !/^[A-Z]/.test(tag));
    if (!interactive) return;
    // `<input type="hidden">` 之类不可见的不算；这里只按有没有写死高度判。
    if (height === null || height >= MIN_HIT_TARGET_PX || heightOk) return;
    sites.push({ file, line, tag, px: height, kind: "raw", detail: `h=${height}px` });
  });
  return sites;
}

function typeScriptFilesUnder(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) typeScriptFilesUnder(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function scanTree(dir, root = REPO) {
  const sites = [];
  for (const file of typeScriptFilesUnder(dir).sort()) sites.push(...scanSource(file, root));
  return sites;
}

// ---------------------------------------------------------------- 登记簿

function registrationProblem(entry) {
  if (!entry || typeof entry.file !== "string" || !entry.file) return "缺少 file 字段";
  if (typeof entry.reason !== "string") return "缺少 reason 字段";
  if (entry.reason.trim().length < 10) return "reason 少于 10 个字，等于没登记";
  return "";
}

/**
 * **判断**：这些文件是已登记的密集工具条，允许用 `size="sm"`(36) / `size="md"`(40)。
 *
 * 今天是空的，而且空得有理由：W04 迁的四件工作台 chrome **一件都没用 sm/md**，
 * 全是默认 `lg`(44)。任务书说「`sm` 只允许出现在已登记的密集工具条里」，
 * 今天的实测答案是「一条都还不需要」。
 *
 * 将来真要用（例如表格行内的密排按钮，44 会把行高撑到不可用），
 * 登记形状 `{ file, reason }`，理由必须写清**为什么这里 44 反而更糟**，
 * 而不是「这样好看」。
 */
const SM_ALLOWED_FILES = [];

/**
 * **欠账**：存量的小命中区点位，绝大多数落在别人的独占面上，
 * W04 按红线 §2.1 不许动。**只减不增。**
 *
 * 与焦点环那道锁同一套结构，理由也一样：几百行的逐条名单没有人会读，
 * 只会变成橡皮图章。真正挡住回归的是下面四条：
 *   · 总数只减不增（`PENDING_HIT_TARGET`）；
 *   · W04 迁过的四个文件 + 原语必须保持零（`W04_CLEARED_FILES`）；
 *   · 单个文件的点位数不许变多（`FILE_BUDGET`）；
 *   · `sm`/`md` 只许出现在 `SM_ALLOWED_FILES` 里。
 */
const PENDING_HIT_TARGET = 93;

/**
 * `_COMMON.md §7b⑪` / `W33 R5`：上面那个 93 是在**哪一棵树**上量的。
 *
 * `2227287`「W04 P4: 命中区预算锁（实测欠账 93 处 / 49 文件）」就是取值那一刻。
 * 共享工作树上随时挂着别人未提交的改动，在那儿量出来的棘轮标定的是一棵 git 里
 * 并不存在的树（`W30` / `W31` 都栽在这儿）。下面「基线自检」那条用例会把这个 commit
 * 的 `src/` 解出来**用同一套扫描器**重量一遍，对不上就红。
 *
 * ⚠️ 拧这个棘轮的时候，**两个一起改**：数字和这个 commit。
 */
const BASELINE_COMMIT = "2227287";

/**
 * W04 本轮负责的五个文件：**必须保持零**。
 * 任务书 P4 写死了「你迁的四个文件要从名单里消失」，这条就是那句话的机检。
 */
const W04_CLEARED_FILES = [
  "src/ui/Button.tsx",
  "src/shell/AdvancedStageControls.tsx",
  "src/shell/AdvancedWorkspaceActionBar.tsx",
  "src/shell/AppCapabilityBar.tsx",
  "src/shell/plugin-chrome/PluginChromeEditBarButton.tsx",
];

/**
 * 每个文件今天的点位数上限。只减不增。
 * `[实测]` W04 2026-08-31：**93 处，散在 49 个文件**。清空一个文件就把它整条删掉。
 *
 * 密度最高的五处是本波下一批该迁的：`SelectionInspectorPanel`(7)、
 * `DeckElementSelectionChrome`(7)、`LeoComposer`(6)、`PluginChromeFrame`(6)、
 * `cloud-browser-history-view`(5)。
 */
const FILE_BUDGET = new Map([
  ["src/pages/GeneralPage.tsx", 1],
  ["src/pages/MyDatabasePage.tsx", 1],
  ["src/pages/PageHeader.tsx", 1],
  ["src/shell/AdvancedStructuredEditors.tsx", 1],
  ["src/shell/AdvancedWorkbenchStage.tsx", 1],
  ["src/shell/AgentChat.tsx", 1],
  ["src/shell/AgentHiringPolicyPanel.tsx", 2],
  ["src/shell/AppDirectory.tsx", 1],
  ["src/shell/ArtifactLibrary.tsx", 3],
  ["src/shell/CloudBrowserPanel.tsx", 1],
  ["src/shell/FileLibrary.tsx", 1],
  ["src/shell/FunctionAgentChat.tsx", 2],
  ["src/shell/HumanHandoffDialog.tsx", 2],
  ["src/shell/HumanHandoffStatus.tsx", 2],
  ["src/shell/InlineAdvancedWorkbenchShell.tsx", 1],
  ["src/shell/InputCard.tsx", 1],
  ["src/shell/LeoAssistant.tsx", 2],
  ["src/shell/LeoComposer.tsx", 6],
  ["src/shell/LocalFileTree.tsx", 1],
  ["src/shell/MyAppsRail.tsx", 1],
  ["src/shell/MyLibrary.tsx", 2],
  ["src/shell/OperatorConsole.tsx", 1],
  ["src/shell/Playground.tsx", 1],
  ["src/shell/SelectionInspectorPanel.tsx", 7],
  ["src/shell/SplitWorkspace.tsx", 1],
  ["src/shell/TeamRosterModal.tsx", 3],
  ["src/shell/WorkspaceEntryCanvas.tsx", 1],
  ["src/shell/WorkspaceLibrary.tsx", 1],
  ["src/shell/cloud-browser-chrome.tsx", 2],
  ["src/shell/cloud-browser-history-view.tsx", 5],
  ["src/shell/doc-editors/DeckControls.tsx", 2],
  ["src/shell/doc-editors/DeckCreationPanels.tsx", 3],
  ["src/shell/doc-editors/DeckElementSelectionChrome.tsx", 7],
  ["src/shell/doc-editors/DeckSlideRail.tsx", 1],
  ["src/shell/doc-editors/DeckStage.tsx", 1],
  ["src/shell/doc-editors/GridStage.tsx", 1],
  ["src/shell/image-editor/FabricImageCreationPanels.tsx", 3],
  ["src/shell/media-editors/AudioWorkbenchView.tsx", 1],
  ["src/shell/media-editors/PdfControls.tsx", 1],
  ["src/shell/mobile-native-actions.tsx", 1],
  ["src/shell/plugin-chrome/PluginChromeFrame.tsx", 6],
  ["src/shell/plugin-theme.tsx", 1],
  ["src/shell/project-workspace.tsx", 2],
  ["src/shell/result-canvas-view.tsx", 1],
  ["src/shell/selection-inspector-host.tsx", 1],
  ["src/shell/share/ShareActionBar.tsx", 1],
  ["src/shell/vector-editor/VectorContextToolbar.tsx", 1],
  ["src/shell/video-editor/ClipInspector.tsx", 2],
  // W03 的面（`ui/index.tsx`）。W04 不许动，已写进 `signals/W04-request.md`。
  ["src/ui/index.tsx", 1],
]);

// ---------------------------------------------------------------- 用例

const srcSites = scanTree(SRC);
const fixtureSites = scanSource(FIXTURE);

test("原语的像素表读得到，且 lg 就是 44", () => {
  assert.deepEqual(BUTTON_SIZE_PX, { sm: 36, md: 40, lg: 44 }, "读不到或读错了 BUTTON_SIZE_PX");
  assert.equal(
    BUTTON_SIZE_PX.lg, MIN_HIT_TARGET_PX,
    "原语的 lg 与 EDIT_BAR_CONTROL_SIZE_PX 脱钩了：两套纪律又要开始漂移",
  );
  assert.equal(
    BUTTON_DEFAULT_SIZE, "lg",
    "默认档不再是 lg。这不只是原语自己的事：全仓每一处不写 size 的 <Button> 会一起缩水，"
      + "而调用点一个字都没改。「让对的事成为默认值」就是靠这一行立住的。",
  );
});

test("欠账只减不增：写死了小命中区的交互点位不得超过预算", () => {
  assert.ok(
    srcSites.length <= PENDING_HIT_TARGET,
    `实测 ${srcSites.length} 处，预算 ${PENDING_HIT_TARGET} 处。\n`
      + "预算只许改小，不许为了判绿改大（红线 4）。\n"
      + "修法：换成 <Button>/<IconButton> 默认档（44），布局撑不下就换排列，"
      + "不要把尺寸调回去。\n"
      + `头十处：\n${srcSites.slice(0, 10).map((s) => `  ${s.file}:${s.line} <${s.tag}> ${s.detail}`).join("\n")}`,
  );
});

test("不许内部对冲：单个文件的点位数不得超过它今天的数", () => {
  const perFile = new Map();
  for (const [key, count] of tally(srcSites)) {
    const file = key.split("::")[0];
    perFile.set(file, (perFile.get(file) || 0) + count);
  }
  const grown = [];
  for (const [file, count] of perFile) {
    const budget = FILE_BUDGET.get(file);
    if (budget === undefined) grown.push(`${file}：新文件冒出 ${count} 处，登记里没有它`);
    else if (count > budget) grown.push(`${file}：实测 ${count} 处，登记 ${budget} 处`);
  }
  assert.deepEqual(grown, [], "有文件的命中区欠账变多了");
});

test("W04 迁过的四件 chrome 与原语必须从名单里消失（任务书 P4 写死的那一条）", () => {
  const regressed = srcSites
    .filter((site) => W04_CLEARED_FILES.includes(site.file))
    .map((site) => `${site.file}:${site.line} <${site.tag}> ${site.detail}`);
  assert.deepEqual(
    regressed, [],
    "W04 迁过的工作台 chrome 里又出现了小于 44px 的命中区。"
      + "命中区变大导致条变宽变高是**预期的**（操作员要的就是不再挤），不要调回去。",
  );
});

test("基线自检：PENDING_HIT_TARGET 的 93 是在 BASELINE_COMMIT 那棵干净树上量出来的", () => {
  const measured = measureOnCommittedTree({
    repo: REPO,
    commit: BASELINE_COMMIT,
    pathspecs: ["src"],
    measure: (root) => {
      const sites = scanTree(join(root, "src"), root);
      return { total: sites.length, files: typeScriptFilesUnder(join(root, "src")).length };
    },
  });
  assert.ok(measured.ok, `拿不到干净树读数就判红，不许跳过（§7b⑩）：${measured.reason}`);
  // 正对照：解出来的得是一棵像样的树，别拿一棵空树凑过这一关。
  assert.ok(
    measured.value.files > 400,
    `${BASELINE_COMMIT} 的 src/ 只解出 ${measured.value.files} 份源码，这棵树不对`,
  );
  assert.equal(
    measured.value.total,
    PENDING_HIT_TARGET,
    `PENDING_HIT_TARGET 写的是 ${PENDING_HIT_TARGET}，但 ${BASELINE_COMMIT} 的`
      + `**干净检出**上用同一套扫描器实测 ${measured.value.total} 处。\n`
      + "两种可能：(a) 这个数是在脏工作树上量的——那就换一棵干净树重量；\n"
      + "(b) 棘轮已经拧过了但 BASELINE_COMMIT 没跟着换——两个要一起改。"
      + (dirtyAmong(REPO, ["src"]).length
        ? "\n（另：你这棵工作树的 src/ 是脏的，但这条自检读的是 commit，不受它影响）"
        : ""),
  );
});

test("sm / md 只许出现在已登记的密集工具条里", () => {
  const stray = srcSites
    .filter((site) => site.kind === "primitive" && site.detail.startsWith("size="))
    .filter((site) => !SM_ALLOWED_FILES.some((entry) => entry.file === site.file))
    .map((site) => `${site.file}:${site.line} ${site.detail}`);
  assert.deepEqual(
    stray, [],
    "有人在没登记的文件里用了 size=\"sm\"/\"md\"。比 44 小必须显式要，"
      + "而且只有登记在 SM_ALLOWED_FILES 里的密集工具条能要——"
      + "登记时要写清为什么这里 44 反而更糟，不是「这样好看」。",
  );
});

test("登记必须带得出 ≥10 字理由，空登记与敷衍登记不算", () => {
  for (const entry of SM_ALLOWED_FILES) {
    assert.equal(registrationProblem(entry), "", `${entry.file} 的登记不合格`);
  }
  assert.notEqual(registrationProblem({ file: "x" }), "");
  assert.notEqual(registrationProblem({ file: "x", reason: "太挤" }), "");
  assert.notEqual(registrationProblem({ reason: "行内密排，44 会把行高撑到不可用" }), "");
  assert.equal(registrationProblem({ file: "x", reason: "行内密排，44 会把行高撑到不可用" }), "");
});

test("白名单不许留假登记：登记的文件必须真的在用 sm/md", () => {
  const usingSmall = new Set(
    srcSites.filter((s) => s.kind === "primitive" && s.detail.startsWith("size=")).map((s) => s.file),
  );
  for (const entry of SM_ALLOWED_FILES) {
    assert.ok(
      usingSmall.has(entry.file),
      `${entry.file} 已经不用 sm/md 了，这条白名单是空占位，删掉它`,
    );
  }
});

test("判据器自证：高度换算与 min-h 托底都是对的", () => {
  // 零命中是最贵的一类断言（`_COMMON.md` §6）：先证明换算本身能命中。
  assert.equal(pinnedHeightPx(["h-8"]), 32);
  assert.equal(pinnedHeightPx(["h-7"]), 28);
  assert.equal(pinnedHeightPx(["h-9"]), 36);
  assert.equal(pinnedHeightPx(["h-11"]), null, "44 及以上不是欠账");
  assert.equal(pinnedHeightPx(["h-[36px]"]), 36);
  assert.equal(pinnedHeightPx(["h-[2.5rem]"]), 40);
  assert.equal(pinnedHeightPx(["size-8"]), 32);
  assert.equal(pinnedHeightPx(["md:h-8"]), 32, "变体前缀没被剥掉");
  assert.equal(pinnedHeightPx(["h-8", "h-6"]), 24, "分支全都不够时应取最小的那个");
  // 查表式的互斥分支（`SIZE_CLASS[size]` 摊平后的样子）：有一档合规就量不出来。
  assert.equal(
    pinnedHeightPx(["h-9", "h-10", "h-11"]), null,
    "互斥分支里有合规档时仍取最小值，会把 src/ui/Button.tsx 自己判红",
  );
  assert.equal(pinnedHeightPx(["h-1.5"]), 6, "range 滑块那一族");
  // 量不出来的一律返回 null —— 静态判据不猜布局结果。
  for (const token of ["h-full", "h-auto", "h-screen", "h-fit", "w-8", "leading-8"]) {
    assert.equal(pinnedHeightPx([token]), null, `${token} 不该被换算成高度`);
  }
  assert.equal(pinnedMinHeightPx(["min-h-11"]), 44);
  assert.equal(pinnedMinHeightPx(["min-h-[2.5rem]"]), 40);
  assert.equal(pinnedMinHeightPx(["h-8"]), null);
});

test("反面用例：fixture 里该红的红、该绿的绿", () => {
  const flagged = fixtureSites.map((site) => `${site.tag}:${site.px}`).sort();
  assert.deepEqual(
    flagged,
    ["Button:36", "a:32", "button:28", "div:32", "input:40"].sort(),
    `fixture 判红的点位不对（实测 ${JSON.stringify(flagged)}）：判据被改松或改严了。\n`
      + "该红五处：h-7 的 button、h-8 的链接、h-10 的 input、role=button 且 h-8 的 div、"
      + "size=\"sm\" 的原语。\n"
      + "该绿五处：h-11 的 button、默认档原语、min-h-11 托底的、没写高度的、"
      + "h-8 但不可交互的 span。",
  );
});
