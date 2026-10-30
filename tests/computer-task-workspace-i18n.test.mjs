import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadUiMessages } from '../src/i18n/ui/messages/load.ts';
import { UI_MESSAGES } from '../src/i18n/ui/messages/index.ts';
import { LOCALES } from '../src/i18n/config.ts';
import { COMPUTER_TASK_WORKSPACE_SOURCE, COMPUTER_TASK_WORKSPACE_MESSAGES } from '../src/i18n/ui/messages/computer-task-workspace-copy.ts';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const keys=Object.values(COMPUTER_TASK_WORKSPACE_SOURCE);
const {useUI}=await import(await compileModule('src/i18n/ui/useUI.ts',{
 'next-intl':dataModule('export function useLocale(){return globalThis.__workspaceLocale}'),
 './messages/context':dataModule('export function useUiMessages(){return globalThis.__workspaceMessages}')
}));
const nonHan=['en','de','es','es-419','fr','it','pt-BR','pt-PT','vi','tr','ko','ar','th','hi'];
test('all configured locales assemble every workspace, scope, archive and attachment translation at runtime',async()=>{
 assert.equal(keys.length,48);
 for(const locale of LOCALES){
   const dict=await loadUiMessages(locale);
   for(const key of keys){
     assert.equal(COMPUTER_TASK_WORKSPACE_MESSAGES[locale][key], UI_MESSAGES[locale][key],`${locale}: aggregate ${key}`);
     const value=dict[key]??key;assert.ok(value);
     if(locale!=='zh')assert.equal(value,COMPUTER_TASK_WORKSPACE_MESSAGES[locale][key],`${locale}: runtime ${key}`);
     if(nonHan.includes(locale))assert.doesNotMatch(value,/[\u3400-\u9fff]/,`${locale}: untranslated ${key}`);
     assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),[...key.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort());
   }
 }
 assert.equal((await loadUiMessages('en'))['图形'],'Conversation');
 assert.equal((await loadUiMessages('en'))['命令行'],'Command line');
 assert.equal((await loadUiMessages('zh-TW'))['设备 / 程序设置'],'裝置 / 程式設定');
});
test('actual useUI lookup renders English/TW and preserves existing interpolation through selected runtime dictionary',async()=>{
 function Probe(){const tt=useUI();return React.createElement('div',null,keys.map(key=>React.createElement('span',{key},tt(key))),tt('已安装 · {version}',{version:'v3'}));}
 for(const locale of ['en','zh-TW','zh']){
   globalThis.__workspaceLocale=locale;globalThis.__workspaceMessages=await loadUiMessages(locale);
   const html=renderToStaticMarkup(React.createElement(Probe));
   assert.match(html,/v3/);
   if(locale==='en'){assert.doesNotMatch(html,/[\u3400-\u9fff]/);assert.match(html,/separate session/);assert.match(html,/whole computer/);assert.match(html,/does not resume or start/);}
   if(locale==='zh-TW')assert.match(html,/裝置 \/ 程式設定/);
 }
});
test('new host/native/import keys resolve in actual English loading chain, and dictionaries stay outside client useUI imports',async()=>{
 const files=['task-host/ComputerTaskWorkspace.tsx','task-host/ComputerTaskImport.tsx','task-host/ComputerTaskSettingsPane.tsx','task-workspace/ComputerSessionView.tsx','agent-dialog/ArchivedAttachment.tsx','terminal-card/CliCard.tsx','terminal-card/TerminalCard.tsx'];
 const en=await loadUiMessages('en');
 for(const file of files){const source=readFileSync(new URL('../src/shell/cloud-computer/'+file,import.meta.url),'utf8');for(const match of source.matchAll(/tt\(\s*["']([^"']+)["']/g)){const key=match[1];assert.ok(en[key],`${file}: ${key}`);assert.doesNotMatch(en[key],/[\u3400-\u9fff]/);}}
 const client=readFileSync(new URL('../src/i18n/ui/useUI.ts',import.meta.url),'utf8');assert.doesNotMatch(client,/import .*computer-task-workspace-copy/);
 const loader=readFileSync(new URL('../src/i18n/ui/messages/load.ts',import.meta.url),'utf8');assert.match(loader,/import\("\.\/computer-task-workspace-copy"\)/);assert.match(loader,/if \(locale === DEFAULT_LOCALE\) return \{\}/);
});
