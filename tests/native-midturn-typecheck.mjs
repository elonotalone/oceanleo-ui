// Typecheck only this unit's source roots, with their real dependency closure.
// Include the repository's ambient CSS declaration as the normal tsconfig does.
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = [
  'src/shell/LeoComposer.tsx', 'src/shell/AgentChat.tsx',
  'src/shell/task-native/useNativeThread.ts',
  'src/shell/cloud-computer/legacy-dialog/useAgentDialogController.tsx',
  'src/shell/cloud-computer/legacy-dialog/reduce.ts', 'src/shell/task-native/map-dialog.ts',
  'src/native-agent-core/index.ts', 'src/i18n/ui/messages/native-midturn-copy.ts',
].map(file => path.join(root, file));
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
const program = ts.createProgram([...files, path.join(root, 'src/shell/cloud-computer/xterm-css.d.ts')], options);
const diagnostics = ts.getPreEmitDiagnostics(program);
const owned = diagnostics.filter(diagnostic => !diagnostic.file || files.includes(diagnostic.file.fileName));
console.log(ts.formatDiagnostics(diagnostics, {
  getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => '\n',
}));
console.log(JSON.stringify({ sourceRoots: files.length, ownedErrors: owned.length, dependencyErrors: diagnostics.length - owned.length }));
process.exitCode = diagnostics.length ? 1 : 0;
