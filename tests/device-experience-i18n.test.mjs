import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { loadUiMessages } from "../src/i18n/ui/messages/load.ts";

const files = [
  "src/pages/devices/DeviceCover.tsx",
  "src/pages/devices/CloudDeviceGrid.tsx",
  "src/pages/DevicesPage.tsx",
  "src/shell/cloud-computer/ComputerDock.tsx",
];

test("device cards and bottom execution picker have no untranslated English labels", async () => {
  const en = await loadUiMessages("en");
  const keys = new Set();
  for (const file of files) {
    const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /[一-鿿]/.test(node.text)) keys.add(node.text);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.ok(keys.size > 40);
  for (const key of keys) {
    assert.ok(en[key], `Missing device label: ${key}`);
    assert.doesNotMatch(en[key], /[一-鿿]/, key);
  }
});

test("native sign-in failures are translated without restoring obsolete landing copy", async () => {
  const en = await loadUiMessages("en");
  for (const key of ["无法打开浏览器，请重试。", "无法保存登录状态，请重试。", "登录账号不匹配，请重试。", "网络错误：无法连接到登录服务，请稍后重试。"])
    assert.doesNotMatch(en[key] || key, /[一-鿿]/, key);
  const source = await readFile("src/pages/AuthDialog.tsx", "utf8");
  const desktop = source.slice(source.indexOf("function DesktopBrowserLoginPanel"));
  assert.doesNotMatch(desktop, /登录后会自动返回 OceanLeo。|在浏览器中登录/);
});
