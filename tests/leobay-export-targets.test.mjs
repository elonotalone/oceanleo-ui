import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeExportTargets, exportEditorForItem, exportTargetExtension, CLIENT_EXPORT_TARGETS } from '../src/shell/doc-editors/export-targets.ts';
import { csvField, csvRows, activeSheetCsv } from '../src/shell/doc-editors/grid-univer/csv-export.ts';
import { selectedChipColors } from '../src/shell/doc-editors/grid-univer/chip-colors.ts';
import { gridPreviewLayout } from '../src/shell/doc-editors/grid-univer/styled-preview.ts';
import { EXPORT_MESSAGES } from '../src/i18n/ui/messages/export-copy.ts';
import { LOCALES } from '../src/i18n/config.ts';

const caps = { sources: { docx: [{target:'pdf',where:'server',label:'PDF'}, {target:'docx',where:'server',label:'DOCX'}], pptx: [{target:'png-zip',where:'server',label:'PNG ZIP'}, {target:'png-long',where:'server',label:'PNG long'}], pdf: [{target:'docx',where:'server',label:'Word'}, {target:'md',where:'server',label:'MD'}], mp4: [{target:'webm',where:'server',label:'WebM'}, {target:'gif',where:'server',label:'GIF'}, {target:'mp3',where:'server',label:'MP3'}], wav: [{target:'mp3',where:'server',label:'MP3'}, {target:'wav',where:'server',label:'WAV'}, {target:'m4a',where:'server',label:'M4A'}] } };
for (const [editor, required] of Object.entries({richdoc:['docx','pdf','txt','md','html'],deck:['pptx','png-zip','png-long'],grid:['xlsx','csv'],pdf:['pdf','docx','md'],image:['png','jpg','webp','pdf'],vector_image:['png','svg','pdf'],'video-timeline':['mp4','webm','gif','mp3'],audio:['mp3','wav','m4a']})) {
  test(`${editor}: one merged row per target, server availability plus real local generators`, () => {
    const rows=mergeExportTargets(caps,editor); const targets=rows.map(row=>row.target);
    for (const target of required) assert.ok(targets.includes(target),target);
    assert.equal(new Set(targets).size,targets.length);
    for (const client of CLIENT_EXPORT_TARGETS[editor]) assert.equal(rows.find(row=>row.target===client.target).where,'client');
  });
}
test('saved files use their exact format; unadvertised conversions do not appear',()=>{
  assert.deepEqual(mergeExportTargets(caps,'richdoc',[],'pdf').map(row=>row.target),['docx','md']);
  assert.deepEqual(mergeExportTargets(caps,'richdoc',[],'unknown'),[]);
  assert.deepEqual(mergeExportTargets(null,'deck').map(row=>row.target),['pptx']);
  assert.equal(exportEditorForItem({kind:'website',meta:{}}),null);
  assert.equal(exportEditorForItem({kind:'threed',meta:{}}),null);
  assert.equal(exportEditorForItem({kind:'file',meta:{filename:'archive.zip'}}),null);
  assert.equal(exportEditorForItem({kind:'file',meta:{filename:'notes.md'}}),'richdoc');
  assert.equal(exportEditorForItem({kind:'document',artifactType:'pdf',meta:{}}),'pdf');
  assert.equal(exportTargetExtension('png-zip'),'zip'); assert.equal(exportTargetExtension('png-long'),'png');
});
test('RFC 4180 fields retain commas, quotes, CR/LF, unicode, booleans and blanks',()=>{
  assert.equal(csvField('a,b'),'"a,b"'); assert.equal(csvField('a"b'),'"a""b"');
  assert.equal(csvRows([['line\nbreak','x\ry','中文',null,0,false],['last']]),'"line\nbreak","x\ry",中文,,0,false\r\nlast');
});
test('CSV exports the active second sheet, never silently the first',()=>{
  const sheet=(id,v)=>({id,name:id,rowCount:1,columnCount:2,cellData:{0:{0:{v,t:1},1:{v:'quoted,"x"',t:1}}}});
  const snapshot={sheetOrder:['first','active'],sheets:{first:sheet('first','WRONG'),active:sheet('active','RIGHT')}};
  const csv=activeSheetCsv(snapshot,'active'); assert.ok(csv.startsWith('\uFEFFRIGHT,"quoted,""x"""'));
  assert.ok(!csv.includes('WRONG')); assert.throws(()=>activeSheetCsv(snapshot,'missing'),/没有可导出/);
});
test('selected chip gets its matching static fill and contrasting font',()=>{
  assert.deepEqual(selectedChipColors({type:'list',formula1:'Approved,Declined',formula2:'#00ff00,#dd0000'},'Declined'),{background:'#dd0000',color:'#FFFFFF'});
  assert.equal(selectedChipColors({type:'checkbox',formula2:'#00ff00'},true),null);
  assert.equal(selectedChipColors({type:'list',formula1:'Known',formula2:'#ffffff'},'Other'),null);
});
test('cover layout uses first-sheet real column widths and row heights',()=>{
  const layout=gridPreviewLayout({sheetOrder:['s'],sheets:{s:{cellData:{0:{0:{v:'Title'}},1:{2:{v:5}}},columnData:{0:{w:240},1:{w:80}},rowData:{0:{h:64}},defaultColumnWidth:100,defaultRowHeight:30}}});
  assert.deepEqual(layout.widths,[240,80,100]); assert.deepEqual(layout.heights,[64,30]); assert.deepEqual(layout.x,[0,240,320,420]);
});
test('all 17 locales translate every export key and retain format placeholders',()=>{
  assert.equal(LOCALES.length,17);
  const keys=Object.keys(EXPORT_MESSAGES.zh);
  for(const locale of LOCALES) for(const key of keys){assert.ok(EXPORT_MESSAGES[locale][key],`${locale}: ${key}`); if(key.includes('{fmt}'))assert.ok(EXPORT_MESSAGES[locale][key].includes('{fmt}'));}
});

test('cover paints real fills, merged cell dimensions, fonts, formatted values and both picture types',async()=>{
  const {renderStyledGridPreview}=await import('../src/shell/doc-editors/grid-univer/styled-preview.ts');
  const calls=[];
  const context={scale(){},fillRect(x,y,w,h){calls.push({type:'fill',color:this.fillStyle,x,y,w,h});},strokeRect(){},save(){},beginPath(){},rect(){},clip(){},restore(){},fillText(text,x,y){calls.push({type:'text',text,font:this.font,color:this.fillStyle,x,y});},drawImage(...args){calls.push({type:'image',args});}};
  const canvas={getContext:()=>context,toBlob:fn=>fn(new Blob(['rendered'],{type:'image/png'}))};
  const savedDocument=globalThis.document,savedImage=globalThis.Image;
  globalThis.document={createElement:()=>canvas};
  globalThis.Image=class {naturalWidth=1;naturalHeight=1;set src(value){queueMicrotask(()=>this.onload());}};
  const source='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4YQAAAAASUVORK5CYII=';
  try {
    const blob=await renderStyledGridPreview({sheetOrder:['s'],styles:{title:{bg:{rgb:'#ffcc00'},cl:{rgb:'#223344'},fs:24,bl:1}},sheets:{s:{id:'s',columnData:{0:{w:200},1:{w:100}},rowData:{0:{h:60}},mergeData:[{startRow:0,endRow:0,startColumn:0,endColumn:1}],cellData:{0:{0:{v:'Styled title',s:'title'}},1:{0:{v:12,s:{n:{pattern:'0.00'}}},1:{p:{drawings:{img:{source}}}}}}}},resources:[{name:'SHEET_DRAWING_PLUGIN',data:JSON.stringify({s:{data:{banner:{source,sheetTransform:{from:{row:1,column:0},to:{row:2,column:1}}}}}})}]});
    assert.equal(blob.type,'image/png');
    assert.ok(calls.some(call=>call.type==='fill'&&call.color==='#ffcc00'&&call.w===300&&call.h===60));
    assert.ok(calls.some(call=>call.type==='text'&&call.text==='Styled title'&&call.font.includes('bold 32px')&&call.color==='#223344'));
    assert.ok(calls.some(call=>call.type==='text'&&call.text==='12.00'));
    assert.equal(calls.filter(call=>call.type==='image').length,2);
  }finally{globalThis.document=savedDocument;globalThis.Image=savedImage;}
});
