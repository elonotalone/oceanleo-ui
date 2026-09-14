// S10 — docs/architecture/oceanleo-byok-sealed-cookie.md §3

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const SRC_ROOT = fileURLToPath(new URL("../src", import.meta.url));

function listSourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) listSourceFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function objectHasCredentialsInclude(node, sourceFile) {
  if (!node || !ts.isObjectLiteralExpression(node)) return false;
  return node.properties.some((prop) => {
    if (ts.isSpreadAssignment(prop) && ts.isIdentifier(prop.expression)) {
      return identifierResolvesToCredentialsInclude(prop.expression.text, sourceFile);
    }
    if (!ts.isPropertyAssignment(prop)) return false;
    const name = prop.name.getText(sourceFile).replace(/['"`]/g, "");
    if (name !== "credentials") return false;
    const value = prop.initializer.getText(sourceFile);
    return value.includes('"include"') || value.includes("'include'");
  });
}

function identifierResolvesToCredentialsInclude(name, sourceFile) {
  let found = false;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      if (objectHasCredentialsInclude(node.initializer, sourceFile)) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function secondArgHasCredentials(call, sourceFile) {
  const arg = call.arguments[1];
  if (!arg) return false;
  if (ts.isObjectLiteralExpression(arg)) {
    return objectHasCredentialsInclude(arg, sourceFile);
  }
  if (ts.isIdentifier(arg)) {
    return identifierResolvesToCredentialsInclude(arg.text, sourceFile);
  }
  return false;
}

function gatewayFetchCalls(filePath) {
  const text = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const hits = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "fetch" &&
      node.arguments.length > 0 &&
      node.arguments[0].getText(sourceFile).includes("GATEWAY_BASE")
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      hits.push({
        file: path.relative(path.dirname(SRC_ROOT), filePath),
        line: line + 1,
        ok: secondArgHasCredentials(node, sourceFile),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits;
}

test("S10 every GATEWAY_BASE fetch includes credentials", () => {
  // account.ts is owned by a concurrent unit (F1). Its `authed()` already
  // sends credentials; `publicGet()` is still theirs to finish.
  // account.ts is covered too: its `authed()` wrapper is the single fetch every
  // account/BYOK call goes through, so it must carry the cookie as well.
  const hits = listSourceFiles(SRC_ROOT).flatMap(gatewayFetchCalls);
  assert.ok(hits.length > 0, "expected at least one GATEWAY_BASE fetch()");
  const missing = hits.filter((hit) => !hit.ok);
  assert.deepEqual(
    missing,
    [],
    missing
      .map((hit) => `${hit.file}:${hit.line} missing credentials: "include"`)
      .join("\n"),
  );
});
