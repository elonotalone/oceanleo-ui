import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { loadGridFile } from '../src/shell/doc-editors/grid-model.ts';
import { gridSheetsToUniverSnapshot } from '../src/shell/doc-editors/grid-univer/snapshot.ts';
import { buildGridXlsxFromUniverSnapshot } from '../src/shell/doc-editors/grid-univer/xlsx-export.ts';
import { xlsxWithoutNoteRelationships } from '../src/shell/doc-editors/grid-format/xlsx-import.ts';

const fixture = new URL('./fixtures/grid-comments.xlsx', import.meta.url);
const noteText = cell => typeof cell.note === 'string' ? cell.note : cell.note?.texts?.map(run => run.text).join('');
const notes = data => JSON.parse(data.resources?.find(r => r.name === 'SHEET_NOTE_PLUGIN')?.data ?? '{}');
async function imported(bytes) {
  const sheets = await loadGridFile(new File([bytes], 'comments.xlsx'));
  assert.ok(sheets.every(s => s.xlsxImport), 'every sheet must retain native cells, formulas, styles and merges');
  return gridSheetsToUniverSnapshot(sheets, { id: 'comments', name: 'Notes' }).data;
}
async function roundTrip(bytes, expected) {
  const before = await imported(bytes);
  const importedNotes = notes(before);
  for (const [sheetIndex, row, col, text] of expected) {
    const id = before.sheetOrder[sheetIndex];
    assert.equal(importedNotes[id]?.[row]?.[col]?.note, text);
    assert.ok(before.sheets[id].rowCount > row);
    assert.ok(before.sheets[id].columnCount > col);
  }
  // Compare the whole native projection against an otherwise identical workbook
  // without note relationships: repairing notes must not lose cells or styling.
  const archive = unzipSync(new Uint8Array(bytes));
  for (const path of Object.keys(archive).filter(p => /^xl\/worksheets\/_rels\/.+\.rels$/.test(p))) {
    archive[path] = strToU8(strFromU8(archive[path]).replace(/<Relationship\b[^>]*Type=["'][^"']*\/(?:comments|vmlDrawing)["'][^>]*\/>/g, ''));
  }
  const baseline = await imported(zipSync(archive));
  for (let i = 0; i < before.sheetOrder.length; i++) {
    const actual = before.sheets[before.sheetOrder[i]], clean = baseline.sheets[baseline.sheetOrder[i]];
    for (const key of ['cellData', 'rowData', 'columnData', 'mergeData']) assert.deepEqual(actual[key], clean[key], key);
  }
  const exported = await buildGridXlsxFromUniverSnapshot(before);
  assert.deepEqual(exported.dropped, []);
  const output = Buffer.from(await exported.blob.arrayBuffer());
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(output);
  for (const [sheetIndex, row, col, text] of expected) {
    const cell = reopened.worksheets[sheetIndex].getCell(row + 1, col + 1);
    // ExcelJS attaches notes only to cells present in worksheet XML. Blank-cell
    // notes are valid OOXML; check their text below through our native reader.
    if (cell.value !== null) assert.equal(noteText(cell), text);
  }
  const after = await imported(output);
  for (let i = 0; i < before.sheetOrder.length; i++) {
    assert.deepEqual(notes(after)[after.sheetOrder[i]], importedNotes[before.sheetOrder[i]], 'notes survive export and re-import');
  }
  return before;
}

test('ExcelJS 4.4 reproduces the valid nested/absolute comment relationship failure', async () => {
  await assert.rejects(new ExcelJS.Workbook().xlsx.load(await readFile(fixture)), /reading 'comments'/);
});
for (const target of ['/xl/comments/comment1.xml', '../comments/comment1.xml', '../comments1.xml']) {
  test(`cell notes survive native import/export with ${target}`, async () => {
    const archive = unzipSync(await readFile(fixture));
    const rel = 'xl/worksheets/_rels/sheet1.xml.rels';
    archive[rel] = strToU8(strFromU8(archive[rel]).replace('/xl/comments/comment1.xml', target));
    if (target === '../comments1.xml') { archive['xl/comments1.xml'] = archive['xl/comments/comment1.xml']; delete archive['xl/comments/comment1.xml']; }
    const data = await roundTrip(zipSync(archive), [[0, 1, 1, '用量 < 30 & 保留\n第二行'], [0, 29, 3, '空单元格备注']]);
    const sheet = data.sheets[data.sheetOrder[0]];
    assert.equal(sheet.cellData[1][1].f, '=A2*2');
    assert.equal(sheet.cellData[0][0].s.bg.rgb, '#123456');
    assert.equal(sheet.mergeData.length, 1);
  });
}

test('prefixed rich-text comments without VML retain text, entities and coordinates', async () => {
  const archive = unzipSync(await readFile(fixture));
  archive['xl/comments/comment1.xml'] = strToU8(`<s:comments xmlns:s="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><s:authors><s:author>Author</s:author></s:authors><s:commentList><s:comment ref="B2" authorId="0"><s:text><s:r><s:rPr><s:b/></s:rPr><s:t>用量 &lt; 30 &amp; </s:t></s:r><s:r><s:t>保留&#10;第二行</s:t></s:r></s:text></s:comment></s:commentList></s:comments>`);
  const rel = 'xl/worksheets/_rels/sheet1.xml.rels';
  archive[rel] = strToU8(strFromU8(archive[rel]).replace(/<Relationship\b[^>]*\/vmlDrawing[^>]*\/>/g, ''));
  await roundTrip(zipSync(archive), [[0, 1, 1, '用量 < 30 & 保留\n第二行']]);
});

test('ExcelJS input adaptation changes only note relationships in a disposable copy', async () => {
  const bytes = await readFile(fixture);
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const archive = unzipSync(bytes);
  const rel = 'xl/worksheets/_rels/sheet1.xml.rels';
  const originalRel = strFromU8(archive[rel]);
  archive[rel] = strToU8(originalRel.replace('</Relationships>', '<Relationship Id="link" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/" TargetMode="External"/></Relationships>'));
  const original = zipSync(archive);
  const clean = unzipSync(new Uint8Array(xlsxWithoutNoteRelationships(archive, source)));
  assert.match(strFromU8(clean[rel]), /Id="link"/);
  assert.doesNotMatch(strFromU8(clean[rel]), /relationships\/(?:comments|vmlDrawing)/);
  for (const path of Object.keys(archive).filter(p => p !== rel)) assert.deepEqual(clean[path], archive[path], path);
  assert.deepEqual(zipSync(archive), original, 'original parts are untouched');
  assert.equal(xlsxWithoutNoteRelationships(clean, source), source, 'workbooks without note relationships use original bytes');
});

// Production evidence is opt-in so the committed regression stays self-contained.
const root = process.env.FXD_SHEET_FIXTURE_ROOT;
for (const [name, row, col, text] of [
  ['01-studio-assets', 3, 8, '原值×已用月数÷36，累计折旧不超过原值；不含税务口径。'],
  ['03-bakery-batches', 4, 4, '标签到期日，不等于开封后的二次效期。基准日改动后，天数与状态会重算。'],
  ['04-contract-payments', 4, 5, '仅填写当前下一付款节点的日期；尚欠为合同总余额，付款前仍需核对该节点金额与验收条件。'],
]) {
  test(`SH04 ${name}: reproduce ExcelJS failure then retain all native cells/styles and notes`, { skip: !root }, async () => {
    const archive = unzipSync(await readFile(`${root}/${name}/sheet.xlsx`));
    // Match PUB's existing spreadsheet-namespace normalization before import.
    for (const [path, bytes] of Object.entries(archive)) {
      if (!path.endsWith('.xml')) continue;
      let xml = strFromU8(bytes);
      const prefix = /^\s*(?:<\?xml[^>]*>\s*)?<([\w]+):[\w]+\b/.exec(xml)?.[1];
      const declaration = `xmlns:${prefix}="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`;
      if (prefix && xml.includes(declaration) && !/\sxmlns=/.test(xml)) {
        xml = xml.replace(new RegExp(`(<\\/?)(?:${prefix}):`, 'g'), '$1').replaceAll(declaration, 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
        archive[path] = strToU8(xml);
      }
    }
    const bytes = zipSync(archive);
    await assert.rejects(new ExcelJS.Workbook().xlsx.load(bytes), /reading 'comments'/);
    await roundTrip(bytes, [[1, row, col, text]]);
  });
}
