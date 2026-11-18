import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {LOCALES} from '../../i18n/config.ts';
import {SERVER_PAGE_MESSAGES} from '../../i18n/ui/messages/server-services-copy.ts';
import {UI_MESSAGES} from '../../i18n/ui/messages/index.ts';
import {loadUiMessages} from '../../i18n/ui/messages/load.ts';
test('server services copy covers every source key and interpolation in every locale and runtime loader',async()=>{
 const files=['ServerPage.tsx','ServerCosts.tsx','ServerMonitoring.tsx','ServerRescue.tsx','server-page-shared.tsx'];
 const keys=[...new Set(files.flatMap(file=>[...fs.readFileSync(new URL(file,import.meta.url),'utf8').matchAll(/"([^"\n]*[\u3400-\u9fff][^"\n]*)"/g)].map(m=>m[1])))];
 for(const locale of LOCALES){
  const dict=SERVER_PAGE_MESSAGES[locale];assert.deepEqual(Object.keys(dict).sort(),Object.keys(SERVER_PAGE_MESSAGES.zh).sort(),locale);
  const runtime=await loadUiMessages(locale);
  for(const [key,value] of Object.entries(dict)){
   assert.ok(value,`${locale}: ${key}`);assert.deepEqual(value.match(/\{\w+\}/g)?.sort()??[],key.match(/\{\w+\}/g)?.sort()??[],`${locale}: interpolation ${key}`);
   assert.equal(UI_MESSAGES[locale][key],value);if(locale!=='zh')assert.equal(runtime[key],value);
  }
  if(locale==='zh')continue;
  for(const key of keys){assert.ok(UI_MESSAGES[locale][key],`${locale}: aggregate ${key}`);assert.ok(runtime[key],`${locale}: runtime ${key}`);}
 }
});
