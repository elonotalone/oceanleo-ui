import assert from 'node:assert/strict';

export default async function ({ page, log, shot, helpers, args }) {
  const root = args[0] || 'd8bf00e4-7d6f-4110-9988-3ac412957d32';
  let denied = 0, writes = 0;
  await page.route('**/v1/artifact-renditions/access/**', async route => {
    const url = new URL(route.request().url());
    let claims = {};
    try { claims = JSON.parse(Buffer.from(url.pathname.split('/').at(-1).split('.')[0], 'base64url').toString()); } catch {}
    if (claims.artifact === root && claims.purpose === 'editor_manifest') {
      denied++;
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"acceptance-source-unavailable"}' });
    }
    return route.continue();
  });
  page.on('request', request => {
    if (request.method() === 'POST' && new RegExp(`/v1/artifacts/${root}/(?:staging|revisions)$`).test(new URL(request.url()).pathname)) writes++;
  });
  await helpers.gotoApp(page, `/library?item=${root}`);
  const edit = page.locator('[data-artifact-action="edit"]').last();
  await edit.waitFor({ timeout: 60000 });
  await edit.click({ timeout: 5000 }).catch(() => edit.evaluate(button => button.click()));
  await page.locator('[data-editor-source-failure]').waitFor({ timeout: 120000 });
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(8000);
  assert.ok(denied > 0, 'the typed native manifest read must actually fail');
  assert.equal(await page.locator('[data-grid-univer-stage] canvas').count(), 0, 'no substitute empty editor');
  assert.equal(writes, 0, 'failed source must not stage or commit a blank document');
  await shot('native-source-failed-closed');
  log('PASS', JSON.stringify({ root, denied, writes }));
}
