import assert from 'node:assert/strict';
import { openPdf, firstPage } from '../W06/scenarios/_w06-lib.mjs';

export default async function ({ page, helpers, log, shot, args }) {
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  await page.waitForTimeout(1500);
  const boxes = await page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null;
    };
    return { rail: rect('[data-pdf-page-rail]'), bar: rect('[data-workspace-edit-bar-toolbar]'),
      targets: [...document.querySelectorAll('[data-workspace-edit-bar-toolbar] [data-workspace-action-id]')]
        .filter(n => !n.closest('[data-edit-bar-document-measure]')).map(n => ({ id:n.dataset.workspaceActionId, height:n.getBoundingClientRect().height })) };
  });
  log('layout', JSON.stringify(boxes));
  assert.ok(boxes.rail && boxes.bar);
  assert.ok(boxes.bar.left >= boxes.rail.right - 1, 'PDF editing bar must clear page thumbnails');
  assert.ok(boxes.targets.length >= 8);
  assert.ok(boxes.targets.every(t => t.height >= 28), 'compact spacing retains the existing 28px editing control height');
  await shot('pdf-rail-layout');
}
