#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import ts from "typescript";
import {
  validateDomainDependencyGraph,
} from "../src/architecture/domain-boundaries.ts";

const packageRoot = resolve(new URL("..", import.meta.url).pathname);
const sourceRoot = join(packageRoot, "src");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

const edges = [];
for (const file of sourceFiles(sourceRoot)) {
  const source = readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  for (const node of parsed.statements) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      edges.push({
        importer: relative(packageRoot, file),
        specifier: node.moduleSpecifier.text,
      });
    }
  }
}

const violations = validateDomainDependencyGraph(edges);
if (violations.length) {
  for (const violation of violations) {
    process.stderr.write(
      `${violation.importer}: ${violation.specifier}: ${violation.reason}\n`,
    );
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `domain boundaries ok (${edges.length} import/export edges)\n`,
  );
}
