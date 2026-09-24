// 翻译分表会进服务端组件（load.ts）。这里不许出现 React / Next 运行时。
//
// 跑法：
//   bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- \
//     node --import ./tests/helpers/assert-dom-guard.mjs \
//     --experimental-strip-types \
//     --experimental-loader ./tests/ts-extension-loader.mjs \
//     --test tests/i18n-messages-server-safe.test.mjs

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const messagesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/i18n/ui/messages",
);

const IMPORT_RE =
  /^[ \t]*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gm;
const HOOK_RE =
  /\buse(?:State|Effect|SyncExternalStore|Callback)\s*\(/g;

function isTypeOnlyImport(clause) {
  const trimmed = clause.replace(/\s+/g, " ").trim();
  return /^type[\s{]/.test(trimmed);
}

function isAllowedSpecifier(specifier) {
  return (
    specifier.startsWith("./") ||
    specifier === "../../config" ||
    specifier.startsWith("../../config/")
  );
}

function scanMessages() {
  const files = readdirSync(messagesDir)
    .filter((name) => name.endsWith(".ts"))
    .sort();
  const importHits = [];
  const clientHits = [];
  const hookHits = [];
  for (const name of files) {
    const rel = `src/i18n/ui/messages/${name}`;
    const source = readFileSync(join(messagesDir, name), "utf8");
    const lines = source.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/"use client"/.test(line) || /'use client'/.test(line)) {
        clientHits.push(`${rel}:${index + 1}`);
      }
    }
    let match;
    const importRe = new RegExp(IMPORT_RE.source, "gm");
    while ((match = importRe.exec(source))) {
      if (isTypeOnlyImport(match[1])) continue;
      const specifier = match[2];
      if (isAllowedSpecifier(specifier)) continue;
      const before = source.slice(0, match.index);
      const line = before.split("\n").length;
      importHits.push(`${rel}:${line} from ${JSON.stringify(specifier)}`);
    }
    const hookRe = new RegExp(HOOK_RE.source, "g");
    while ((match = hookRe.exec(source))) {
      const before = source.slice(0, match.index);
      const line = before.split("\n").length;
      hookHits.push(`${rel}:${line} ${match[0]}`);
    }
  }
  return { files, importHits, clientHits, hookHits };
}

test("ui message tables only import same-dir or ../../config", () => {
  const { importHits } = scanMessages();
  assert.deepEqual(
    importHits,
    [],
    `翻译分表进了服务端组件，非同目录 / ../../config 的 import 会打挂 SSR：\n${importHits.join("\n")}`,
  );
});

test("ui message tables are not client modules and do not call React hooks", () => {
  const { clientHits, hookHits } = scanMessages();
  assert.deepEqual(
    clientHits,
    [],
    `翻译分表不许带 "use client"：\n${clientHits.join("\n")}`,
  );
  assert.deepEqual(
    hookHits,
    [],
    `翻译分表不许调用 React 钩子：\n${hookHits.join("\n")}`,
  );
});
