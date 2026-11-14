import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const packages='/root/projects/oceanleo/node_modules/.pnpm';
const nextConfig=readdirSync(packages).find(name=>name.startsWith('eslint-config-next@'));
if(!nextConfig)throw new Error('installed portal eslint-config-next not found');
const require=createRequire(`${packages}/${nextConfig}/node_modules/eslint-config-next/package.json`);
const { ESLint }=require('eslint');
const parser=require('@typescript-eslint/parser');
const hooks=require('eslint-plugin-react-hooks');
const eslint=new ESLint({overrideConfigFile:true,overrideConfig:[{files:['**/*.ts','**/*.tsx'],languageOptions:{parser,parserOptions:{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}},plugins:{'react-hooks':hooks},rules:{'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn'}}]});
const files=['src/pages/RemoteDesktopPanel.tsx','src/pages/RemoteDesktopVideo.tsx','src/pages/remote-desktop-media.ts','src/api/remote-desktop.ts','src/api/remote-desktop-scheduler.ts','src/api/remote-desktop-control-timing.ts','src/api/remote-desktop-diagnostics.ts','src/api/remote-desktop-quality.ts','src/api/remote-desktop-measure.ts','src/i18n/ui/messages/remote-desktop-copy.ts'];
const results=await eslint.lintFiles(files);
const before=[];
for(const file of files){let source;try{source=execFileSync('git',['show',`d212f88d:${file}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{continue;}before.push(...await eslint.lintText(source,{filePath:file}));}
for(const [label,rows] of [['BASELINE',before],['CURRENT',results]]){console.log(label,JSON.stringify({errors:rows.reduce((n,r)=>n+r.errorCount,0),warnings:rows.reduce((n,r)=>n+r.warningCount,0)}));for(const row of rows)for(const m of row.messages)console.log(`${row.filePath}:${m.line} ${m.ruleId} ${m.message}`);}
process.exitCode=results.some(r=>r.errorCount)?1:0;
