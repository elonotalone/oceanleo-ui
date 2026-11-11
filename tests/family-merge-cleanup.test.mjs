import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const retired = new Set([
  "AppShell", "WorkspacePages", "HomeIntro", "HomeAppCards", "HomeAgentCards",
  "ImageLightbox", "TemplateShowcase", "model-picker-visibility",
]);
const retiredExports = new Set([
  ...retired, "AppShellProps", "AppShellBrand", "AppShellLayout", "ShellNavItem",
  "ShellNavGroup", "ShellNavDisclosure", "ShellSubNav", "HomeIntroProps",
  "HomeAppCardsProps", "HOME_APP_ALL_GROUP", "HOME_APP_FEATURED_LIMIT", "HOME_APP_SEE_ALL_HREF",
  "appPreviewImageKey", "featuredHomeApps", "homeAppGroups", "ImageLightboxProps",
  "TemplateShowcaseProps", "HomePromptCards", "HomeAgentPick", "workspaceNav",
  "pageFromPath", "useWorkspaceNavLabels", "WorkspacePage", "WorkspaceNavOptions", "PageTitle",
]);

test("retired sub-site home and shell implementations and exports are absent", () => {
  for (const name of retired) {
    for (const extension of [".ts", ".tsx"]) {
      assert.equal(existsSync(join(root, "src/shell", name + extension)), false, `${name}${extension}`);
    }
  }
  const snapshot = JSON.parse(readFileSync(join(root, "src/architecture/public-api.snapshot.json"), "utf8"));
  const exports = snapshot.entrypoints["./shell"].declarations.map((entry) => entry.name);
  assert.deepEqual(exports.filter((name) => retiredExports.has(name)), []);
  for (const name of ["HomeAssetCards", "AppCardShell", "AppDirectory", "SiteCatalogConsole", "AppPageHeader", "WorkspaceDesk", "PromptCardModal", "AddPromptModal"]) {
    assert.ok(exports.includes(name), `live merged-family export ${name} must remain`);
  }
});

test("tracked UI and merged portal sources have no retired module imports or shell bindings", (t) => {
  let scanned = 0;
  const violations = [];
  for (const repo of [root, resolve(root, "../oceanleo")]) {
    if (!existsSync(join(repo, ".git"))) {
      assert.notEqual(repo, root);
      t.diagnostic("Portal checkout absent; standalone package scan covers UI source only.");
      continue;
    }
    const files = execFileSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8" }).split("\0");
    for (const file of files) {
      if (!/\.[jt]sx?$/.test(file) || /^(?:docs|tests|scripts|backend)\//.test(file)) continue;
      const path = join(repo, file);
      if (!existsSync(path)) continue;
      scanned++;
      const sf = ts.createSourceFile(file, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node) {
        let specifier;
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
          specifier = node.moduleSpecifier.text;
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
          specifier = node.arguments[0].text;
        }
        if (specifier) {
          const base = specifier.replace(/\.[cm]?[jt]sx?$/, "").split("/").at(-1);
          if (retired.has(base)) violations.push(`${repo}/${file}: ${specifier}`);
          if (specifier === "@oceanleo/ui/shell" && ts.isImportDeclaration(node)) {
            const bindings = node.importClause?.namedBindings;
            if (bindings && ts.isNamedImports(bindings)) {
              for (const binding of bindings.elements) {
                const name = (binding.propertyName || binding.name).text;
                if (retiredExports.has(name)) violations.push(`${repo}/${file}: shell.${name}`);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sf);
    }
  }
  assert.ok(scanned > 500, "scan must cover the actual package source");
  assert.deepEqual(violations, []);
  t.diagnostic(`Scanned ${scanned} tracked source modules; old standalone site repositories are excluded.`);
});
