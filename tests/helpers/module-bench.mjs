// ============================================================================
// `data:` 编译台 —— 把一份 `src/` 源码编成能 `import()` 的模块，替身按需给
// ----------------------------------------------------------------------------
// 为什么要有这份共享 helper（W28，2026-08-05）
//
// 仓里有 44 份测试把被测源码编成 `data:` URL 再 `import()`。`data:` 模块没有路径
// 身份，**留在产物里的任何相对 specifier 在运行期都会炸成
// `ERR_UNSUPPORTED_RESOLVE_REQUEST`**。以前每份测试各自手工维护一张「要替换哪些
// 模块」的清单，于是被测文件每多一个 import，那张清单就漏一条边，
// **整份测试文件一条断言都不执行**。
//
// 这个坑本波复发四次，全在 `src/shell/doc-editors/use-grid-editor.ts` 上：
//   1. W19 加 `saveTargetForItem` 等四个 import → 打哑 `rendition-callback-identity`
//      （W22 `3946fa9` 补清单）；
//   2. W24 前任加 `plugin-export/ledger-export` → 再打哑它和 `plugin-instance-save-entry`
//      （W26 报出、W24 补清单）；
//   3. W24 加导出入口 → 同样两份再哑一次（`e399304` 又补三行）。
// 每一次的修法都是「把漏掉的那条边补进清单」，也就是每一次都在等下一次。
// 危险不只是红：**「整份不执行」在计数上只表现为一条失败**，很容易被当成普通红放过。
//
// 所以这里换掉判据本身：**不再维护清单**。源码里所有相对 specifier 一律自动解析成
// 真模块（能被 node 直接加载的挂 `file://`，`.tsx` 这类加载不进来的就地编译），
// 裸包名一律解析成安装位置，**只有真的需要替身的（网络、Supabase、浏览器 API、
// 要断言调用次数的协作者）才由调用方显式列出**。被编译的文件之后再加多少 import
// 都不会把测试打哑。
//
// 用法（一行）：
//
//     import { compileModule, dataModule } from "./helpers/module-bench.mjs";
//
//     const { searchArtifactLibrary } = await import(
//       await compileModule("src/shell/artifact-client.ts", {
//         "../lib/auth/client": dataModule(`export async function accessToken(){return "t";}`),
//       })
//     );
//
// 桩用对象传，key 写成**被编译文件里那条 import 的原文**（相对的按导入方目录解析，
// 所以图里别的文件用另一条相对路径引到同一份文件时也会认）。
//
// 解析失败时报的是**哪个 specifier、在哪份文件里、试过哪些候选、这份文件是被谁拉进来的**
// —— 不是一个 280 KB 的 data URL base（node 原生报错就是那样，读不出是谁漏了）。
// ============================================================================

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const requireFromRepo = createRequire(resolve(REPO, "package.json"));

/** node 自己就能加载的扩展名。`.tsx` 不在其中（类型剥离不认 JSX），必须就地编译。 */
const NATIVE_EXTENSIONS = [".ts", ".mts", ".mjs", ".js", ".cjs"];
/** 相对 specifier 的候选顺序，与 `tests/ts-extension-loader.mjs` 同源。 */
const CANDIDATE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  "/index.ts",
  "/index.tsx",
  "/index.mjs",
  "/index.js",
];

const TRANSPILE_OPTIONS = {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
};

/** 一段 JS 源码 → 可 `import()` 的 `data:` 模块。桩就是拿它造的。 */
export function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

/**
 * 编译产物落成**临时真文件**，用 `file://` 引用，不把依赖的 URL 内联进导入者的源码。
 *
 * 内联在菱形依赖上是指数级的：素材库那一族里 view / effects / presentation 各自都拉
 * controller 与 template-source，每多一层 base64 再放大 4/3，`explore-sections`
 * 实测 `ExplorePage` 一个模块的 URL 就长到 197 MB，整份测试被 OOM killer 杀掉。
 * 落成文件后每个依赖只是一段短路径，体积不再叠加，栈回溯里也看得见是哪份模块。
 */
let scratchDir = null;
let scratchSeq = 0;

function scratchModule(sourceFile, code) {
  if (!scratchDir) {
    scratchDir = mkdtempSync(join(tmpdir(), "oceanleo-module-bench-"));
    process.on("exit", () => rmSync(scratchDir, { recursive: true, force: true }));
  }
  scratchSeq += 1;
  const name = `${String(scratchSeq).padStart(4, "0")}-${basename(sourceFile).replace(
    /\.tsx?$/,
    "",
  )}.mjs`;
  const target = join(scratchDir, name);
  writeFileSync(target, code, "utf8");
  return pathToFileURL(target).href;
}

/** 仓内路径 → `file://` URL。要把某个 specifier 钉死到真模块时用。 */
export function realModule(path) {
  return pathToFileURL(absolute(path)).href;
}

function absolute(path) {
  return isAbsolute(path) ? path : resolve(REPO, path);
}

function repoRelative(path) {
  const rel = relative(REPO, path);
  return rel.startsWith("..") ? path : rel;
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function nativelyLoadable(path) {
  return NATIVE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

/** 相对 specifier → 仓内绝对路径；解析不到给 `null`（报错由调用方带上下文抛）。 */
function resolveRelativeSpecifier(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (isFile(candidate)) return candidate;
  }
  return null;
}

function candidatesFor(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  return CANDIDATE_SUFFIXES.map((suffix) => repoRelative(`${base}${suffix}`));
}

/**
 * 一份源码里所有**值** import / export 的 module specifier。
 * `import type` 与纯类型的具名导入会在 transpile 时被抹掉，不该影响图的判定。
 * 动态 `import()` **不算**：它在运行期才解析，不会在加载时把整份测试打哑，
 * 而顺着它编下去会把 `AdvancedContentWorkbench` 那一排懒加载路由全拖进来。
 */
function staticSpecifiers(path, text) {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.isTypeOnly) continue;
      found.push(statement.moduleSpecifier.text);
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      if (statement.isTypeOnly) continue;
      found.push(statement.moduleSpecifier.text);
    }
  }
  return found;
}

/** 编译产物里所有静态 module specifier 的位置，供逐条改写。 */
function specifierNodesIn(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const nodes = [];
  for (const statement of source.statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      nodes.push(statement.moduleSpecifier);
    }
  }
  return nodes;
}

/** 编译产物里所有 `import("字面量")` 调用。整个调用一起改写，形参也要跟着换。 */
function dynamicImportsIn(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const calls = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      calls.push({ call: node, specifier: node.arguments[0].text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

class ModuleBenchError extends Error {
  constructor(message) {
    super(message);
    this.name = "ModuleBenchError";
  }
}

function chainText(chain) {
  return chain.length <= 1
    ? ""
    : `\n  引用链：${chain.map(repoRelative).join(" → ")}`;
}

/** 一套桩表对应一个上下文：桩表、依赖图判定、编译产物缓存、缺包策略。 */
let contextSeq = 0;

function createContext(stubs, options) {
  contextSeq += 1;
  return {
    id: `ctx-${contextSeq}`,
    stubs,
    stubsByPath: new Map(),
    missingPackageStub: options.missingPackageStub ?? null,
    entries: [],
    sources: new Map(),
    outputs: new Map(),
    dependents: new Map(),
    walked: new Set(),
    forced: new Set(),
    compiling: new Set(),
  };
}

/** 相对写法的桩 key 按入口目录解析一次，图里别处用另一条相对路径引到它时也认得出。 */
function registerEntry(ctx, entry) {
  if (ctx.entries.includes(entry)) return;
  ctx.entries.push(entry);
  for (const [specifier, replacement] of Object.entries(ctx.stubs)) {
    if (!specifier.startsWith(".")) continue;
    const target = resolveRelativeSpecifier(entry, specifier);
    if (target) ctx.stubsByPath.set(target, replacement);
  }
  analyzeGraph(ctx, entry);
  // 入口自己被打了桩就必须编译——桩只有在编译产物里才换得进去。
  if (
    staticSpecifiers(entry, sourceOf(ctx, entry)).some(
      (specifier) => stubFor(ctx, entry, specifier) !== undefined,
    ) ||
    dynamicImportsIn(entry, sourceOf(ctx, entry)).some(
      ({ specifier }) => stubFor(ctx, entry, specifier) !== undefined,
    )
  ) {
    ctx.forced.add(entry);
  }
  propagate(ctx);
}

function sourceOf(ctx, file) {
  let text = ctx.sources.get(file);
  if (text === undefined) {
    text = readFileSync(file, "utf8");
    ctx.sources.set(file, text);
  }
  return text;
}

/**
 * 这个 specifier 在这份文件里有没有替身。
 * 先认原文（历史写法就是按原文匹配的），再认「解析到同一份文件」——
 * 图里别的文件用另一条相对路径引到同一个模块时也该换成同一个替身。
 */
function stubFor(ctx, file, specifier) {
  if (Object.hasOwn(ctx.stubs, specifier)) return ctx.stubs[specifier];
  if (!specifier.startsWith(".")) return undefined;
  const target = resolveRelativeSpecifier(file, specifier);
  if (target && ctx.stubsByPath.has(target)) return ctx.stubsByPath.get(target);
  return undefined;
}

/**
 * 从入口把静态依赖图铺一遍，判定每份文件「必须就地编译」还是「可以挂 `file://`
 * 让 node 真加载」。三种情况必须编译：扩展名 node 加载不了（`.tsx`）、
 * 自己的某个 import 被打了桩（桩得进得去）、依赖里有必须编译的文件
 * （真加载它会顺着相对路径炸掉）。第三条靠反向传播到不动点，因此环不成问题。
 *
 * 能真加载的一律真加载：测试里直接 import 的真模块与被编译文件拿到的是**同一份实例**，
 * 身份比较、模块级状态都不会分叉。
 */
function analyzeGraph(ctx, entry) {
  const queue = [entry];
  const seen = new Set([entry]);

  while (queue.length) {
    const file = queue.shift();
    if (ctx.walked.has(file)) continue;
    ctx.walked.add(file);
    if (!nativelyLoadable(file)) ctx.forced.add(file);
    for (const specifier of staticSpecifiers(file, sourceOf(ctx, file))) {
      // 打了桩的边不要走进真模块：否则图会把被替身挡住的整棵子树编进来，
      // 运行期入口虽走桩，模块级缓存（素材库检索之类）却与真实现串台——
      // `explore-scene-axis` 在 2a75fba 之后两条 D5 空态断言就是这样假红的。
      if (stubFor(ctx, file, specifier) !== undefined) {
        ctx.forced.add(file); // 桩只有在这份文件被编译时才进得去
        continue;
      }
      if (!specifier.startsWith(".")) continue;
      const target = resolveRelativeSpecifier(file, specifier);
      if (!target) {
        ctx.forced.add(file); // 解析不到：走编译路径，那里会点名报出来
        continue;
      }
      if (!ctx.dependents.has(target)) ctx.dependents.set(target, new Set());
      ctx.dependents.get(target).add(file);
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
}

/** 必须编译的会往上传染：真加载一个导入了编译产物的模块，那条相对路径会当场炸掉。 */
function propagate(ctx) {
  const pending = [...ctx.forced];
  while (pending.length) {
    const file = pending.pop();
    for (const importer of ctx.dependents.get(file) ?? []) {
      if (ctx.forced.has(importer)) continue;
      ctx.forced.add(importer);
      pending.push(importer);
    }
  }
}

function mustCompile(ctx, file) {
  // 图外的文件（桩里指过来的真模块之类）保守按「能加载就加载」处理。
  return ctx.forced.has(file) || (!ctx.walked.has(file) && !nativelyLoadable(file));
}

function packageUrl(ctx, file, specifier, chain) {
  try {
    return pathToFileURL(requireFromRepo.resolve(specifier)).href;
  } catch {
    if (ctx.missingPackageStub) return ctx.missingPackageStub;
    throw new ModuleBenchError(
      `${repoRelative(file)} 里的 import "${specifier}" 装不出来：` +
        `node_modules 里解析不到这个包，而 data: 模块没有包作用域、裸名一律进不去。` +
        `\n  要么把它装上，要么在桩表里给 "${specifier}" 一个替身。` +
        chainText(chain),
    );
  }
}

async function compileFile(ctx, file, chain) {
  const cached = ctx.outputs.get(file);
  if (cached) return cached;
  if (ctx.compiling.has(file)) {
    throw new ModuleBenchError(
      `${repoRelative(file)} 处在一个循环依赖里，而 data: 模块表达不了环。` +
        `\n  把环上任意一份在桩表里换成替身即可。` +
        chainText([...chain, file]),
    );
  }
  ctx.compiling.add(file);

  const output = ts.transpileModule(sourceOf(ctx, file), {
    compilerOptions: TRANSPILE_OPTIONS,
    fileName: file,
  }).outputText;

  const edits = [];
  for (const node of specifierNodesIn(file, output)) {
    const specifier = node.text;
    const stub = stubFor(ctx, file, specifier);
    let replacement = stub;
    if (replacement === undefined) {
      if (specifier.startsWith(".")) {
        const target = resolveRelativeSpecifier(file, specifier);
        if (!target) {
          throw new ModuleBenchError(
            `${repoRelative(file)} 里的 import "${specifier}" 解析不到任何文件。` +
              `\n  试过：${candidatesFor(file, specifier).join("、")}` +
              chainText([...chain, file]),
          );
        }
        replacement = mustCompile(ctx, target)
          ? await compileFile(ctx, target, [...chain, file])
          : pathToFileURL(target).href;
      } else {
        replacement = packageUrl(ctx, file, specifier, [...chain, file]);
      }
    }
    edits.push({
      start: node.getStart(),
      end: node.getEnd(),
      text: JSON.stringify(replacement),
    });
  }

  // 动态 `import()`：懒加载路由、`await import("pptx-preview")` 这类。
  // 编译产物没有仓里的路径身份，裸包名与相对路径在运行期都解析不了，桩也就进不去
  // （`library-ppt-preview-adapter` 实测：`import("pptx-preview")` 漏改之后
  // 走进了 catch 分支，断言看到的是降级态而不是真解析出来的幻灯片）。
  // 需要就地编译的那些不在这里编：懒加载路由整棵拖进来太贵，改成运行期真按到了才编。
  let needsLazyRuntime = false;
  for (const { call, specifier } of dynamicImportsIn(file, output)) {
    const stub = stubFor(ctx, file, specifier);
    let text = null;
    if (stub !== undefined) {
      text = `import(${JSON.stringify(stub)})`;
    } else if (!specifier.startsWith(".")) {
      text = `import(${JSON.stringify(packageUrl(ctx, file, specifier, [...chain, file]))})`;
    } else {
      const target = resolveRelativeSpecifier(file, specifier);
      if (!target) continue; // 动态 import 解析不到不该拖垮加载，运行期自己报
      if (mustCompile(ctx, target)) {
        needsLazyRuntime = true;
        text = `__benchImport(${JSON.stringify(ctx.id)}, ${JSON.stringify(target)})`;
      } else {
        text = `import(${JSON.stringify(pathToFileURL(target).href)})`;
      }
    }
    edits.push({ start: call.getStart(), end: call.getEnd(), text });
  }

  edits.sort((a, b) => a.start - b.start);
  let rewritten = output;
  for (const edit of edits.reverse()) {
    rewritten = rewritten.slice(0, edit.start) + edit.text + rewritten.slice(edit.end);
  }
  if (needsLazyRuntime) {
    rewritten = `import { __benchImport } from ${JSON.stringify(
      pathToFileURL(fileURLToPath(import.meta.url)).href,
    )};\n${rewritten}`;
  }

  const leftover = specifierNodesIn(file, rewritten)
    .map((node) => node.text)
    .filter((specifier) => !/^[a-z][a-z0-9+.-]*:/i.test(specifier));
  if (leftover.length) {
    throw new ModuleBenchError(
      `${repoRelative(file)} 编完之后还留着解析不了的 specifier：` +
        `${[...new Set(leftover)].sort().join("、")}` +
        chainText([...chain, file]),
    );
  }

  const url = scratchModule(file, rewritten);
  ctx.compiling.delete(file);
  ctx.outputs.set(file, url);
  return url;
}

/**
 * 把一份源码编成可 `import()` 的模块 URL。
 *
 * @param {string} entryPath 仓内路径，例如 `"src/shell/artifact-client.ts"`。
 * @param {Record<string, string>} stubs 显式替身：key 是 import 原文，
 *   value 是模块 URL（`dataModule()` 造的桩，或 `realModule()` 指的真文件）。
 *   **不用列全**：没列的相对 import 会自动解析到真模块。
 * @param {{ missingPackageStub?: string }} options
 *   `missingPackageStub`：装不出来的第三方包用它顶（不给就报错点名）。
 * @returns {Promise<string>} 可直接 `await import()` 的 URL。
 */
export async function compileModule(entryPath, stubs = {}, options = {}) {
  const file = absolute(entryPath);
  if (!existsSync(file)) {
    throw new ModuleBenchError(
      `编译台拿到的入口 ${repoRelative(file)} 不存在（路径相对仓根 ${REPO}）`,
    );
  }
  const ctx = contextFor(stubs, options);
  registerEntry(ctx, file);
  // 入口自己也能被 node 直接加载时就别编：测试拿到的与图里链过去的是同一份实例。
  return mustCompile(ctx, file)
    ? compileFile(ctx, file, [])
    : pathToFileURL(file).href;
}

/**
 * 桩表一样的多次调用共用同一个上下文，因而共用同一份编译产物。
 * 这不是省时间：一份测试常常先编入口、再单独编图里的某个模块去取它的登记函数
 * （`explore-sections` 就是先编 `ExplorePage.tsx` 再编 `material-scene-axis.ts`），
 * 两次各编一份的话模块级状态会分叉，注册进去的东西在另一份里查不到。
 * 桩表不同则必须分开——那本来就是「换一套替身再看一遍」的意思。
 */
const contexts = new Map();
const contextsById = new Map();

function contextFor(stubs, options) {
  const key = JSON.stringify([
    Object.entries(stubs).sort(([a], [b]) => (a < b ? -1 : 1)),
    options.missingPackageStub ?? null,
  ]);
  let ctx = contexts.get(key);
  if (!ctx) {
    ctx = createContext(stubs, options);
    contexts.set(key, ctx);
    contextsById.set(ctx.id, ctx);
  }
  return ctx;
}

/**
 * 编译产物里那些「必须编译才加载得了」的动态 `import()` 的落点。
 * 真被 `await` 到时才编译，懒加载路由因此不会在建台时整棵拖进来。
 * 只给编译产物用，测试不该直接调它。
 */
export async function __benchImport(contextId, file) {
  const ctx = contextsById.get(contextId);
  if (!ctx) {
    throw new ModuleBenchError(
      `动态 import 找不到编译上下文 ${contextId}（${repoRelative(file)}）`,
    );
  }
  return import(await compileFile(ctx, file, []));
}

/**
 * 少数测试要的是「编出来的源码文本」而不是可 import 的 URL
 * （例如只想断言产物里有没有某个调用）。桩与解析口径与 `compileModule()` 一致。
 */
export function transpileOnly(entryPath) {
  const file = absolute(entryPath);
  return ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: TRANSPILE_OPTIONS,
    fileName: file,
  }).outputText;
}
