import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const messagesDir = new URL("../src/i18n/ui/messages/", import.meta.url);
const indexSource = readFileSync(new URL("index.ts", messagesDir), "utf8");

function importedFragments() {
  const imports = new Map();
  const pattern = /import\s+\{([\s\S]*?)\}\s+from\s+["'](\.\/[^"']+)["'];/g;
  for (const match of indexSource.matchAll(pattern)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim();
      if (/^[A-Z][A-Z0-9_]*$/.test(name)) imports.set(name, match[2]);
    }
  }

  const block = indexSource.match(/\ben:\s*\{([\s\S]*?)\n\s*\},\n\s*ja:/)?.[1] ?? "";
  return [...block.matchAll(/\.\.\.([A-Z][A-Z0-9_]*)\.en/g)].map((match) => {
    const source = imports.get(match[1]);
    assert.ok(source, `index.ts 中 ${match[1]} 没有可解析的命名 import`);
    return { name: match[1], source };
  });
}

const ALLOWED_BASE_OVERRIDES = new Map([
  // 每一项都必须说明为什么同一中文键可以故意改写基础英文；无理由不得加白名单。
  [
    "RECENT_MODEL_AND_TASK_MESSAGES:新建",
    "任务列表按钮特指新建任务，基础表的 New 是无对象的通用动作。",
  ],
  [
    "CLOUD_BROWSER_MESSAGES:前进",
    "浏览器工具栏指页面导航 Forward，基础表的 Redo 属于编辑器重做动作。",
  ],
  [
    "EDITOR_PANELS_MESSAGES:中",
    "编辑器分表指居中对齐 Center，基础表的 Medium 指尺寸或强度档位。",
  ],
]);

test("分表不得悄悄改变基础词典里同一中文键的英文含义", async () => {
  const { default: baseEnglish } = await import(new URL("en.ts", messagesDir));
  const conflicts = [];
  const finalEnglish = { ...baseEnglish };

  for (const fragment of importedFragments()) {
    const module = await import(
      new URL(`${fragment.source.slice(2)}.ts`, messagesDir)
    );
    const dictionary = module[fragment.name]?.en;
    assert.ok(dictionary && typeof dictionary === "object", `${fragment.name}.en 不是词典`);
    for (const [key, translated] of Object.entries(dictionary)) {
      if (
        Object.prototype.hasOwnProperty.call(baseEnglish, key) &&
        baseEnglish[key] !== translated
      ) {
        const id = `${fragment.name}:${key}`;
        const reason = ALLOWED_BASE_OVERRIDES.get(id);
        if (!reason) {
          conflicts.push(
            `${id}\n  base: ${baseEnglish[key]}\n  fragment: ${translated}`,
          );
        } else {
          assert.ok(reason.trim().length >= 12, `${id} 的白名单理由不够具体`);
        }
      }
    }
    Object.assign(finalEnglish, dictionary);
  }

  assert.deepEqual(
    conflicts,
    [],
    `发现 ${conflicts.length} 个未说明的基础键覆盖：\n${conflicts.join("\n")}`,
  );
  assert.equal(baseEnglish["登录"], "Log in");
  assert.equal(finalEnglish["登录"], baseEnglish["登录"]);
});
