import assert from 'node:assert/strict';
import { guardProduction, setLocale, openEditorByItem } from '../V01/scenarios/_v01-lib.mjs';

export default async function ({ page, context, helpers, log, shot }) {
  await guardProduction(context, log);
  await setLocale(context, 'en');
  const id = '03e7bab9-4fd8-401b-ac5f-cee1b319a184';
  const title = '[W09] sample.png';
  const revisions = [];
  page.on('response', r => {
    if (r.request().method() === 'POST' && /\/artifacts\/[^/]+\/revisions(?:\?|$)/.test(r.url())) {
      revisions.push(r.status()); log('revision', r.status());
    }
  });
  const open = async () => {
    assert.equal(await openEditorByItem(page, helpers, title, log, { id }), true);
    await page.locator('[data-editor-loading=false]').waitFor({ timeout: 90000 });
    await page.waitForTimeout(2500);
  };
  const canvas = () => page.locator('[data-editor-loading] canvas.lower-canvas').first();
  const select = async () => {
    const box = await canvas().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);
  };
  // Compare source-relative colour samples, not PNG bytes from a viewport
  // canvas: fit-to-stage rounding can legitimately move the picture by 1px.
  const pixels = () => page.evaluate(() => {
    const stage = document.querySelector('[data-editor-loading]');
    const read = side => JSON.parse(stage.getAttribute(`data-editor-control-${side}`));
    const [ml, mr, mt, mb] = ['ml','mr','mt','mb'].map(read);
    const c = stage.querySelector('canvas.lower-canvas');
    const r = c.getBoundingClientRect();
    const ctx = c.getContext('2d', { willReadFrequently:true });
    return [0.1,0.3,0.5,0.7,0.9].flatMap(y => [0.08,0.3,0.5,0.7,0.92].map(x => {
      const px = Math.round((ml.x + (mr.x-ml.x)*x-r.left)*c.width/r.width);
      const py = Math.round((mt.y + (mb.y-mt.y)*y-r.top)*c.height/r.height);
      return [...ctx.getImageData(px,py,1,1).data].slice(0,3).map(v => Math.round(v/32));
    }));
  });
  await open();
  assert.equal(revisions.length, 0);
  await select();
  const before = await pixels();
  await page.locator('[data-selection-control-id=flip-x] button').first().waitFor();
  await context.setOffline(true);
  await page.locator('[data-selection-control-id=flip-x] button').first().click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('[data-workspace-save-launcher]')?.getAttribute('data-save-state') === 'error', null, { timeout: 60000 });
  const edited = await pixels();
  assert.notDeepEqual(edited, before, 'offline edit visibly changes the image');
  assert.equal(revisions.length, 0);
  await shot('offline-error');
  await context.setOffline(false);
  if (await helpers.saveState(page) === 'error') {
    await page.locator('[data-workspace-save-launcher]').first().click();
    await page.locator('[data-workspace-save-action-id=retry]').first().click();
  }
  await page.waitForFunction(() => document.querySelector('[data-workspace-save-launcher]')?.getAttribute('data-save-state') === 'saved', null, { timeout: 90000 });
  assert.deepEqual(revisions, [200]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await open();
  await select();
  assert.deepEqual(await pixels(), edited, 'the confirmed offline edit retains source-relative image colours after reload');
  assert.deepEqual(revisions, [200]);
  await shot('reloaded-final');
  log('PASS offline error, one confirmed revision, matching source-relative pixels after reload');
}
