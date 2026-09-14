import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const picker = readFileSync(
  fileURLToPath(new URL("../src/shell/ModelPicker.tsx", import.meta.url)),
  "utf8",
);
const status = readFileSync(
  fileURLToPath(new URL("../src/shell/byok-status.ts", import.meta.url)),
  "utf8",
);

test("ModelPicker imports fetchByokStatusLite and the three BYOK keys", () => {
  assert.match(picker, /import\s*\{[^}]*fetchByokStatusLite[^}]*\}\s*from\s*["']\.\/byok-status["']/);
  assert.match(picker, /tt\("我的模型 · 自带 key · 优先使用（免费）"\)/);
  assert.match(picker, /tt\("已配置 \{n\} 家：\{names\}"/);
  assert.match(picker, /tt\("管理 →"\)/);
});

test("byok-status sends the sealed cookie and never reads localStorage", () => {
  assert.match(status, /credentials:\s*"include"/);
  assert.doesNotMatch(status, /localStorage/);
});
