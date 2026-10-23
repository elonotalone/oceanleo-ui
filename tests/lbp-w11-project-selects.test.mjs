import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { LOCALES } from "../src/i18n/config.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { LBP_W11_MESSAGES } from "../src/i18n/ui/messages/lbp-w11-copy.ts";

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("项目翻译：17 语种齐全，变量不丢失，非 CJK 译文没有中文回退", () => {
  const keys = Object.keys(LBP_W11_MESSAGES.zh);
  assert.ok(keys.length >= 250);
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(LBP_W11_MESSAGES[locale]).sort(), [...keys].sort(), locale);
    for (const key of keys) {
      const text = LBP_W11_MESSAGES[locale][key];
      assert.ok(text?.trim(), `${locale}: ${key}`);
      assert.deepEqual(placeholders(text), placeholders(key), `${locale}: ${key}`);
      assert.equal(UI_MESSAGES[locale][key], text, `词典已注册 ${locale}: ${key}`);
      if (!["zh", "zh-TW", "ja", "ko"].includes(locale)) {
        assert.doesNotMatch(text, /[\u4e00-\u9fff]/u, `${locale}: ${key}`);
      }
    }
  }
});

const portal = new URL("../../oceanleo/", import.meta.url);
const files = [
  "app/projects/page.tsx",
  "components/project/ProjectPlanTab.tsx",
  "components/project/ProjectTasksTab.tsx",
  "components/project/ProjectAssetsTab.tsx",
  "components/project/ProjectAutomationDialog.tsx",
  "components/project/ProjectConnectorDialog.tsx",
  "components/project/ProjectInstructionDialog.tsx",
  "components/ShareProjectModal.tsx",
];

test("项目调用方的静态译文全部存在；计划页没有裸中文或原生下拉", { skip: !existsSync(new URL(files[0], portal)) }, () => {
  for (const file of files) {
    const source = readFileSync(new URL(file, portal), "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tt") {
        const key = node.arguments[0];
        if (key && ts.isStringLiteralLike(key) && /[\u4e00-\u9fff]/u.test(key.text)) {
          for (const locale of LOCALES) assert.ok(UI_MESSAGES[locale][key.text], `${file}: ${locale}: ${key.text}`);
        }
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        assert.notEqual(node.tagName.getText(ast), "select", file);
      }
      if (file.endsWith("ProjectPlanTab.tsx") && ts.isJsxText(node)) {
        assert.doesNotMatch(node.text, /[\u4e00-\u9fff]/u);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
});
