// Strict scoped check with the real dependency closure; no diagnostic filtering.
import ts from 'typescript';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = [
  'src/lib/agent-progress.ts',
  'src/shell/AgentProgress.tsx',
  'src/shell/cloud-computer/agent-dialog/MessageList.tsx',
  'src/shell/cloud-computer/agent-dialog/ToolRawFolds.tsx',
].map(file => path.join(root, file));
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram([...files, path.join(root, 'src/shell/cloud-computer/xterm-css.d.ts')], parsed.options);
const diagnostics = [...(config.error ? [config.error] : []), ...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
const owned = diagnostics.filter(diagnostic => !diagnostic.file || files.includes(diagnostic.file.fileName));
console.log(ts.formatDiagnostics(diagnostics, {
  getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => '\n',
}));
console.log(JSON.stringify({sourceRoots: files.length, ownedErrors: owned.length, dependencyErrors: diagnostics.length - owned.length}));
process.exitCode = diagnostics.length ? 1 : 0;
