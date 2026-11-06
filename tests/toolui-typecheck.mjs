// Typecheck only this unit's source roots, with their real dependency closure.
// Include the repository's ambient CSS declaration as the normal tsconfig does.
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = [
  'src/shell/cloud-computer/agent-dialog/parse.ts',
  'src/shell/cloud-computer/agent-dialog/types.ts',
  'src/shell/cloud-computer/agent-dialog/MessageList.tsx',
  'src/shell/native-thread/map-dialog.ts',
  'src/i18n/ui/messages/toolui-copy.ts',
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
