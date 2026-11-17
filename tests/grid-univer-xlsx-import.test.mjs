import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { strToU8, unzipSync, zipSync, strFromU8 } from 'fflate';
import { loadGridFile } from '../src/shell/doc-editors/grid-model.ts';
import { gridSheetsToUniverSnapshot } from '../src/shell/doc-editors/grid-univer/snapshot.ts';
import { buildGridXlsxFromUniverSnapshot } from '../src/shell/doc-editors/grid-univer/xlsx-export.ts';
import { xlsxColor, xlsxFontFamily } from '../src/shell/doc-editors/grid-format/xlsx-import.ts';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOioAAAAASUVORK5CYII=';
const resource = (data, name) => JSON.parse(data.resources?.find(r => r.name === name)?.data ?? '{}');
const sheetOf = data => data.sheets[data.sheetOrder[0]];
const rules = (data, name) => resource(data, name)[data.sheetOrder[0]] ?? [];
async function imported(bytes) {
  const sheets = await loadGridFile(new File([bytes], 'styled.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  return gridSheetsToUniverSnapshot(sheets, { id: 'test-wb', name: 'Styled' }).data;
}
async function fixture() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Design', { properties: { tabColor: { theme: 4, tint: .25 }, defaultRowHeight: 18, defaultColWidth: 10 }, views: [{ state: 'frozen', xSplit: 1, ySplit: 2, showGridLines: false, zoomScale: 125 }] });
  ws.getCell('A1').value = 'Banner';
  ws.getCell('A1').font = { name: 'Noto Serif CJK SC', size: 24, bold: true, italic: true, underline: 'double', strike: true, color: { theme: 4, tint: .4 } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { theme: 5, tint: -.25 } };
  ws.getCell('A1').border = { top: { style: 'mediumDashed', color: { theme: 4 } }, bottom: { style: 'double', color: { argb: 'FF001122' } }, left: { style: 'thin', color: { indexed: 3 } }, right: { style: 'thick', color: { theme: 5, tint: .5 } } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, indent: 2, textRotation: 15 };
  ws.mergeCells('A1:C2');
  ws.getColumn(1).width = 23.5;
  ws.getColumn(3).hidden = true;
  ws.getRow(1).height = 36;
  ws.getRow(7).height = 28;
  ws.getRow(7).hidden = true;
  ws.getCell('A3').value = 1234.5; ws.getCell('A3').numFmt = '$#,##0.00';
  ws.getCell('B3').value = new Date('2026-11-18T12:00:00Z'); ws.getCell('B3').numFmt = 'yyyy-mm-dd hh:mm';
  ws.getCell('C3').value = { formula: 'A3*2', result: 2469 }; ws.getCell('C3').numFmt = '0.00';
  ws.getCell('D3').value = '007'; ws.getCell('E3').value = true;
  ws.getCell('A4').value = { text: 'Ocean', hyperlink: 'https://example.com/ocean' };
  ws.getCell('B4').value = { text: 'Header', hyperlink: "#'Design'!A1" };
  ws.getCell('A5').value = 'Approved'; ws.getCell('A6').value = 'Declined';
  for (const address of ['A5', 'A6']) ws.getCell(address).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Approved,Declined"'] };
  for (const [text, color] of [['Approved', 'FF00AA00'], ['Declined', 'FFCC0000']]) ws.addConditionalFormatting({ ref: 'A5:A6', rules: [{ type: 'cellIs', operator: 'equal', formulae: [`"${text}"`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: color } } } }] });
  ws.getCell('B5').value = 20; ws.getCell('B6').value = 80;
  ws.addConditionalFormatting({ ref: 'B5:B6', rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['50'], stopIfTrue: true, style: { font: { bold: true, color: { theme: 5 } } } }] });
  ws.addConditionalFormatting({ ref: 'C5:C6', rules: [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'max' }], color: [{ theme: 4 }, { argb: 'FF00FF00' }] }] });
  ws.addConditionalFormatting({ ref: 'D5:D6', rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF3366CC' }, gradient: false, showValue: true }] });
  const image = wb.addImage({ base64: png, extension: 'png' });
  ws.addImage(image, { tl: { col: 4, row: 0 }, br: { col: 7, row: 2 }, editAs: 'twoCell' });
  ws.addImage(image, { tl: { col: 1, row: 5 }, br: { col: 2, row: 6 }, editAs: 'oneCell' });
  wb.definedNames.add("'Design'!$A$3", 'Budget');
  const other = wb.addWorksheet('Hidden'); other.state = 'hidden'; other.getCell('D4').value = 'offset';
  const files = unzipSync(new Uint8Array(await wb.xlsx.writeBuffer()));
  // ExcelJS does not write stopIfTrue. Add the standard OOXML attribute to the fixture.
  files['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace(/(<cfRule[^>]*priority="3")/, '$1 stopIfTrue="1"'));
  // The fixture changes its actual theme, rather than assuming Office's default theme.
  files['xl/theme/theme1.xml'] = strToU8(strFromU8(files['xl/theme/theme1.xml']).replace('4F81BD', '204060').replace('C0504D', 'C08040'));
  return zipSync(files);
}

async function roundTrip() {
  const before = await imported(await fixture());
  const output = await buildGridXlsxFromUniverSnapshot(before);
  return { before, after: await imported(await output.blob.arrayBuffer()), output };
}

test('theme colours use workbook palette, HSL tint, indexed colours; fonts map to available manifest families', () => {
  assert.equal(xlsxColor({ theme: 4, tint: .4 }, ['FFFFFF','000000','FFFFFF','000000','204060']), '#538cc6');
  assert.equal(xlsxColor({ indexed: 3 }), '#00ff00');
  assert.equal(xlsxFontFamily('Noto Serif CJK SC'), 'Noto Serif SC');
  assert.equal(xlsxFontFamily('Arial'), 'Noto Sans');
  assert.equal(xlsxFontFamily('Times New Roman'), 'Noto Serif');
});

test('native import preserves fonts, theme fills, borders, alignment, indent, numeric/date formats and types', async () => {
  const data = await imported(await fixture()), ws = sheetOf(data), style = ws.cellData[0][0].s;
  assert.equal(style.ff, 'Noto Serif SC'); assert.equal(style.fs, 24);
  assert.equal(style.bl, 1); assert.equal(style.it, 1); assert.equal(style.ul.t, 10); assert.equal(style.st.s, 1);
  assert.equal(style.cl.rgb, xlsxColor({ theme: 4, tint: .4 }, ['FFFFFF','000000','FFFFFF','000000','204060']));
  assert.equal(style.bg.rgb, '#906030');
  assert.equal(style.bd.t.s, 9); assert.equal(style.bd.b.s, 7); assert.equal(style.bd.l.cl.rgb, '#00ff00');
  assert.equal(style.ht, 2); assert.equal(style.vt, 2); assert.equal(style.tb, 3); assert.equal(style.tr.a, 15);
  assert.equal(ws.cellData[0][0].p.body.paragraphs[0].paragraphStyle.indentStart.v, 48);
  assert.equal(ws.cellData[2][0].s.n.pattern, '$#,##0.00');
  assert.equal(ws.cellData[2][1].s.n.pattern, 'yyyy-mm-dd hh:mm');
  assert.equal(ws.cellData[2][1].v, 46344.5);
  assert.equal(ws.cellData[2][2].f, '=A3*2'); assert.equal(ws.cellData[2][2].v, 2469);
  assert.equal(ws.cellData[2][3].v, '007'); assert.equal(ws.cellData[2][3].t, 1);
  assert.equal(ws.cellData[2][4].t, 3);
});

test('native import retains sheet layout, merged banner, hidden cells/sheet and offset coordinates', async () => {
  const data = await imported(await fixture()), ws = sheetOf(data);
  assert.deepEqual(ws.mergeData, [{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 2 }]);
  assert.equal(ws.columnData[0].w, 169.5); assert.equal(ws.columnData[2].hd, 1);
  assert.equal(ws.rowData[0].h, 48); assert.equal(ws.rowData[6].hd, 1); assert.equal(ws.rowData[6].h, 28/.75);
  assert.deepEqual(ws.freeze, { xSplit: 1, ySplit: 2, startRow: 2, startColumn: 1 });
  assert.equal(ws.showGridlines, 0); assert.equal(ws.zoomRatio, 1.25);
  assert.equal(ws.tabColor, '#3870a8');
  const hidden = data.sheets[data.sheetOrder[1]];
  assert.equal(hidden.hidden, 1); assert.equal(hidden.cellData[3][3].v, 'offset');
});

test('validation lists recover conditional option colours and supported conditional formats', async () => {
  const data = await imported(await fixture());
  const dv = rules(data, 'SHEET_DATA_VALIDATION_PLUGIN');
  assert.equal(dv[0].type, 'list'); assert.equal(dv[0].formula1, 'Approved,Declined');
  assert.equal(dv[0].formula2, '#00aa00,#cc0000'); assert.equal(dv[0].renderMode, 0);
  assert.equal(dv[0].ranges.length, 2);
  const cf = rules(data, 'SHEET_CONDITIONAL_FORMATTING_PLUGIN');
  assert.deepEqual(cf.map(c => c.rule.type), ['highlightCell','highlightCell','highlightCell','colorScale','dataBar']);
  assert.equal(cf[2].rule.value, 50); assert.equal(cf[2].stopIfTrue, true);
  assert.equal(cf[3].rule.config[0].color, '#204060'); assert.equal(cf[4].rule.config.positiveColor, '#3366cc');
});

test('links, in-cell and floating images, and defined names are native editor data', async () => {
  const data = await imported(await fixture()), ws = sheetOf(data);
  assert.equal(ws.cellData[3][0].p.body.customRanges[0].properties.url, 'https://example.com/ocean');
  assert.equal(ws.cellData[3][1].p.body.customRanges[0].properties.url, `#gid=${data.sheetOrder[0]}&range=A1`);
  assert.equal(Object.values(ws.cellData[5][1].p.drawings)[0].source, png);
  const drawing = rules(data, 'SHEET_DRAWING_PLUGIN');
  assert.equal(drawing.order.length, 1); assert.equal(drawing.data[drawing.order[0]].unitId, 'test-wb');
  assert.deepEqual(drawing.data[drawing.order[0]].sheetTransform.from, { row: 0, column: 4, rowOffset: 0, columnOffset: 0 });
  assert.equal(Object.values(resource(data, 'SHEET_DEFINED_NAME_PLUGIN'))[0].name, 'Budget');
});

test('import → UDL XLSX export → import retains all supported styles and layout', async () => {
  const { before, after } = await roundTrip(), a = sheetOf(before), b = sheetOf(after);
  assert.deepEqual(b.cellData[0][0].s, a.cellData[0][0].s);
  assert.deepEqual(b.cellData[0][0].p.body.paragraphs, a.cellData[0][0].p.body.paragraphs);
  for (const [r,c] of [[2,0],[2,1],[2,2],[2,3],[2,4]]) assert.deepEqual(b.cellData[r][c], a.cellData[r][c]);
  for (const key of ['columnData','rowData','mergeData','freeze','tabColor','defaultColumnWidth','defaultRowHeight','showGridlines','zoomRatio']) assert.deepEqual(b[key], a[key], key);
});

test('import → export → import retains validations, conditional formats, links, names and images', async () => {
  const { before, after } = await roundTrip(), a = sheetOf(before), b = sheetOf(after);
  const normalize = items => JSON.parse(JSON.stringify(items).replace(/xlsx-(?:cf|dv)-\d+/g, 'id'));
  assert.deepEqual(normalize(rules(after, 'SHEET_CONDITIONAL_FORMATTING_PLUGIN')), normalize(rules(before, 'SHEET_CONDITIONAL_FORMATTING_PLUGIN')));
  const dv = data => rules(data,'SHEET_DATA_VALIDATION_PLUGIN').map(r => ({ type:r.type, formula1:r.formula1, formula2:r.formula2, renderMode:r.renderMode, ranges:r.ranges }));
  assert.deepEqual(dv(after), dv(before));
  for (const c of [0,1]) assert.deepEqual(JSON.stringify(b.cellData[3][c].p.body).replaceAll(after.sheetOrder[0], "sheet"), JSON.stringify(a.cellData[3][c].p.body).replaceAll(before.sheetOrder[0], "sheet"));
  assert.equal(Object.values(b.cellData[5][1].p.drawings)[0].source, png);
  assert.deepEqual(Object.values(resource(after,'SHEET_DEFINED_NAME_PLUGIN')), Object.values(resource(before,'SHEET_DEFINED_NAME_PLUGIN')));
  const draw = data => Object.values(rules(data,'SHEET_DRAWING_PLUGIN').data).map(d => ({source:d.source, sheetTransform:d.sheetTransform}));
  assert.deepEqual(draw(after),draw(before));
});

test('sparse sheets keep cells beyond the legacy projection cap with absolute coordinates and formula types', async () => {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Sparse');
  ws.getCell('J10005').value = 'outside'; ws.getCell('J10005').font = { size: 19 };
  ws.getCell('JA1').value = { formula: '1+2', result: 3 };
  const data = await imported(await wb.xlsx.writeBuffer()), sheet = sheetOf(data);
  assert.equal(sheet.cellData[10004][9].v, 'outside'); assert.equal(sheet.cellData[10004][9].s.fs, 19);
  assert.equal(sheet.cellData[0][260].f, '=1+2'); assert.equal(sheet.columnCount, 261);
});

test('modern Excel rich-value in-cell pictures restore renderable Univer documents and survive XLSX download', async () => {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Rich image');
  ws.getCell('C3').value = { error: '#VALUE!' }; ws.getRow(3).height = 40;
  const image = wb.addImage({ base64: png, extension: 'png' }); ws.addImage(image,'E5:F6');
  const files = unzipSync(new Uint8Array(await wb.xlsx.writeBuffer()));
  const drawingMedia = Object.keys(files).find(path => path.startsWith('xl/media/') && path.endsWith('.png'));
  files['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace('<c r="C3"', '<c vm="1" r="C3"'));
  files['xl/metadata.xml'] = strToU8('<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata"><metadataTypes><metadataType name="XLRICHVALUE"/></metadataTypes><futureMetadata name="XLRICHVALUE"><bk><extLst><ext><xlrd:rvb i="0"/></ext></extLst></bk></futureMetadata><valueMetadata><bk><rc t="1" v="0"/></bk></valueMetadata></metadata>');
  files['xl/richData/rdrichvaluestructure.xml'] = strToU8('<rvStructures><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>');
  files['xl/richData/rdrichvalue.xml'] = strToU8('<rvData><rv s="0"><v>0</v><v>5</v></rv></rvData>');
  files['xl/richData/richValueRel.xml'] = strToU8('<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><rel r:id="rId1"/></richValueRels>');
  files['xl/richData/_rels/richValueRel.xml.rels'] = strToU8(`<Relationships><Relationship Id="rId1" Target="../media/${drawingMedia.split('/').at(-1)}"/></Relationships>`);
  const before = await imported(zipSync(files)), cell = sheetOf(before).cellData[2][2];
  assert.equal(cell.v, undefined); assert.equal(cell.t, 1);
  const imageData = Object.values(cell.p.drawings)[0];
  assert.equal(imageData.source, png); assert.equal(imageData.layoutType, 0);
  assert.equal(imageData.docTransform.size.width, imageData.docTransform.size.height, 'square picture keeps its aspect ratio');
  assert.ok(imageData.docTransform.size.height <= 40/.75);
  assert.equal(cell.p.documentStyle.marginTop, 0); assert.equal(cell.p.body.customBlocks[0].startIndex, 0);
  const { blob } = await buildGridXlsxFromUniverSnapshot(before), after = await imported(await blob.arrayBuffer());
  assert.equal(Object.values(sheetOf(after).cellData[2][2].p.drawings)[0].source, png);
});

test('all eight cell-value operators survive import/export, while cross-cell expressions retain formula semantics', async () => {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Rules');
  const ops = ['equal','notEqual','greaterThan','lessThan','greaterThanOrEqual','lessThanOrEqual','between','notBetween'];
  ops.forEach((operator, index) => ws.addConditionalFormatting({ref:`A${index+1}`,rules:[{type:'cellIs',operator,formulae:operator.includes('etween') ? ['1','9'] : ['5'],style:{font:{bold:true}}}]}));
  ws.addConditionalFormatting({ref:'B1:B8', rules:[{type:'expression',formulae:['A1="Approved"'],style:{font:{bold:true}}}]});
  const before = await imported(await wb.xlsx.writeBuffer()), specs = rules(before,'SHEET_CONDITIONAL_FORMATTING_PLUGIN');
  assert.deepEqual(specs.slice(0,8).map(r=>r.rule.operator),ops);
  assert.equal(specs[8].rule.subType,'formula');
  const { blob } = await buildGridXlsxFromUniverSnapshot(before), after = await imported(await blob.arrayBuffer());
  assert.deepEqual(rules(after,'SHEET_CONDITIONAL_FORMATTING_PLUGIN'),specs);
});

test('named lists stay dynamic; scoped names, formula names and hidden constant names survive', async () => {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Names');
  ws.getCell('A1').value = 'Approved'; ws.getCell('A2').value = 'Declined';
  wb.definedNames.add('Names!$A$1:$A$2','Allowed');
  ws.getCell('B1').dataValidation = { type:'list',formulae:['Allowed'] };
  const files = unzipSync(new Uint8Array(await wb.xlsx.writeBuffer()));
  files['xl/workbook.xml'] = strToU8(strFromU8(files['xl/workbook.xml']).replace('</definedNames>','<definedName name="Local" localSheetId="0" comment="Scoped &amp; useful">Names!$B$1</definedName><definedName name="Tax" hidden="1">0.15</definedName><definedName name="Twice">SUM(Names!$A$1:$A$2)*2</definedName></definedNames>'));
  const before = await imported(zipSync(files)), defs = Object.values(resource(before,'SHEET_DEFINED_NAME_PLUGIN'));
  assert.equal(rules(before,'SHEET_DATA_VALIDATION_PLUGIN')[0].formula1,'=Allowed');
  assert.equal(defs.find(n=>n.name==='Local').localSheetId,before.sheetOrder[0]);
  assert.equal(defs.find(n=>n.name==='Tax').hidden,true);
  const {blob} = await buildGridXlsxFromUniverSnapshot(before), after = await imported(await blob.arrayBuffer());
  const norm = data => Object.values(resource(data,'SHEET_DEFINED_NAME_PLUGIN')).map(n=>({...n,...(n.localSheetId?{localSheetId:'sheet'}:{})}));
  assert.deepEqual(norm(after),norm(before));
  assert.equal(rules(after,'SHEET_DATA_VALIDATION_PLUGIN')[0].formula1,'=Allowed');
});

test('rich-text run fonts, row/column styles, blank styled cells and diagonal borders survive download', async () => {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Rich');
  ws.getCell('A1').value = {richText:[{text:'Hello',font:{name:'Arial',size:18,bold:true}},{text:'世界',font:{name:'Noto Serif CJK TC',size:12,italic:true,color:{theme:5}}}]};
  ws.getCell('B3').font = {size:20}; ws.getCell('C3').border = {diagonal:{up:true,down:true,style:'dashed',color:{argb:'FFCC0022'}}};
  ws.getRow(5).font = {name:'Arial',bold:true}; ws.getRow(5).getCell(1); ws.getCell('B5').value='Override'; ws.getCell('B5').font={name:'Noto Serif',italic:true}; ws.getColumn(4).numFmt = '0.0%';
  const before = await imported(await wb.xlsx.writeBuffer()), a = sheetOf(before);
  assert.equal(a.cellData[0][0].p.body.textRuns[1].ts.ff,'Noto Serif TC');
  assert.equal(a.cellData[2][1].s.fs,20); assert.equal(a.cellData[2][2].s.bd.tl_br.s,4);
  assert.equal(a.rowData[4].s.bl,1); assert.equal(a.columnData[3].s.n.pattern,'0.0%');
  assert.equal(a.cellData[4][1].s.bl,0,'explicit normal cell font overrides a bold row');
  const {blob} = await buildGridXlsxFromUniverSnapshot(before), after = await imported(await blob.arrayBuffer()), b=sheetOf(after);
  assert.deepEqual(b.cellData[0][0].p.body,a.cellData[0][0].p.body);
  assert.deepEqual(b.cellData[2][1].s,a.cellData[2][1].s); assert.deepEqual(b.cellData[2][2].s,a.cellData[2][2].s);
  assert.deepEqual(b.rowData,a.rowData); assert.deepEqual(b.columnData,a.columnData);
  assert.deepEqual(b.cellData[4][1].s,a.cellData[4][1].s, "row styles do not overwrite explicit cell styles");
});

test('1904 date workbooks normalize dates and cached formula dates to the editor epoch', async () => {
  const wb = new ExcelJS.Workbook(); wb.properties.date1904=true;
  const ws=wb.addWorksheet('Dates'); ws.getCell('A1').value=new Date('2026-11-18T00:00:00Z'); ws.getCell('A1').numFmt='yyyy-mm-dd';
  ws.getCell('B1').value={formula:'A1+1',result:new Date('2026-11-19T00:00:00Z')}; ws.getCell('B1').numFmt='yyyy-mm-dd';
  const before=await imported(await wb.xlsx.writeBuffer()), a=sheetOf(before);
  assert.equal(a.cellData[0][0].v,46344); assert.equal(a.cellData[0][1].v,46345);
  const {blob}=await buildGridXlsxFromUniverSnapshot(before), after=await imported(await blob.arrayBuffer());
  assert.deepEqual(sheetOf(after).cellData,a.cellData);
});

test('floating picture offsets use EMU pixels with custom cell sizes and retain their anchor mode', async () => {
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Images');ws.getColumn(1).width=30;ws.getRow(1).height=50;
  const image=wb.addImage({base64:png,extension:'png'});
  ws.addImage(image,{tl:{nativeCol:0,nativeRow:0,nativeColOff:95250,nativeRowOff:190500},br:{nativeCol:2,nativeRow:3,nativeColOff:28575,nativeRowOff:38100},editAs:'oneCell'});
  const before=await imported(await wb.xlsx.writeBuffer()), drawing=Object.values(rules(before,'SHEET_DRAWING_PLUGIN').data)[0];
  assert.deepEqual(drawing.sheetTransform.from,{row:0,column:0,rowOffset:20,columnOffset:10});assert.equal(drawing.anchorType,'0');
  assert.equal(drawing.transform.left,10);assert.equal(drawing.transform.top,20);
  const {blob}=await buildGridXlsxFromUniverSnapshot(before),after=await imported(await blob.arrayBuffer()), next=Object.values(rules(after,'SHEET_DRAWING_PLUGIN').data)[0];
  assert.deepEqual(next.sheetTransform,drawing.sheetTransform);assert.deepEqual(next.transform,drawing.transform);assert.equal(next.anchorType,'0');
});

test('hidden rows without cells and row style-only metadata are not omitted by ExcelJS model filtering', async () => {
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Rows');ws.getCell('A1').value='Visible';
  const files=unzipSync(new Uint8Array(await wb.xlsx.writeBuffer()));
  files['xl/worksheets/sheet1.xml']=strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace('</sheetData>','<row r="12" hidden="1"/></sheetData>'));
  const before=await imported(zipSync(files));assert.equal(sheetOf(before).rowData[11].hd,1);
  const {blob}=await buildGridXlsxFromUniverSnapshot(before),after=await imported(await blob.arrayBuffer());
  assert.equal(sheetOf(after).rowData[11].hd,1);
});

test('font loader includes cell, inherited row/column and mixed run script families after reopening', async () => {
  const {gridSnapshotFontTexts}=await import('../src/shell/doc-editors/grid-univer/import-fonts.ts');
  const snapshot = { sheets: { s: {
    columnData: { 0: { s: { ff: 'Noto Sans SC' } } },
    rowData: { 1: { s: { ff: 'Noto Serif', bl: 1 } } },
    cellData: {
      0: {
        0: { v: '汉字' },
        1: { p: { body: { dataStream: 'العربية\r\n', textRuns: [{ st: 0, ed: 7, ts: { ff: 'Noto Sans Arabic' } }] } } },
      },
      1: { 0: { v: 'Totals' } },
    },
  } } };
  const fonts=gridSnapshotFontTexts(snapshot);
  assert.ok(fonts.some(f=>f.fontFamily==='Noto Sans SC'&&f.text==='汉字'));
  assert.ok(fonts.some(f=>f.fontFamily==='Noto Serif'&&f.fontWeight===700&&f.text.includes('T')));
  assert.ok(fonts.some(f=>f.fontFamily==='Noto Sans Arabic'&&f.text.includes('ع')));
});

test('image-only worksheets expand native dimensions to include distant drawings and column layout', async () => {
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Image only');
  ws.getColumn(35).width=25;
  const image=wb.addImage({base64:png,extension:'png'});
  ws.addImage(image,{tl:{col:26,row:99},br:{col:29,row:102},editAs:'twoCell'});
  const before=await imported(await wb.xlsx.writeBuffer()),a=sheetOf(before);
  assert.ok(a.rowCount>=103);assert.ok(a.columnCount>=35);
  assert.equal(a.columnData[34].w,180);
  const drawing=Object.values(rules(before,'SHEET_DRAWING_PLUGIN').data)[0];
  const {blob}=await buildGridXlsxFromUniverSnapshot(before),after=await imported(await blob.arrayBuffer());
  assert.deepEqual(Object.values(rules(after,'SHEET_DRAWING_PLUGIN').data)[0].sheetTransform,drawing.sheetTransform);
  assert.ok(sheetOf(after).rowCount>=103);assert.ok(sheetOf(after).columnCount>=35);
});
