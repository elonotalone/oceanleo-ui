import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { openGrid, clickCell, cellPoint } from './w10-grid.mjs';

const STAGE = '[data-grid-univer-stage]';
const OWN = '73b709be-bb23-400d-aea4-e80f206a63e5';
const PUBLIC = '99300564-3b25-4857-894b-e28e155b530f';

async function readLibraryItem(context, root) {
  // The harness session remains memory-only. Read only this acceptance fixture.
  const chunks = (await context.cookies()).filter(cookie => cookie.name.startsWith('sb-kvrtcumcmhyqhmawpzyc-auth-token'))
    .sort((a, b) => a.name.localeCompare(b.name)).map(cookie => cookie.value).join('');
  const session = JSON.parse(Buffer.from(chunks.replace(/^base64-/, ''), 'base64url').toString());
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const response = await fetch(`http://127.0.0.1:8008/v1/library/items/${root}`, { headers });
  assert.equal(response.status, 200);
  const item = await response.json();
  return { item, headers };
}

async function readProject(context, root) {
  const { item, headers } = await readLibraryItem(context, root);
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
  const sourceSnapshot = () => execFileSync('git', ['log', '-1', '--format=%H', '--', 'src/'], { encoding: 'utf8', cwd: process.cwd().split('/docs/work-logs/')[0] }).trim();
  const sourceCommit = sourceSnapshot();
  log('source-snapshot', sourceCommit);
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      const url = new URL(frame.url());
      log('navigation', url.protocol, url.pathname);
    }
  });
  page.on('console', message => {
    if (message.text().startsWith('W10-ACCEPT-HOST ') || message.text().startsWith('[Fast Refresh]')) log(message.text());
  });
  await page.addInitScript(() => {
    for (const name of ['oceanleo:auth-state', 'oceanleo:artifact-library-change']) window.addEventListener(name, event => {
      const detail = event.detail || {};
      console.info('W10-ACCEPT-HOST ' + JSON.stringify({ name, action: detail.action, authEvent: detail.event,
        artifactId: detail.artifactId, revisionId: detail.revisionId,
        user: detail.userId == null ? null : detail.userId === '2ffeef37-102a-431b-b2c2-51c5675dba79' ? 'acceptance' : 'other' }));
    });
    let before;
    const observer = new MutationObserver(() => {
      const state = JSON.stringify({ stage: Boolean(document.querySelector('[data-grid-univer-stage]')),
        save: document.querySelector('[data-workspace-save-launcher]')?.getAttribute('data-save-state') || null });
      if (state !== before) { before = state; console.info('W10-ACCEPT-HOST ' + state); }
    });
    document.addEventListener('DOMContentLoaded', () => observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true }));
  });
  const commits = [];
  let forks = 0;
  let revisionErrors = 0;
  const errors = [];
  page.on('pageerror', error => { if (!/Hydration/.test(String(error))) errors.push(String(error)); });
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && /\/(staging|revisions)$/.test(path)) log('save-request', path);
  });
  page.on('requestfailed', request => {
    const path = new URL(request.url()).pathname;
    if (/\/(staging|revisions)$/.test(path)) log('save-network-failure', path, request.failure()?.errorText);
  });
  page.on('response', async response => {
    const url = new URL(response.url());
    if (response.request().method() !== 'POST') return;
    if (/\/staging$/.test(url.pathname)) log('staging-status', response.status());
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
  assert.deepEqual(errors, [], 'no runtime errors before a fixture mutation');
  if (process.env.THEME === 'dark') {
    assert.equal(await page.locator(STAGE).getAttribute('data-grid-univer-theme'), 'dark');
    const surface = await page.locator('[data-u-comp="workbench-layout"]').first().evaluate(node => getComputedStyle(node).backgroundColor);
    assert.notEqual(surface, 'rgb(255, 255, 255)', 'dark editor must have an actual dark sheet surface');
    log('actual-dark-surface', surface);
  }
  assert.equal(commits.length, 0, 'open-only must not create a revision');
  const root = new URL(page.url()).searchParams.get('item') || id;
  const initialCells = await page.evaluate(() => globalThis.__oceanleoGridUniverPaint?.liveCells || []);
  assert.ok(initialCells.length > 0, 'original source cells must be loaded, not a blank canvas');
  if (mode !== 'fork') assert.ok(initialCells.some(cell => cell.value === 'Task'), 'acceptance source header remains intact');
  const assertOriginalCells = async () => {
    const actual = await page.evaluate(() => globalThis.__oceanleoGridUniverPaint?.liveCells || []);
    const overwritten = mode === 'offline' ? [[13, 4]] : mode === 'fork' ? [[14, 4], [14, 5]] : [];
    for (const cell of initialCells) {
      if (overwritten.some(([row, col]) => cell.row === row && cell.col === col)) continue;
      assert.ok(actual.some(current => current.row === cell.row && current.col === cell.col && current.value === cell.value),
        `original source cell ${cell.row},${cell.col} must remain unchanged`);
    }
  };
  const savedAfter = async mutate => {
    const before = commits.length;
    await mutate();
    for (let n = 0; n < 180 && commits.length === before; n++) await page.waitForTimeout(500);
    if (commits.length === before) log('save-debug', await page.locator('[data-workspace-save-launcher]').first().getAttribute('title'),
      await page.evaluate(() => JSON.stringify({ state: globalThis.__oceanleoGridUniverPaint?.state, events: globalThis.__oceanleoGridUniverPaint?.events?.slice(-8) })));
    assert.equal(commits.length, before + 1, 'one completed change creates one revision');
    await helpers.waitSaved(page, { timeout: 90000 });
  };
  const type = async (row, col, value) => {
    const point = await cellPoint(page, row, col);
    const hit = await page.evaluate(point => {
      const node = document.elementFromPoint(point.x, point.y);
      return { inStage: Boolean(node?.closest('[data-grid-univer-stage]')), tag: node?.tagName };
    }, point);
    assert.ok(hit.inStage, `typing target must hit the live sheet, not ${hit.tag}`);
    await clickCell(page, row, col);
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  };
  const reopen = async () => {
    const close = page.locator('[data-global-row-slot="close"] button');
    await close.click({ timeout: 5000 }).catch(async error => {
      if (!String(error).includes('nextjs-portal')) throw error;
      log('dev-overlay-only close fallback');
      await close.evaluate(button => button.click());
    });
    await page.locator(STAGE).waitFor({ state: 'hidden', timeout: 20000 });
    await openGrid(page, helpers, root);
  };
  const reload = async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (!(await page.locator(`${STAGE} canvas >> visible=true`).first().isVisible().catch(() => false))) {
      const edit = page.locator("button[aria-label*='编辑'], button[aria-label*='Edit'], button[title*='编辑'], button[title*='Edit']").last();
      await edit.waitFor({ timeout: 60000 });
      await edit.click({ timeout: 5000 }).catch(() => edit.evaluate(button => button.click()));
    }
    await page.locator(`${STAGE} canvas >> visible=true`).first().waitFor({ timeout: 90000 });
    await page.waitForTimeout(5000);
  };
  if (mode === 'reopen') {
    const marks = args.slice(2);
    await checkMarks(page, marks);
    await reload();
    await checkMarks(page, marks);
    assert.equal(commits.length, 0);
    assert.equal(sourceSnapshot(), sourceCommit, 'no source changes during browser acceptance');
    await shot('reopen-fullreload');
  } else if (mode === 'offline') {
    const mark = `W10offline-${Date.now()}`;
    await context.setOffline(true);
    await type(13, 4, mark);
    await page.waitForTimeout(250);
    const states = [];
    for (let n = 0; n < 120; n++) {
      assert.ok(await page.locator(STAGE).isVisible(), 'editor must remain open while offline');
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
    log('online-confirmed', await page.evaluate(() => navigator.onLine));
    await savedAfter(async () => {
      if ((await helpers.saveState(page)) === 'error') {
        log('retry-before', await page.locator('[data-workspace-save-launcher]').first().getAttribute('title'));
        await page.locator('[data-workspace-save-launcher]').first().click();
        await page.locator('[data-workspace-save-action-id="retry"]').click();
        log('retry-after', await helpers.saveState(page), await page.locator('[data-workspace-save-launcher]').first().getAttribute('title'));
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
    const beforeUndo = await page.evaluate(() => globalThis.__oceanleoGridUniverPaint?.state?.editRevision);
    await savedAfter(() => page.getByRole('button', { name: /^(Undo|撤销)$/ }).click());
    assert.equal(await page.evaluate(() => globalThis.__oceanleoGridUniverPaint?.state?.editRevision), beforeUndo + 1, 'native Undo is one personal edit');
    assert.equal(drawings(await readProject(context, root)).length, initial);
    log('history-after-material-undo', await page.evaluate(() => JSON.stringify({
      actual: globalThis.__oceanleoGridUniverPaint?.actualHistory,
      published: globalThis.__oceanleoGridUniverPaint?.publishedHistory,
      events: globalThis.__oceanleoGridUniverPaint?.events,
    })));
    assert.ok(await page.getByRole('button', { name: /^(Redo|重做)$/ }).isEnabled(), 'Redo must remain available after saving the native image Undo');
    const beforeRedo = await page.evaluate(() => globalThis.__oceanleoGridUniverPaint?.state?.editRevision);
    await savedAfter(() => page.getByRole('button', { name: /^(Redo|重做)$/ }).click());
    assert.equal(await page.evaluate(() => globalThis.__oceanleoGridUniverPaint?.state?.editRevision), beforeRedo + 1, 'native Redo is one personal edit');
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
  } else if (mode === 'library') {
    await assertOriginalCells();
    const { item: currentItem } = await readLibraryItem(context, root);
    await helpers.gotoApp(page, '/library');
    const upload = page.locator('input[type=file]').first();
    await upload.waitFor({ state: 'attached', timeout: 60000 });
    const ownerDeadline = Date.now() + 60000;
    while (await upload.isDisabled()) {
      assert.ok(Date.now() < ownerDeadline, 'library owner must become ready');
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1000);
    await page.getByPlaceholder('search', { exact: true }).fill('Codex终验');
    await page.waitForTimeout(700);
    assert.equal(await page.getByPlaceholder('search', { exact: true }).inputValue(), 'Codex终验', 'query survives owner-ready hydration');
    const card = page.locator('[data-collection-card-main]').filter({ hasText: 'Codex终验' }).first();
    await card.waitFor({ timeout: 45000 });
    const image = card.locator('img').first();
    await image.waitFor({ timeout: 30000 });
    await image.evaluate(image => image.decode());
    assert.ok(await image.evaluate(image => image.naturalWidth > 0), 'saved library card must have a real preview image');
    const previewUrl = new URL(await image.getAttribute('src'), page.url());
    const claims = JSON.parse(Buffer.from(previewUrl.pathname.split('/').at(-1).split('.')[0], 'base64url').toString());
    assert.equal(claims.artifact, root, 'preview is bound to this saved workbook');
    assert.ok(Object.values(claims).includes(currentItem.revisionId), 'card preview is bound to the current revision, not a stale thumbnail');
    await shot('saved-library-card');
    log('PASS', JSON.stringify({ mode, root, commits: commits.length, forks }));
    assert.equal(commits.length, 0);
    return;
  } else throw new Error(`unknown mode ${mode}`);
  assert.equal(revisionErrors, 0, 'no stale CAS retries');
  assert.equal(commits.length, { reopen: 0, offline: 1, merge: 2, material: 3, fork: 2 }[mode], 'no extra revisions from idle, close, reopen or reload');
  await assertOriginalCells();
  assert.deepEqual(errors, [], 'no editor runtime errors');
  assert.equal(sourceSnapshot(), sourceCommit, 'no source changes during browser acceptance');
  log('PASS', JSON.stringify({ mode, root, commits: commits.length, forks }));
}
