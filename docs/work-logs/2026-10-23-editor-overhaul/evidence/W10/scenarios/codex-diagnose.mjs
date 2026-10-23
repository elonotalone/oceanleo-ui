import { openGrid, clickCell } from './w10-grid.mjs';
export default async function ({ page, log, shot, helpers, args }) {
  page.on('pageerror', error => log('STACK', String(error.stack).slice(0, 6500)));
  page.on('response', async response => {
    if (!response.ok()) return;
    const content = response.headers()['content-type'] || '';
    if ((!content.includes('json') && !/artifact-access|artifact-renditions/.test(response.url())) || /snapshot/.test(response.url())) return;
    const body = await response.json().catch(() => null);
    if (/\/v1\/artifacts\//.test(response.url()) && body && !body.schema) {
      const item = body.item || body.data || body;
      log('artifact-shape', JSON.stringify({ keys: Object.keys(body), itemKeys: Object.keys(item),
        metaKeys: Object.keys(item.meta || {}), schema: item.meta?.editor_project_schema }));
    }
    if (body?.schema?.includes?.('grid')) {
      const sheets = body.data?.sheets || {};
      log('project-shape', JSON.stringify({ schema: body.schema, sheetKeys: Object.keys(sheets),
        sheets: Object.values(sheets).map(sheet => ({ name: sheet.name,
          rowCount: sheet.rowCount, columnCount: sheet.columnCount,
          keys: Object.keys(sheet), cells: Object.entries(sheet.cellData || {}).slice(-5) })) }));
    }
  });
  await openGrid(page, helpers, args[0]);
  log('probe', await page.evaluate(() => JSON.stringify(globalThis.__oceanleoGridUniverPaint)));
  await shot('diagnose-open');
  await clickCell(page, 12, 4);
  if (args.includes('--type')) { await page.keyboard.type('W10diagnose'); await page.keyboard.press('Enter'); }
  await page.waitForTimeout(3000);
  await shot('diagnose-selected');
}
