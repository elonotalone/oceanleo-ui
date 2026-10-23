import assert from 'node:assert/strict';
import { openFromLibrary, guardProduction, saveLedger } from './_w12-lib.mjs';
export default async ({page,context,helpers,log,shot,args})=>{
  await guardProduction(context,log);saveLedger(page,log);
  let commits=0;
  page.on('response',r=>{if(r.request().method()==='POST'&&/\/artifacts\/[^/]+\/revisions/.test(r.url())&&r.status()===200)commits++;});
  await openFromLibrary(page,helpers,args[0]||'ea2e3d75-8caf-445a-aa4e-2e3c71cc1008',log);
  await page.locator('[data-selection-control-id="selection-inspector-audio-fade-tools"] button').click();
  await context.setOffline(true);
  await page.locator('[data-selection-inspector]').getByRole('button',{name:/^(淡出|Fade out)$/i}).click();
  await page.waitForFunction(()=>document.querySelector('[data-workspace-save-launcher]')?.getAttribute('data-save-state')==='error',{}, {timeout:45000});
  assert.equal(commits,0);log('offline-confirmed',await helpers.saveState(page));await shot('offline');
  await context.setOffline(false);await page.waitForTimeout(2000);
  await page.locator('[data-workspace-save-launcher]').first().click();
  const retry=page.getByRole('button',{name:/重试|Retry/}).first();if(await retry.isVisible().catch(()=>false))await retry.click();
  const started=Date.now();
  while(Date.now()-started<60000){if(commits===1&&await helpers.saveState(page)==='saved')break;await page.waitForTimeout(500);}
  assert.equal(commits,1);assert.equal(await helpers.saveState(page),'saved');
  log('retry-confirmed',commits);await shot('retry-saved');
};
