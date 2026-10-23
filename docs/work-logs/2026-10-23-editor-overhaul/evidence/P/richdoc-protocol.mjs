import assert from 'node:assert/strict';
import { guardProduction, setLocale, openEditorByItem } from '../V01/scenarios/_v01-lib.mjs';

export default async function ({ page, context, helpers, log, shot, args }) {
  await guardProduction(context, log);
  await setLocale(context, 'en');
  const [id, title] = args;
  const responses = [];
  page.on('response', r => {
    if (r.request().method() === 'POST' && /\/artifacts\/[^/]+\/revisions(?:\?|$)/.test(r.url())) {
      responses.push(r.status()); log('revision', r.status());
    }
  });
  const open = async () => {
    assert.equal(await openEditorByItem(page, helpers, title, log, { id }), true);
    await page.locator('.oleo-richdoc').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(2000);
  };
  const body = () => page.locator('.oleo-richdoc').first();
  const marker = `Codex-${Date.now().toString(36)}`;
  const edit = async suffix => {
    await body().click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(` ${marker}-${suffix}`);
  };
  const saved = async count => {
    await page.waitForFunction(() => document.querySelector('[data-workspace-save-launcher]')?.getAttribute('data-save-state') === 'saved', null, { timeout: 90000 });
    assert.equal(responses.length, count, 'Saved follows exactly one new artifact revision per edit');
    assert.ok(responses.every(s => s === 200));
  };
  await open();
  await page.waitForTimeout(5000);
  assert.equal(responses.length, 0, 'opening without edits must not publish');
  for (const [suffix, count] of [['A', 1], ['B', 2]]) {
    await edit(suffix);
    await page.waitForFunction(() => document.querySelector('[data-workspace-save-launcher]')?.getAttribute('data-save-state') !== 'saved');
    await saved(count);
  }
  await page.locator('[data-global-row-slot=close] button').first().click();
  await open();
  assert.ok((await body().innerText()).includes(`${marker}-A`));
  assert.ok((await body().innerText()).includes(`${marker}-B`));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await open();
  assert.ok((await body().innerText()).includes(`${marker}-A`));
  assert.ok((await body().innerText()).includes(`${marker}-B`));
  assert.equal(responses.length, 2, 'close/reopen/reload does not publish unchanged content');
  await context.setOffline(true);
  await edit('OFFLINE');
  await page.waitForFunction(() => document.querySelector('[data-workspace-save-launcher]')?.getAttribute('data-save-state') === 'error', null, { timeout: 60000 });
  assert.equal(responses.length, 2);
  await shot('offline-error');
  await context.setOffline(false);
  if (await helpers.saveState(page) === 'error') {
    await page.locator('[data-workspace-save-launcher]').first().click();
    await page.locator('[data-workspace-save-action-id=retry]').first().click();
  }
  await saved(3);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await open();
  assert.ok((await body().innerText()).includes(`${marker}-OFFLINE`));
  assert.equal(responses.length, 3);
  await shot('reloaded-final');
  log('PASS', marker, 'three confirmed versions; two edits plus offline retry, close/reopen/reload');
}
