import assert from 'node:assert/strict';
import path from 'node:path';
import { openPdf, firstPage } from '../W06/scenarios/_w06-lib.mjs';

export default async function ({ page, helpers, log, shot, outDir }) {
  await openPdf(page, helpers, log, '44811dab-4734-48ec-b640-266d7eb31f4b');
  await firstPage(page);
  const undo = page.locator('[data-global-history-undo]').first();
  const redo = page.locator('[data-global-history-redo]').first();
  assert.equal(await undo.isDisabled(), true, 'new viewer starts with no local history');
  await page.locator('[data-workspace-library-panel=materials]').first().click();
  const card = page.locator('[data-inline-insertable-materials] [draggable=true]').first();
  await card.waitFor({ timeout: 60000 });
  log('material', (await card.innerText()).slice(0,100));
  await card.click();
  await page.locator('[data-material-insert-feedback=ok]').waitFor({ timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector('[data-global-history-undo]')?.disabled);
  await undo.click();
  await page.waitForFunction(() => document.querySelector('[data-global-history-undo]')?.disabled && !document.querySelector('[data-global-history-redo]')?.disabled);
  await redo.click();
  await page.waitForFunction(() => !document.querySelector('[data-global-history-undo]')?.disabled);
  await page.waitForFunction(() => document.querySelector('[data-workspace-save-launcher]')?.getAttribute('data-save-state') === 'saved', null, { timeout: 90000 });
  await page.locator('[data-workspace-library-panel=materials]').first().click();
  await shot('material-redo-saved');
  await page.locator('[data-workspace-more-launcher]').first().click();
  const downloadMenu = page.getByRole('menuitem', { name: /^(Download|下载)/ }).first();
  await downloadMenu.hover();
  await downloadMenu.click().catch(() => {});
  const target = page.getByRole('menuitem', { name: /PDF/ }).last();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), target.click()]);
  const file = path.join(outDir, 'material.pdf');
  await download.saveAs(file);
  log('PASS native stamp insertion, undo/redo, confirmed save; downloaded for independent PDF inspection', file);
}
