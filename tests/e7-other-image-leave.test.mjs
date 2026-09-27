import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('Image stays in Photopea when leave export fails',async()=>{
  const source=readFileSync('src/shell/advanced-routes/ImageRoute.tsx','utf8');
  const start=source.indexOf('  const setEditorMode = useCallback(');
  const end=source.indexOf('\n  const onPhotopeaDocument',start);
  const changes=[]; const notices=[];
  const code=ts.transpileModule(source.slice(start,end)+'\nglobalThis.change=setEditorMode;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const context={Error,useCallback:fn=>fn,applyImageL0Mode:mode=>({mode}),pluginMode:'pro',activeItem:{},frozenCanvasUrl(){},photopeaSaveRef:{current:{expect:async()=>{throw new Error('upload failed');}}},setExportRequestId(){},setImportNotice:x=>notices.push(x),setPluginModeState:x=>changes.push(x)};
  vm.runInNewContext(code,context);context.change('normal');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(notices,['upload failed']);assert.deepEqual(changes,[]);
});
