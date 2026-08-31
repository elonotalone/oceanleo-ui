import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

const SRC = new URL("../src/", import.meta.url);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const url = new URL(`${entry}`, dir);
    if (statSync(url).isDirectory()) {
      walk(new URL(`${entry}/`, dir), out);
    } else if (/\.(?:ts|tsx|mjs)$/.test(entry)) {
      out.push({ path: url.pathname, text: readFileSync(url, "utf8") });
    }
  }
  return out;
}

/**
 * `AdvancedImageEditor.tsx`（490 行）是死代码：没有任何路由引用它，
 * `useImageWorkbench` 没有外部消费方。真正在用的是
 * `useFabricImageEditor` + `FabricImage*` 那一套。
 *
 * 「零命中是最贵的一类断言」——所以这份测试先用一个**确定存在**的符号
 * 验证扫描本身是有效的，再断言目标符号零命中。
 */
test("the scan itself finds a symbol that is known to exist", () => {
  const files = walk(SRC);
  assert.ok(files.length > 100, `src 扫描只拿到 ${files.length} 个文件，扫描本身可疑`);
  const control = files.filter((file) =>
    file.text.includes("useFabricImageEditor"),
  );
  assert.ok(
    control.length >= 2,
    "对照符号 useFabricImageEditor 应当命中多个文件；命中不足说明扫描口径坏了",
  );
});

test("AdvancedImageEditor is gone and nothing imports it", () => {
  assert.equal(
    existsSync(new URL("shell/AdvancedImageEditor.tsx", SRC)),
    false,
    "死代码文件应当已删除",
  );

  const files = walk(SRC);
  const offenders = [];
  for (const file of files) {
    // 只认真正的引用：import / export from / 动态 import / require。
    const referencing =
      /(?:from|import|require)\s*\(?\s*["'][^"']*AdvancedImageEditor["']/.test(
        file.text,
      ) ||
      /\b(?:useImageWorkbench|ImageWorkbenchControls|ImageWorkbenchCanvas)\s*[(<]/.test(
        file.text,
      );
    if (referencing) offenders.push(file.path);
  }
  assert.deepEqual(offenders, [], "没有任何文件可以再引用已删除的死代码");
});

test("the deleted module is not part of the published API surface", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const targets = Object.values(pkg.exports || {}).map(String);
  for (const target of targets) {
    assert.doesNotMatch(
      target,
      /AdvancedImageEditor/,
      "已删除的模块不许留在 exports 映射里，否则 31 个站的构建当场坏",
    );
    // 通配导出会让任意内部文件变成公共 API，那样删任何东西都是破坏性变更。
    assert.ok(
      !target.includes("*"),
      `exports 出现通配项 ${target}：删除内部文件前必须先确认它不是公共 API`,
    );
  }
});
