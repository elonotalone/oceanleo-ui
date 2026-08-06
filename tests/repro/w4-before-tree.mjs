// W4 · 「改前」的那棵树，只读地搭出来
//
// 要对照的是同一幕在改前改后各是什么样，而**不能**为此把工作区回滚——同一个仓里
// 还有别的 owner 在跑，回滚哪怕几秒都可能让他们读到半截状态。
//
// 所以这里搭一棵影子树：`src/` 下所有东西都是指回真仓的符号链接，只有本轮改过的
// 那几份文件换成 `git show <ref>:<path>` 取出来的旧版本。相对 import 在影子树里
// 自己闭合，裸包名仍由仓根的 node_modules 解析，所以旧文件加载出来就是旧行为。
//
//   node tests/repro/w4-before-tree.mjs [ref]        # 默认 80ca306^
//
// 打印影子树的 `src` 绝对路径，喂给 `W4_SRC_ROOT`。

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ref = process.argv[2] || "80ca306^";

/** 本轮 W4 改过的四份文件，影子树里换成旧版本。 */
const OVERRIDES = [
  "src/shell/ArtifactActions.tsx",
  "src/shell/WorkspaceLibrary.tsx",
  "src/shell/artifact-client.ts",
  "src/shell/material-library-presentation.ts",
];

const root = join(
  "/tmp",
  `oceanleo-w4-before-${ref.replace(/[^a-zA-Z0-9]/g, "_")}`,
);
rmSync(root, { recursive: true, force: true });
mkdirSync(join(root, "src", "shell"), { recursive: true });

for (const name of readdirSync(join(REPO, "src"))) {
  if (name === "shell") continue;
  symlinkSync(join(REPO, "src", name), join(root, "src", name));
}
const overridden = new Set(OVERRIDES.map((path) => path.split("/").pop()));
for (const name of readdirSync(join(REPO, "src", "shell"))) {
  if (overridden.has(name)) continue;
  symlinkSync(join(REPO, "src", "shell", name), join(root, "src", "shell", name));
}
for (const path of OVERRIDES) {
  writeFileSync(
    join(root, path),
    execFileSync("git", ["show", `${ref}:${path}`], {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }),
    "utf8",
  );
}

console.log(join(root, "src"));
