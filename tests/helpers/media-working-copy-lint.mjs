// Server-side focused verification; uses installed portal tooling, no installs.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../",import.meta.url));
const require = createRequire("/root/projects/oceanleo/package.json");
const { ESLint } = require("eslint");
const packages = "/root/projects/oceanleo/node_modules/.pnpm/";
const dependency = (prefix,path) => require(packages+readdirSync(packages).find(name=>name.startsWith(prefix))+"/node_modules/"+path);
const eslint = new ESLint({cwd:root,overrideConfigFile:true,overrideConfig:[{
  files:["**/*.{ts,tsx,mjs}"],
  languageOptions:{parser:dependency("@typescript-eslint+parser@","@typescript-eslint/parser/dist/index.js"),
    ecmaVersion:2022,sourceType:"module",parserOptions:{ecmaFeatures:{jsx:true}}},
  plugins:{"react-hooks":dependency("eslint-plugin-react-hooks@","eslint-plugin-react-hooks")},
  rules:{"react-hooks/rules-of-hooks":"error","react-hooks/exhaustive-deps":"warn"},
}]});
const paths = [
  "editor-working-copy.ts",
  "advanced-routes/AudioRoute.tsx","advanced-routes/ImageRoute.tsx",
  "advanced-routes/Model3DRoute.tsx","advanced-routes/VideoTimelineRoute.tsx",
  "advanced-routes/non-richdoc-source-gate.ts",
  "image-editor/editor-persistence.ts","image-editor/fabric-image-open.ts",
  "image-editor/image-remote-delta.ts",
  "image-editor/types.ts","image-editor/use-fabric-image-editor.ts",
  "image-editor/fabric-controller-core.ts",
  "media-editors/AudioWorkbench.tsx","media-editors/audio-workbench-state.ts",
  "media-editors/Model3DRouteHistory.ts",
  "media-editors/model3d-runtime.mjs","media-editors/model3d-workbench-state.ts",
  "media-editors/use-audio-persistence.ts","media-editors/use-model3d-save.ts",
  "media-editors/use-model3d-scene-restore.ts","media-editors/use-model3d-workbench.ts",
  "video-editor/persistence.ts","video-editor/use-video-timeline.ts",
].map(path=>"src/shell/"+path);
const key = m => m.ruleId+"|"+m.message.replace(/at line \d+/g,"at line N");
const counts = {files:paths.length,baseline:{errors:0,warnings:0},current:{errors:0,warnings:0},newWarnings:0};
for(const path of paths) {
  const [current,baseline] = await Promise.all([
    eslint.lintFiles([path]),
    eslint.lintText(execFileSync("git",["show",(process.argv[2]||"d212f88d")+":"+path],
      {cwd:root,encoding:"utf8",maxBuffer:4*1024*1024}),{filePath:root+path}),
  ]);
  const before = new Set(baseline.flatMap(r=>r.messages.map(key)));
  for(const [name,results] of [["baseline",baseline],["current",current]]) {
    for(const result of results) {
      counts[name].errors+=result.errorCount;counts[name].warnings+=result.warningCount;
      if(name==="current")for(const message of result.messages)if(!before.has(key(message))) {
        console.log(path+":"+message.line+" "+message.message);
        if(message.severity===1)counts.newWarnings++;
      }
    }
  }
}
console.log(JSON.stringify(counts));
process.exitCode=counts.current.errors||counts.newWarnings?1:0;
