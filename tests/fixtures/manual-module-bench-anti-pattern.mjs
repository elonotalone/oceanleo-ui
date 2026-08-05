// 反面用例夹具（W28）：故意保留「手工替换清单 + data: 编译台」写法。
// 机检 `module-bench-gate.test.mjs` 必须把它判红；谁把规则改松让它漏网，
// 本夹具那一条断言当场红。**不是**可执行测试，不要 `node --test` 直接跑它。

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

const sourcePath = resolve("src/shell/artifact-client.ts");
let source = readFileSync(sourcePath, "utf8");
for (const [specifier, replacement] of Object.entries({
  "../lib/auth/client": dataModule("export async function accessToken(){return '';}"),
  react: pathToFileURL(resolve("node_modules/react/index.js")).href,
})) {
  source = source.replaceAll(
    JSON.stringify(specifier),
    JSON.stringify(replacement),
  );
}
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
}).outputText;

export const antiPatternUrl = dataModule(compiled);
