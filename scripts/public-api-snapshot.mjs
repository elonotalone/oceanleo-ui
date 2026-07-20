#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import process from "node:process";
import ts from "typescript";

const packageRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const packageJsonPath = resolve(packageRoot, "package.json");
const snapshotPath = resolve(
  packageRoot,
  "src/architecture/public-api.snapshot.json",
);

function exportedDeclarations(sourceFile) {
  const declarations = [];
  for (const node of sourceFile.statements) {
    if (ts.isExportDeclaration(node)) {
      const source = node.moduleSpecifier?.text || "";
      if (!node.exportClause) {
        declarations.push({ kind: "star", source });
      } else if (ts.isNamespaceExport(node.exportClause)) {
        declarations.push({
          kind: "namespace",
          name: node.exportClause.name.text,
          source,
        });
      } else {
        for (const element of node.exportClause.elements) {
          declarations.push({
            kind: element.isTypeOnly ? "type" : "named",
            name: element.name.text,
            importedName: element.propertyName?.text || element.name.text,
            source,
          });
        }
      }
      continue;
    }
    if (ts.isExportAssignment(node)) {
      declarations.push({ kind: "default" });
      continue;
    }
    if (
      !node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    ) {
      continue;
    }
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      if (node.name) {
        declarations.push({
          kind:
            ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
              ? "type"
              : "named",
          name: node.name.text,
          source: "",
        });
      }
    } else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          declarations.push({
            kind: "named",
            name: declaration.name.text,
            source: "",
          });
        }
      }
    }
  }
  return declarations.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function buildSnapshot() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const packageExports = Object.fromEntries(
    Object.entries(packageJson.exports).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  const entrypoints = {};
  for (const [specifier, target] of Object.entries(packageExports)) {
    if (typeof target !== "string" || ![".ts", ".tsx"].includes(extname(target))) {
      continue;
    }
    const file = resolve(packageRoot, target);
    const source = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      target.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    entrypoints[specifier] = {
      target,
      declarations: exportedDeclarations(sourceFile),
    };
  }
  return {
    schema: "oceanleo.public-api.v1",
    package: packageJson.name,
    packageExports,
    entrypoints,
  };
}

const generated = `${JSON.stringify(buildSnapshot(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = readFileSync(snapshotPath, "utf8");
  if (current !== generated) {
    process.stderr.write(
      "Public API snapshot is stale. Run `npm run api:snapshot`.\n",
    );
    process.exitCode = 1;
  }
} else {
  writeFileSync(snapshotPath, generated);
  process.stdout.write(`wrote ${snapshotPath}\n`);
}
