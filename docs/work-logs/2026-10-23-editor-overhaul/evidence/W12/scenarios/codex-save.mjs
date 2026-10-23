import assert from 'node:assert/strict';
import { openFromLibrary, dragSelect, guardProduction, saveLedger, audioReport } from './_w12-lib.mjs';

const delay = (page, ms=500) => page.waitForTimeout(ms);
export default async ({page,context,helpers,log,shot,args}) => {
  await guardProduction(context,log);
  saveLedger(page,log);
  const revisions=[];
  page.on('response',async(response)=>{
    if(response.request().method()==='POST' && /\/artifacts\/[^/]+\/revisions/.test(response.url()) && response.status()===200){
      const data=await response.json();revisions.push(data);log('COMMIT',data.artifactId,data.revisionId);
    }
  });
  const root=args[0]||'ea2e3d75-8caf-445a-aa4e-2e3c71cc1008';
  const saveState=()=>helpers.saveState(page);
  async function savedAfter(count,label){
    const started=Date.now();
    while(Date.now()-started<90000){
      if(revisions.length>count && await saveState()==='saved'){log('saved',label,revisions.length);return;}
      if(await saveState()==='error' && (!label.includes('retry') || Date.now()-started>15000)) throw new Error(`save error ${label}`);
      await delay(page);
    }
    throw new Error(`no confirmed revision ${label}`);
  }
  async function panel(id){
    await page.locator(`[data-selection-control-id="${id}"] button`).first().click();
    await page.locator('[data-selection-inspector]').waitFor({state:'visible'});
  }
  await openFromLibrary(page,helpers,root,log);
  const before=await audioReport(page);log('before',JSON.stringify(before));
  await delay(page,3000);
  assert.equal(revisions.length,0,'opening must not save');
  await dragSelect(page,.15,.75);
  const a=revisions.length;
  await page.locator('[data-selection-control-id="audio-trim"] button').click();
  await savedAfter(a,'A trim');
  await shot('after-trim');
  await panel('selection-inspector-audio-gain');
  const gain=page.locator('[data-selection-inspector] input[type=number]').first();
  await gain.fill('50');await gain.blur();
  const b=revisions.length;
  await page.locator('[data-selection-inspector]').getByRole('button',{name:/应用增益|Apply gain/i}).click();
  await savedAfter(b,'B gain');
  await shot('after-gain');
  const after=await audioReport(page);log('after',JSON.stringify(after));
  await delay(page,11000);
  assert.equal(revisions.length,2,'idle must not manufacture a third revision');
  await page.locator('[data-global-row-slot="close"] button').click();
  await page.locator('[data-audio-waveform]').waitFor({state:'hidden',timeout:60000});
  await openFromLibrary(page,helpers,root,log);
  log('reopen',JSON.stringify(await audioReport(page)));await shot('reopen');
  await page.reload();await openFromLibrary(page,helpers,root,log);
  log('reload',JSON.stringify(await audioReport(page)));await shot('reload');
  await panel('selection-inspector-audio-fade-tools');
  await context.setOffline(true);
  await page.locator('[data-selection-inspector]').getByRole('button',{name:/^(淡入|Fade in)$/i}).click();
  await page.waitForFunction(()=>document.querySelector('[data-workspace-save-launcher]')?.getAttribute('data-save-state')==='error',{},{timeout:45000});
  log('offline',await saveState());await shot('offline');
  await context.setOffline(false);
  await delay(page,1500);
  await page.locator('[data-workspace-save-launcher]').first().click();
  const retry=page.getByRole('button',{name:/重试|Retry/}).first();
  if(await retry.isVisible().catch(()=>false))await retry.click();
  await savedAfter(2,'C retry');
  log('final-revisions',revisions.length);await shot('retry-saved');
};
