// Strict scoped check of the changed source files and their real dependencies.
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [
  "src/i18n/ui/messages/bay-form-gap-copy.ts",
  "src/i18n/ui/messages/collab-media-copy.ts",
  "src/i18n/ui/messages/im-people-copy.ts",
  "src/i18n/ui/messages/im-shell-copy.ts",
  "src/i18n/ui/messages/local-agent-copy.ts",
  "src/i18n/ui/messages/local-agent-source.ts",
  "src/i18n/ui/messages/server-page-copy.ts",
  "src/i18n/ui/messages/ui-followup-profile-copy.ts",
  "src/lib/local-agent-task.ts",
  "src/shell/messages/Inbox.tsx",
  "src/shell/messages/InboxRow.tsx",
  "src/shell/messages/conversation/PinnedBar.tsx",
  "src/shell/cloud-computer/xterm-css.d.ts",
].map((file) => path.join(root, file));
const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(files, parsed.options);
const diagnostics = [
  ...(config.error ? [config.error] : []),
  ...parsed.errors,
  ...ts.getPreEmitDiagnostics(program),
];
console.log(ts.formatDiagnostics(diagnostics, {
  getCurrentDirectory: () => root,
  getCanonicalFileName: (file) => file,
  getNewLine: () => "\n",
}));
console.log(JSON.stringify({ sourceRoots: files.length, errors: diagnostics.length }));
process.exitCode = diagnostics.length ? 1 : 0;
