import assert from 'node:assert/strict';
import { guardProduction, setLocale, openEditorByItem, V01_ITEMS } from '../V01/scenarios/_v01-lib.mjs';

export default async function ({ page, context, helpers, log, shot }) {
  await guardProduction(context, log);
  await setLocale(context, 'en');
  const original = V01_ITEMS['[V01] sample.txt'];
  assert.equal(await openEditorByItem(page, helpers, '[V01] sample.txt', log), true);
  await page.locator('[data-workspace-library-panel=mine]').first().click();
  const items = page.locator('[data-inline-editor-mine-item]');
  await items.first().waitFor({ timeout: 60000 });
  const list = await items.evaluateAll(nodes => nodes.map(n => ({ id:n.getAttribute('data-inline-editor-mine-item'), title:n.getAttribute('title') })));
  assert.ok(list.length > 0);
  const target = list.find(item => item.id && !item.id.includes(original));
  assert.ok(target, 'My library contains another owned file');
  log('loaded', list.length, 'switch-target', JSON.stringify(target));
  await page.locator('[data-inline-editor-mine-item]').filter({ hasText: target.title }).first().click();
  await page.waitForFunction(oldId => {
    const id = new URL(location.href).searchParams.get('item');
    return id && id !== oldId;
  }, original, { timeout: 90000 });
  assert.equal(await page.locator('[data-inline-editor-mine-switch-error]').count(), 0);
  log('PASS switched', new URL(page.url()).searchParams.get('item'));
  await shot('mine-switched');
}
