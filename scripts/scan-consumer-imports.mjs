#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const tsvPath = resolve(
  args.find((value) => value.endsWith(".tsv")) ||
    "/opt/cursor-workspaces/oceandino/scripts/oceanleo-sites.tsv",
);
const writeIndex = args.indexOf("--write");
const summaryOnly = args.includes("--summary");
const checkExports = args.includes("--check-exports");
const outputPath =
  writeIndex >= 0 && args[writeIndex + 1]
    ? resolve(args[writeIndex + 1])
    : "";

const rows = readFileSync(tsvPath, "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && !line.startsWith("key\t"))
  .map((line) => {
    const [siteKey, directory, frontend] = line.split("\t");
    return {
      siteKey,
      root: resolve("/root/projects", directory, frontend === "." ? "" : frontend),
    };
  });

const importPattern =
  /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|^\s*import\s*)["'](@oceanleo\/ui(?:\/[^"']*)?)["']/gm;
const extensions = /\.(?:[cm]?[jt]sx?|vue|svelte)$/;
const sites = [];
const allSpecifiers = new Set();

for (const row of rows) {
  const files = execFileSync(
    "git",
    ["-C", row.root, "ls-files", "-z"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  )
    .split("\0")
    .filter((file) => extensions.test(file));
  const occurrences = [];
  for (const file of files) {
    const source = readFileSync(join(row.root, file), "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      allSpecifiers.add(specifier);
      occurrences.push({
        specifier,
        file,
        line: source.slice(0, match.index).split("\n").length,
      });
    }
  }
  occurrences.sort(
    (left, right) =>
      left.specifier.localeCompare(right.specifier) ||
      left.file.localeCompare(right.file) ||
      left.line - right.line,
  );
  sites.push({
    siteKey: row.siteKey,
    root: row.root,
    specifiers: [...new Set(occurrences.map((item) => item.specifier))],
    occurrenceCount: occurrences.length,
    ...(summaryOnly
      ? {
          evidence: [
            ...new Map(
              occurrences.map((item) => [item.specifier, item]),
            ).values(),
          ],
        }
      : { occurrences }),
  });
}

const result = {
  schema: "oceanleo.ui-consumer-imports.v1",
  inventory: tsvPath,
  consumerCount: sites.length,
  specifiers: [...allSpecifiers].sort(),
  sites,
};
if (checkExports) {
  const packageRoot = resolve(
    fileURLToPath(new URL("..", import.meta.url)),
  );
  const packageJson = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  );
  const missing = result.specifiers.filter((specifier) => {
    const key = specifier.replace(/^@oceanleo\/ui/, ".") || ".";
    return !(key in packageJson.exports);
  });
  if (missing.length) {
    process.stderr.write(
      `missing explicit package exports:\n${missing.join("\n")}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `${result.consumerCount} consumers use ${result.specifiers.length} explicitly exported specifiers\n`,
    );
  }
}
const json = `${JSON.stringify(result, null, 2)}\n`;
if (outputPath) {
  writeFileSync(outputPath, json);
  process.stderr.write(
    `wrote ${result.consumerCount} consumers to ${outputPath}\n`,
  );
} else if (!checkExports) {
  process.stdout.write(json);
}
