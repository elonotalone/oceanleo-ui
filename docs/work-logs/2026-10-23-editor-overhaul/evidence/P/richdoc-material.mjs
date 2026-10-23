import assert from 'node:assert/strict';
import { guardProduction, setLocale, openEditorByItem } from '../V01/scenarios/_v01-lib.mjs';

export default async function ({ page, context, helpers, log, shot }) {
  await guardProduction(context, log);
  await setLocale(context, 'en');
  const id = '80a3e686-d78e-4a83-bf53-387ca50cb0b6';
  const title = '[W08] 栏点测.docx';
  assert.equal(await openEditorByItem(page, helpers, title, log, { id }), true);
  const images = () => page.locator('.oleo-richdoc img');
  const before = await images().count();
  await page.locator('.oleo-richdoc').first().click();
  await page.keyboard.press('Control+End');
  await page.locator('[data-workspace-library-panel=materials]').first().click();
  const shelf = page.locator('[data-inline-insertable-materials]');
  const card = shelf.locator('[draggable=true]').first();
  await card.waitFor({ timeout: 60000 });
  log('material', (await card.innerText()).slice(0,100));
  await card.click();
  await page.locator('[data-material-insert-feedback=ok]').waitFor({ timeout: 90000 });
  await page.waitForFunction(count => document.querySelectorAll('.oleo-richdoc img').length === count, before+1, { timeout: 30000 });
  assert.equal(new URL(page.url()).searchParams.get('item'), id, 'insertion does not navigate away');
  await page.locator('[data-global-history-undo]').first().click();
  await page.waitForFunction(count => document.querySelectorAll('.oleo-richdoc img').length === count, before);
  await page.locator('[data-global-history-redo]').first().click();
  await page.waitForFunction(count => document.querySelectorAll('.oleo-richdoc img').length === count, before+1);
  await page.waitForFunction(() => document.querySelector('[data-workspace-save-launcher]')?.getAttribute('data-save-state') === 'saved', null, { timeout: 90000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await openEditorByItem(page, helpers, title, log, { id }), true);
  await page.waitForFunction(count => {
    const imgs = [...document.querySelectorAll('.oleo-richdoc img')];
    return imgs.length === count && imgs.every(img => img.complete && img.naturalWidth > 0);
  }, before+1, { timeout: 60000 });
  await shot('reloaded-material');
  log('PASS real shelf insertion, undo, redo, save and reload', before, before+1);
}
