import assert from 'node:assert/strict';
import { guardProduction, setLocale, openEditorByItem, topBarReport as chromeReport, panelReport } from '../V01/scenarios/_v01-lib.mjs';

export default async function ({ page, context, helpers, log, shot }) {
  await guardProduction(context, log);
  await setLocale(context, 'en');
  await helpers.gotoApp(page, '/library');
  await page.locator('[data-document-cover]').first().waitFor({ timeout: 90000 });
  const cards = await page.locator('[data-document-cover]').evaluateAll(nodes => nodes.slice(0, 10).map(node => ({
    state: node.getAttribute('data-document-cover'), source: node.getAttribute('data-document-excerpt-source'),
    spinner: node.querySelectorAll('[role=status],.v-spinner').length, text: node.textContent.trim().length,
  })));
  assert.ok(cards.length > 0);
  assert.ok(cards.every(card => card.spinner === 0 && card.text > 0), 'document cards show structured text immediately');
  log('document-cards', JSON.stringify(cards));
  assert.equal(await openEditorByItem(page, helpers, '[V01] sample.txt', log), true);
  const chrome = await chromeReport(page);
  assert.equal(chrome.headerFound, true);
  assert.equal(chrome.pageRow, null);
  assert.equal(chrome.themeToggle, 0);
  assert.equal(chrome.rows, 1);
  assert.ok(chrome.save?.visible);
  assert.equal(await page.locator('[data-editor-tools-trigger]').count(), 0);
  log('chrome', JSON.stringify(chrome));
  for (const name of ['materials', 'mine']) {
    await page.locator(`[data-workspace-library-panel=${name}]`).first().click();
    await page.waitForTimeout(1000);
    const panel = await panelReport(page);
    assert.ok(panel.known.leftPane, `${name} panel is visible`);
    if (name === 'mine') assert.equal(panel.known.minePanel, true);
    else assert.ok(panel.known.localUpload, 'material panel starts with local upload');
    log('panel', name, JSON.stringify(panel.known));
  }
  await page.locator('[data-workspace-library-panel=mine]').first().click();
  await page.locator('[data-workspace-more-launcher]').first().click();
  await page.locator('[data-workspace-more-menu]').waitFor();
  const entries = await page.locator('[data-more-menu-entry]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-more-menu-entry')));
  assert.ok(entries.includes('share') && entries.includes('favorite') && entries.includes('download'));
  log('more-menu', entries.join(','));
  await shot('shared-chrome');
}
