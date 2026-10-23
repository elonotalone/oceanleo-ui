import assert from 'node:assert/strict';
import { openVideoEditor, selectClip } from './w11-lib.mjs';

export default async ({ page, helpers, log, shot, args }) => {
  await openVideoEditor(page, helpers, log, args[0]);
  await selectClip(page);
  const flip = () => page.locator('[data-selection-control-id="flip-x"] button').first().getAttribute('aria-pressed');
  const before = await flip();
  await page.locator('[data-global-row-slot="close"] button').first().click();
  await page.locator('[data-editor-adapter="video-timeline"]').waitFor({ state: 'detached', timeout: 60000 });
  log('actual-close', true);
  await openVideoEditor(page, helpers, log, args[0]);
  await selectClip(page);
  assert.equal(await flip(), before);
  log('reopened-same-flip', before);
  await shot('actual-close-reopen');
};
