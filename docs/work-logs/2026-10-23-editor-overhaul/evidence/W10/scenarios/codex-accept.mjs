import assert from 'node:assert/strict';
import { openGrid, clickCell, cellPoint } from './w10-grid.mjs';

const STAGE = '[data-grid-univer-stage]';
const OWN = 'd8bf00e4-7d6f-4110-9988-3ac412957d32';
const PUBLIC = '99300564-3b25-4857-894b-e28e155b530f';

async function readProject(context, root) {
  // The harness session remains memory-only. Read only this acceptance fixture.
  const chunks = (await context.cookies()).filter(cookie => cookie.name.startsWith('sb-kvrtcumcmhyqhmawpzyc-auth-token'))
    .sort((a, b) => a.name.localeCompare(b.name)).map(cookie => cookie.value).join('');
  const session = JSON.parse(Buffer.from(chunks.replace(/^base64-/, ''), 'base64url').toString());
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const response = await fetch(`http://127.0.0.1:8008/v1/library/items/${root}`, { headers });
  assert.equal(response.status, 200);
  const item = await response.json();
  assert.ok(item.editorManifest?.url, 'native editor manifest must exist');
  let url = new URL(item.editorManifest.url, 'http://127.0.0.1:8008');
  if (/^api\./.test(url.hostname)) url = new URL(url.pathname + url.search, 'http://127.0.0.1:8008');
  const projectResponse = await fetch(url, { headers });
  assert.equal(projectResponse.status, 200);
  const project = await projectResponse.json();
  assert.equal(project.schema, 'oceanleo.grid.univer.v1');
  return project.data;
}

function drawings(project) {
  const resource = project.resources?.find(resource => resource.name === 'SHEET_DRAWING_PLUGIN');
  const data = resource ? JSON.parse(resource.data) : {};
  return Object.values(data).flatMap(sheet => Object.values(sheet.data || {}));
}

async function checkMarks(page, marks) {
  const found = await page.evaluate(marks => {
    const cells = JSON.stringify(globalThis.__oceanleoGridUniverPaint?.liveCells || []);
    return marks.map(mark => cells.includes(mark));
  }, marks);
  assert.ok(found.every(Boolean), `reopened marks missing: ${JSON.stringify(found)}`);
}

export default async function ({ page, context, log, shot, helpers, args }) {
  const [mode = 'reopen', id = OWN] = args;
  const commits = [];
  let forks = 0;
  let revisionErrors = 0;
  const errors = [];
  page.on('pageerror', error => { if (!/Hydration/.test(String(error))) errors.push(String(error)); });
  page.on('response', async response => {
    const url = new URL(response.url());
    if (response.request().method() !== 'POST') return;
    if (/(?:\/|:)fork$/.test(url.pathname) && response.ok()) forks++;
    if (/\/v1\/artifacts\/[^/]+\/revisions$/.test(url.pathname)) {
      log('commit', response.status(), url.pathname.split('/')[3]);
      if (response.ok()) commits.push(url.pathname.split('/')[3]);
      else revisionErrors++;
    }
  });
  if (mode === 'material') {
    await helpers.uploadFiles(page, ['/tmp/w10/[W10] 插图.png']);
  }
  await openGrid(page, helpers, mode === 'fork' ? PUBLIC : id);
  await page.waitForTimeout(2000);
  assert.equal(commits.length, 0, 'open-only must not create a revision');
  const root = new URL(page.url()).searchParams.get('item') || id;
  const savedAfter = async mutate => {
    const before = commits.length;
    await mutate();
    for (let n = 0; n < 180 && commits.length === before; n++) await page.waitForTimeout(500);
    assert.equal(commits.length, before + 1, 'one completed change creates one revision');
    await helpers.waitSaved(page, { timeout: 90000 });
  };
  const type = async (row, col, value) => {
    await clickCell(page, row, col);
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  };
  const reopen = async () => {
    await page.getByRole('button', { name: /^(Close|关闭)$/ }).first().click().catch(() => {});
    await openGrid(page, helpers, root);
  };
  const reload = async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (!(await page.locator(`${STAGE} canvas`).first().isVisible().catch(() => false))) {
      const edit = page.locator("button[aria-label*='编辑'], button[aria-label*='Edit'], button[title*='编辑'], button[title*='Edit']").last();
      await edit.waitFor({ timeout: 60000 });
      await edit.click();
    }
    await page.locator(`${STAGE} canvas`).first().waitFor({ timeout: 90000 });
    await page.waitForTimeout(5000);
  };
  if (mode === 'reopen') {
    const marks = args.slice(2);
    await checkMarks(page, marks);
    await reload();
    await checkMarks(page, marks);
    assert.equal(commits.length, 0);
    await shot('reopen-fullreload');
  } else if (mode === 'offline') {
    const mark = `W10offline-${Date.now()}`;
    await context.setOffline(true);
    await type(13, 4, mark);
    await page.waitForTimeout(250);
    const states = [];
    for (let n = 0; n < 120; n++) {
      const state = await helpers.saveState(page);
      if (state !== states.at(-1)) states.push(state);
      assert.notEqual(state, 'saved', 'offline edits must never be reported saved');
      if (state === 'error') break;
      await page.waitForTimeout(500);
    }
    assert.equal(await helpers.saveState(page), 'error');
    assert.equal(commits.length, 0);
    await shot('offline-error');
    await context.setOffline(false);
    await savedAfter(async () => {
      if ((await helpers.saveState(page)) === 'error') {
        await page.locator('[data-workspace-save-launcher]').first().click();
        await page.locator('[data-workspace-save-action-id="retry"]').click();
      }
    });
    await reload();
    await checkMarks(page, [mark]);
    assert.equal(commits.length, 1);
    log('offline-states', JSON.stringify(states));
    await shot('offline-retry-reload');
  } else if (mode === 'merge') {
    const a = await cellPoint(page, 4, 6), b = await cellPoint(page, 5, 7);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
    const merge = page.locator('[data-selection-control-id="merge-cells"] button').first();
    await merge.waitFor({ timeout: 10000 });
    assert.equal(await merge.getAttribute('aria-pressed'), 'false');
    await savedAfter(async () => { await merge.click(); await page.waitForTimeout(600); assert.equal(await merge.getAttribute('aria-pressed'), 'true'); });
    const merged = await readProject(context, root);
    assert.ok(Object.values(merged.sheets).some(sheet => sheet.mergeData?.some(range => range.startRow === 4 && range.endRow === 5)));
    await savedAfter(() => page.getByRole('button', { name: /^(Undo|撤销)$/ }).click());
    assert.equal(await merge.getAttribute('aria-pressed'), 'false');
    const undone = await readProject(context, root);
    assert.ok(!Object.values(undone.sheets).some(sheet => sheet.mergeData?.some(range => range.startRow === 4 && range.endRow === 5)));
    await shot('merge-undone');
  } else if (mode === 'material') {
    const initial = drawings(await readProject(context, root)).length;
    await page.locator('[data-workspace-library-panel="materials"]').first().click();
    const shelf = page.locator('[data-inline-insertable-materials]');
    await shelf.waitFor({ timeout: 45000 });
    await shelf.getByRole('searchbox').fill('[W10] 插图');
    const card = shelf.locator('[draggable=true]').first();
    await card.waitFor({ timeout: 45000 });
    await shot('material-shelf');
    await savedAfter(() => card.click());
    const inserted = drawings(await readProject(context, root));
    assert.equal(inserted.length, initial + 1);
    assert.ok(inserted.some(drawing => drawing.source?.startsWith('data:image/png;base64,')), 'private image bytes become durable, non-expiring source');
    await shot('material-inserted');
    await savedAfter(() => page.getByRole('button', { name: /^(Undo|撤销)$/ }).click());
    assert.equal(drawings(await readProject(context, root)).length, initial);
    await savedAfter(() => page.getByRole('button', { name: /^(Redo|重做)$/ }).click());
    assert.equal(drawings(await readProject(context, root)).length, initial + 1);
    await reopen();
    assert.equal(drawings(await readProject(context, root)).length, initial + 1);
    await shot('material-reopened');
  } else if (mode === 'fork') {
    assert.notEqual(root, PUBLIC);
    const stamp = `W10fork-${Date.now()}`;
    await savedAfter(() => type(14, 4, `${stamp}-A`));
    await savedAfter(() => type(14, 5, `${stamp}-B`));
    await reopen();
    await checkMarks(page, [`${stamp}-A`, `${stamp}-B`]);
    await reload();
    await checkMarks(page, [`${stamp}-A`, `${stamp}-B`]);
    assert.equal(forks, 1);
    assert.equal(new Set(commits).size, 1);
    assert.equal(commits[0], root);
    await shot('public-fork-reopened');
  } else throw new Error(`unknown mode ${mode}`);
  assert.equal(revisionErrors, 0, 'no stale CAS retries');
  assert.deepEqual(errors, [], 'no editor runtime errors');
  log('PASS', JSON.stringify({ mode, root, commits: commits.length, forks }));
}
