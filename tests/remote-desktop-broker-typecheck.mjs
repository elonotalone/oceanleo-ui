// Ownership-scoped diagnostics; full integration typecheck belongs to the parent.
import ts from 'typescript';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const owned=['src/api/remote-desktop.ts','src/pages/RemoteDesktopPanel.tsx','src/i18n/ui/messages/rd-broker-copy.ts'].map(file=>path.join(root,file));
const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
const program=ts.createProgram(owned,parsed.options);
const diagnostics=[...(config.error?[config.error]:[]),...parsed.errors,...owned.flatMap(file=>{
  const source=program.getSourceFile(file);if(!source)throw new Error(`Missing ${file}`);
  return [...program.getSyntacticDiagnostics(source),...program.getSemanticDiagnostics(source)];
})];
if(diagnostics.length)console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
console.log(`${owned.length} owned sources; ${diagnostics.length} diagnostics`);
process.exitCode=diagnostics.length?1:0;
