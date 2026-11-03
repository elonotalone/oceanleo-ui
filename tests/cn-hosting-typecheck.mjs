// Scoped ownership check; repository-wide typecheck belongs to the parent.
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const owned = ["src/lib/cn-hosting-api.ts", "src/shell/website-platform/CnHostingPanel.tsx",
  "src/shell/website-platform/WebsiteWorkbenchPanels.tsx", "src/i18n/ui/messages/cn-host-copy.ts"].map(f => path.join(root, f));
const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(owned, parsed.options);
const diagnostics = [...(config.error ? [config.error] : []), ...parsed.errors, ...owned.flatMap(file => {
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`Missing source: ${file}`);
  return [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)];
})];
if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => "\n",
}));
console.log(`${owned.length} owned sources; ${diagnostics.length} diagnostics`);
process.exitCode = diagnostics.length ? 1 : 0;
