// Scoped check for W4 ownership; the parent owns repository-wide integration checks.
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const owned = [
  'src/shell/ResultCanvas.tsx', 'src/shell/TaskWorkspaceShell.tsx',
  'src/shell/result-canvas-home.tsx', 'src/shell/result-canvas-view.tsx',
  'src/shell/result-canvas-slot-state.ts', 'src/shell/result-canvas-view-state.ts',
  'src/shell/result-canvas-entry-state.ts', 'src/shell/workspace-actions.ts',
  'src/shell/workspace-route.ts', 'src/shell/library-edit-intent.ts',
  'src/shell/site-catalog-deeplink.tsx', 'src/i18n/ui/messages/w4-sidebar-copy.ts',
].map(file => path.join(root, file));
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(owned, parsed.options);
const diagnostics = [
  ...(config.error ? [config.error] : []), ...parsed.errors,
  ...owned.flatMap(file => {
    const source = program.getSourceFile(file);
    if (!source) throw new Error(`Missing owned source: ${file}`);
    return [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)];
  }),
];
if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
}));
console.log(`${owned.length} owned sources; ${diagnostics.length} diagnostics`);
process.exitCode = diagnostics.length ? 1 : 0;
