import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const { sheetsFromSnapshot, sheetsFromWorkbook } = await import(await compileModule('src/shell/library-spreadsheet-preview.tsx', {
  '../i18n/ui/useUI': dataModule('export const useUI=()=>s=>s;'),
  './doc-editors/office-file': dataModule('export const fetchValidatedSpreadsheetSource=async()=>new ArrayBuffer(0);'),
  '../lib/media-proxy': dataModule('export const fetchMediaBlob=async()=>new Blob();'),
}));
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
test('native snapshot preserves fills/fonts/number formats/merges/widths/in-cell image',async()=>{
  const sheets=await sheetsFromSnapshot({styles:{title:{bg:{rgb:'#123456'},cl:{rgb:'#ffffff'},fs:24,bl:1,n:{pattern:'0.00%'}}},sheetOrder:['a'],sheets:{a:{name:'Budget',rowCount:700,columnCount:120,
    columnData:{0:{w:210}},rowData:{0:{h:55}},mergeData:[{startRow:0,endRow:0,startColumn:0,endColumn:2}],
    cellData:{0:{0:{v:0.25,s:'title'}},1:{0:{p:{drawings:{img:{source:image}}}}}}}}});
  const sheet=sheets[0];assert.equal(sheet.rows,700);assert.equal(sheet.columns,120);assert.equal(sheet.cells['0:0'].text,'25.00%');
  assert.equal(sheet.cells['0:0'].style.backgroundColor,'#123456');assert.equal(sheet.cells['0:0'].style.fontWeight,'bold');assert.equal(sheet.cells['0:0'].style.fontSize,'24pt');
  assert.equal(sheet.cells['1:0'].image,image);assert.equal(sheet.widths[0],210);assert.equal(sheet.heights[0],55);assert.deepEqual(sheet.merges,[{r0:0,c0:0,r1:0,c1:2}]);
});
test('XLSX bytes preserve styled values and embedded image',async()=>{
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Styled');
  sheet.getCell('A1').value=1234.5;sheet.getCell('A1').numFmt='$#,##0.00';sheet.getCell('A1').font={bold:true,size:20,color:{argb:'FFFFFFFF'}};
  sheet.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF225588'}};sheet.mergeCells('A1:C1');sheet.getColumn(1).width=30;sheet.getRow(1).height=45;
  const id=book.addImage({base64:image,extension:'png'});sheet.addImage(id,{tl:{col:0,row:1},ext:{width:60,height:60}});
  const parsed=await sheetsFromWorkbook(await book.xlsx.writeBuffer());
  assert.equal(parsed[0].cells['0:0'].text,'$1,234.50');assert.equal(parsed[0].cells['0:0'].style.backgroundColor,'#225588');assert.equal(parsed[0].cells['0:0'].style.fontWeight,'bold');
  assert.equal(parsed[0].heights[0],60);assert.equal(parsed[0].widths[0],210);assert.ok(parsed[0].cells['1:0'].image.startsWith('data:image/png;base64,'));assert.equal(parsed[0].merges[0].c1,2);
});
test('ODS source XML overlays fills/fonts/column widths and in-cell image',async()=>{
  const XLSX=await import('xlsx');
  const {zipSync,unzipSync,strToU8,strFromU8}=await import('fflate');
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Styled']]),'ODS');
  const files=unzipSync(new Uint8Array(XLSX.write(workbook,{bookType:'ods',type:'array'})));
  let xml=strFromU8(files['content.xml']);
  xml=xml.replace('</office:automatic-styles>','<style:style style:name="cellPreview" style:family="table-cell"><style:table-cell-properties fo:background-color="#884422"/><style:text-properties fo:font-weight="bold" fo:font-size="22pt" fo:color="#ffffff"/></style:style></office:automatic-styles>');
  xml=xml.replace('<table:table-cell office:value-type="string"','<table:table-cell table:style-name="cellPreview" office:value-type="string"');
  files['content.xml']=strToU8(xml);
  const parsed=await sheetsFromWorkbook(zipSync(files).buffer);
  assert.equal(parsed[0].cells['0:0'].style.backgroundColor,'#884422');assert.equal(parsed[0].cells['0:0'].style.fontWeight,'bold');assert.equal(parsed[0].cells['0:0'].style.fontSize,'22pt');
});
test('sheet preview pages beyond the 300 by 60 window without entering editing mode',async()=>{
  const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const {SpreadsheetViewer}=await import(await compileModule('src/shell/library-spreadsheet-preview.tsx',{
    '../i18n/ui/useUI':dataModule('export const useUI=()=>s=>s;'),
    './doc-editors/office-file':dataModule('export const fetchValidatedSpreadsheetSource=async()=>new ArrayBuffer(0);'),
    '../lib/media-proxy':dataModule('export const fetchMediaBlob=async()=>new Blob();'),
  }));
  const host=document.createElement('div'),root=createRoot(host);
  await act(async()=>root.render(React.createElement(SpreadsheetViewer,{item:{key:'pages',meta:{snapshot:{sheets:{a:{name:'Big',rowCount:301,columnCount:61,cellData:{300:{60:{v:'last cell'}}}}}}}}})));
  assert.ok(host.querySelector('[data-sheet-preview="readonly"]'));assert.equal(host.querySelectorAll('tr').length,300);
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='下一页').click());
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='后 60 列').click());
  assert.match(host.textContent,/last cell/);assert.equal(host.querySelectorAll('tr').length,1);assert.equal(host.querySelector('[contenteditable]'),null);
  await act(async()=>root.unmount());
});
test('Excel rich-value in-cell image is read from its metadata relationships',async()=>{
  const {zipSync,unzipSync,strToU8,strFromU8}=await import('fflate');
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('InCell');sheet.getCell('A1').value={error:'#VALUE!'};
  const files=unzipSync(new Uint8Array(await book.xlsx.writeBuffer()));
  files['xl/worksheets/sheet1.xml']=strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace('<c r="A1"','<c vm="1" r="A1"'));
  files['xl/metadata.xml']=strToU8('<metadata><valueMetadata><bk><rc t="1" v="0"/></bk></valueMetadata></metadata>');
  files['xl/richData/rdrichvalue.xml']=strToU8('<rvData><rv s="0"><v>0</v><v>5</v></rv></rvData>');
  files['xl/richData/richValueRel.xml']=strToU8('<richValueRels xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><rel r:id="rId1"/></richValueRels>');
  files['xl/richData/_rels/richValueRel.xml.rels']=strToU8('<Relationships><Relationship Id="rId1" Target="../media/incell.png"/></Relationships>');
  files['xl/media/incell.png']=Uint8Array.from(Buffer.from(image.split(',')[1],'base64'));
  const parsed=await sheetsFromWorkbook(zipSync(files).buffer);
  assert.equal(parsed[0].cells['0:0'].image,image);assert.equal(parsed[0].cells['0:0'].text,'');
});
