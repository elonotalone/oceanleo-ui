/** Follow editor symbols into request helpers and inspect their AST call sites. */
import ts from 'typescript';
import {existsSync, readdirSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';

const TRANSPORT = /(?:^|\.)(?:fetch|fetcher|fetchImpl|authed|request|artifactRequest|requestArtifactEditCapability|collabFetch|imFetch|libraryRequest|postConvert|postJson|getJson|putJson|deleteJson|xhrUpload|uploadWithProgress|viaFetch|bayGet|bayPost|bayPut|bayPatch|bayDelete)$/;

export function scanEditorGatewayRequests(root, {fixture} = {}) {
  const shell = join(root, 'src/shell');
  const entries = readdirSync(join(shell, 'advanced-routes')).filter(f => /\.[cm]?[jt]sx?$/.test(f)).map(f => join(shell, 'advanced-routes', f));
  entries.push(...['works-workbench/WorkWorkbenchRoute.tsx', 'workbench-material-provider.tsx', 'WorkspaceSession.tsx'].map(f => join(shell, f)));
  const fixturePath = join(shell, 'editor-host-contract/__scan_fixture__.tsx');
  if (fixture) entries.push(fixturePath);
  const options = {allowJs: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, noLib: true, types: [], skipLibCheck: true};
  const host = ts.createCompilerHost(options);
  // Only local symbols matter. Vendor type declarations add no route evidence.
  host.resolveModuleNames = (names, containing) => names.map(name => {
    if (!name.startsWith('.')) return undefined;
    const base = resolve(dirname(containing), name);
    const file = [base, ...['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'].map(ext => base + ext)].find(p => existsSync(p) && /\.[cm]?[jt]sx?$/.test(p));
    return file ? {resolvedFileName: file, extension: file.endsWith('.tsx') ? ts.Extension.Tsx : ts.Extension.Ts} : undefined;
  });
  const originalRead = host.readFile.bind(host);
  host.readFile = file => file === fixturePath && fixture ? fixture : originalRead(file);
  const originalExists = host.fileExists.bind(host);
  host.fileExists = file => file === fixturePath && !!fixture || originalExists(file);
  const program = ts.createProgram(entries, options, host);
  const checker = program.getTypeChecker();
  const visited = new Set(), files = new Set(), calls = new Set(), requests = new Map();
  function declarations(node) {
    let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node) ? node.name : node);
    if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol?.declarations || [];
  }
  // The native host supplies these outer application surfaces. The editor mounts
  // their context hooks, not their navigation/account/chat pages. Do not grant
  // those pages' APIs to a local editor simply because a context lives with them.
  const HOST_SURFACES = /\/shell\/(?:SplitWorkspace|AgentChat|WorkspaceLibrary|MyLibrary|AssetActions|SiteCatalogConsole)[^/]*\.[jt]sx?$|\/shell\/(?:asset-detail|bay|messages|cloud-computer)\/|\/lib\/agent\.ts$/;
  const internal = node => node.getSourceFile().fileName.startsWith(join(root, 'src') + '/') &&
    !/\/i18n\/|\/lib\/auth\/|\/lib\/telemetry\//.test(node.getSourceFile().fileName) && !HOST_SURFACES.test(node.getSourceFile().fileName);
  function fnOf(node) {
    if (ts.isFunctionLike(node) && node.body) return node;
    if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) return node.initializer;
    return null;
  }
  // URL evaluation is deliberately symbolic: unknown ids become one segment.
  // It follows constants and small URL-building functions, never arbitrary code.
  function strings(node, active = new Set()) {
    if (!node || active.has(node) || active.size > 12) return ['*'];
    const next = new Set(active).add(node);
    if (ts.isStringLiteralLike(node)) return [node.text];
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isAwaitExpression(node) || ts.isNonNullExpression(node)) return strings(node.expression, next);
    if (ts.isTemplateExpression(node)) {
      let out = [node.head.text];
      for (const span of node.templateSpans) out = out.flatMap(a => strings(span.expression, next).map(b => a + b + span.literal.text)).slice(0, 32);
      return out;
    }
    if (ts.isConditionalExpression(node)) return [...strings(node.whenTrue, next), ...strings(node.whenFalse, next)];
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
      return strings(node.left, next).flatMap(a => strings(node.right, next).map(b => a + b)).slice(0, 32);
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      if (/^GATEWAY_(BASE|URL)$/.test(node.getText())) return [''];
      for (const d of declarations(node)) {
        if (d.initializer) return strings(d.initializer, next);
        if (d.type && ts.isUnionTypeNode(d.type)) {
          const literals = d.type.types.filter(ts.isLiteralTypeNode).filter(t => ts.isStringLiteral(t.literal)).map(t => t.literal.text);
          if (literals.length) return literals;
        }
      }
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText();
      if (/gatewayBase$/.test(name)) return [''];
      if (/^(String|encodeURIComponent)$/.test(name)) return strings(node.arguments[0], next);
      if (ts.isPropertyAccessExpression(node.expression) && /^(replace|replaceAll|toString)$/.test(node.expression.name.text)) return strings(node.expression.expression, next);
      for (const d of declarations(node.expression)) {
        const fn = fnOf(d);
        if (!fn?.body || !fn.body.getText().includes('/v1/')) continue;
        const out = [];
        const returns = n => {
          if (ts.isReturnStatement(n) && n.expression) out.push(...strings(n.expression, next));
          else if (!ts.isFunctionLike(n) || n === fn) ts.forEachChild(n, returns);
        };
        if (!ts.isBlock(fn.body)) out.push(...strings(fn.body, next)); else returns(fn.body);
        if (out.some(v => v.includes('/v1/'))) return out.slice(0, 32);
      }
    }
    if (ts.isNewExpression(node) && node.expression.getText() === 'URL') return strings(node.arguments?.[0], next);
    return ['*'];
  }
  function methodProperty(node, active = new Set()) {
    if (!node || active.has(node) || active.size > 8) return undefined;
    const next = new Set(active).add(node);
    if (ts.isCallExpression(node) && node.expression.getText() === 'jsonMutation') return strings(node.arguments[0]);
    if (ts.isObjectLiteralExpression(node)) for (const p of [...node.properties].reverse()) {
      if (ts.isPropertyAssignment(p) && p.name.getText().replace(/["']/g, '') === 'method') return strings(p.initializer);
      if (ts.isSpreadAssignment(p)) { const value = methodProperty(p.expression, next); if (value) return value; }
    }
    if (ts.isIdentifier(node)) for (const d of declarations(node)) if (d.initializer) return methodProperty(d.initializer, next);
    return undefined;
  }
  const helperCache = new Map();
  function isHelper(node, active = new Set()) {
    if (!node || active.has(node) || active.size > 5 || !internal(node)) return false;
    if (helperCache.has(node)) return helperCache.get(node);
    const next = new Set(active).add(node);
    let found = false;
    const search = n => {
      if (found) return;
      if (ts.isCallExpression(n)) {
        if (TRANSPORT.test(n.expression.getText()) || declarations(n.expression).some(d => isHelper(fnOf(d), next))) {found = true; return;}
      }
      ts.forEachChild(n, search);
    };
    search(node.body || node);
    helperCache.set(node, found);
    return found;
  }
  function helperMethod(node) {
    const methods = new Set();
    const walk = n => {
      if (ts.isCallExpression(n) && TRANSPORT.test(n.expression.getText()))
        for (const m of methodProperty(n.arguments[1]) || []) if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(m)) methods.add(m);
      ts.forEachChild(n, walk);
    };
    if (node?.body) walk(node.body);
    return methods.size === 1 ? [...methods] : undefined;
  }
  function inspect(call) {
    const name = call.expression.getText();
    const website = /(?:^|\.)(websiteRequest|websiteResponse)$/.test(name);
    const session = /(?:^|\.)sessionRequest$/.test(name);
    const cn = /\/cn-hosting-api\.ts$/.test(call.getSourceFile().fileName) && name === 'request';
    if (/\/app-session\.ts$/.test(call.getSourceFile().fileName) && name === 'authed') return;
    const workingCopy = /\/editor-working-copy\.ts$/.test(call.getSourceFile().fileName) && name === 'request';
    const xhr = /\.open$/.test(name);
    const helpers = declarations(call.expression).map(fnOf).filter(Boolean);
    if (!TRANSPORT.test(name) && !website && !session && !xhr && !helpers.some(h => isHelper(h))) return;
    let paths = strings(call.arguments[xhr ? 1 : website ? 1 : 0]);
    if (website) paths = paths.map(p => '/v1/website-projects/*' + p);
    if (cn) paths = strings(call.arguments[1]).map(p => '/v1/website-projects/*/hosting/aliyun/' + p);
    if (session) paths = paths.map(p => '/v1/agent/sessions' + p);
    if (workingCopy) paths = (call.arguments[2] ? strings(call.arguments[2]) : ['']).map(p => '/v1/editor-working-copies/*' + p);
    const init = call.arguments[website ? 2 : 1];
    let methods = cn ? call.arguments[2] ? strings(call.arguments[2]) : ['GET'] : workingCopy ? strings(call.arguments[0]) : xhr ? strings(call.arguments[0]) : methodProperty(init);
    if (!methods && init && ts.isStringLiteral(init) && /^(GET|POST|PUT|PATCH|DELETE)$/.test(init.text)) methods = [init.text];
    if (!methods && /libraryRequest/.test(name)) methods = [init && init.getText() !== 'undefined' ? 'POST' : 'GET'];
    if (!methods) methods = helpers.map(helperMethod).find(Boolean);
    if (!methods) methods = [/post|upload|Convert/i.test(name) ? 'POST' : /(?:^|\.)(?:put|bayPut)/i.test(name) ? 'PUT' : /(?:^|\.)(?:patch|bayPatch)/i.test(name) ? 'PATCH' : /(?:^|\.)(?:delete|bayDelete)/i.test(name) ? 'DELETE' : 'GET'];
    if (methods.every(m => m === '*')) return;
    for (const raw of paths) {
      const at = raw.indexOf('/v1/');
      if (at < 0) continue;
      const path = raw.slice(at).split('?')[0];
      for (const method of methods.filter(m => /^(GET|HEAD|POST|PUT|PATCH|DELETE)$/.test(m))) {
        const item = {method, path, file: relative(root, call.getSourceFile().fileName), line: call.getSourceFile().getLineAndCharacterOfPosition(call.getStart()).line + 1};
        requests.set(`${method} ${path} ${item.file}:${item.line}`, item);
      }
    }
  }
  function visit(node) {
    if (!node || visited.has(node) || !internal(node) || ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    visited.add(node);
    files.add(relative(root, node.getSourceFile().fileName));
    if (ts.isCallExpression(node)) {
      calls.add(node);
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
        const base = resolve(dirname(node.getSourceFile().fileName), node.arguments[0].text);
        const imported = ['', '.tsx', '.ts', '.mjs', '/index.ts'].map(ext => program.getSourceFile(base + ext)).find(Boolean);
        if (imported) for (const statement of imported.statements) visit(statement);
      }
      for (const d of declarations(node.expression)) visit(fnOf(d));
    }
    if (ts.isIdentifier(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node))
      for (const d of declarations(node)) {
        if (d === node.parent) continue;
        if (fnOf(d)) visit(fnOf(d)); else if (d.initializer) visit(d.initializer);
      }
    ts.forEachChild(node, n => { if (!ts.isFunctionDeclaration(n)) visit(n); });
  }
  for (const entry of entries) {
    const sf = program.getSourceFile(entry);
    if (sf) for (const statement of sf.statements) visit(statement);
  }
  for (const call of calls) inspect(call);
  return {requests: [...requests.values()], files: [...files].sort()};
}
