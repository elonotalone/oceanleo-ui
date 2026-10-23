import assert from 'node:assert/strict';
import { openFromLibrary, guardProduction, saveLedger, audioReport, waitAudioReady, dragSelect } from './_w12-lib.mjs';
export default async({page,context,helpers,log,shot,args})=>{
  await guardProduction(context,log);saveLedger(page,log);
  let privateUploads=0, publicUploads=0;
  page.on('request',request=>{
    if(request.method()==='POST'&&/\/v1\/editor-sources$/.test(request.url()))privateUploads++;
    if(request.method()==='POST'&&/\/v1\/database\/upload/.test(request.url()))publicUploads++;
  });
  await openFromLibrary(page,helpers,args[0]||'ea2e3d75-8caf-445a-aa4e-2e3c71cc1008',log);
  await dragSelect(page,.15,.75);
  await page.locator('[data-selection-control-id="audio-trim"] button').click();
  await waitAudioReady(page,log);
  await page.waitForTimeout(6000);
  const before=(await audioReport(page)).stageText;
  async function waitStage(expected){
    const started=Date.now();
    while(Date.now()-started<30000){if((await audioReport(page)).stageText===expected)return;await page.waitForTimeout(250);}
    assert.equal((await audioReport(page)).stageText,expected);
  }
  await page.getByRole('button',{name:/^(素材库|Asset library)$/}).first().click();
  const shelf=page.locator('[data-inline-insertable-materials]');
  await shelf.waitFor({state:'visible'});
  const candidate=shelf.getByRole('button').filter({hasText:'[W11]'}).first();
  await candidate.waitFor({state:'visible',timeout:60000});
  log('material-card',(await candidate.innerText()).replace(/\s+/g,' ').slice(0,100));
  await candidate.click();
  await page.locator('[data-material-insert-feedback="ok"]').waitFor({state:'visible',timeout:60000});
  await waitAudioReady(page,log);
  const after=(await audioReport(page)).stageText;
  assert.notEqual(after,before);assert.equal(privateUploads,1);assert.equal(publicUploads,0);
  log('replace',JSON.stringify({before,after,privateUploads,publicUploads}));await shot('material-replaced');
  await page.locator('[data-global-history-undo]').click();await waitStage(before);
  assert.equal((await audioReport(page)).stageText,before);log('undo-restores-duration',true);await shot('material-undo');
  await page.locator('[data-global-history-redo]').click();await waitStage(after);
  assert.equal((await audioReport(page)).stageText,after);log('redo-restores-duration',true);
  const started=Date.now();while(Date.now()-started<60000){if(await helpers.saveState(page)==='saved')break;await page.waitForTimeout(500);}
  assert.equal(await helpers.saveState(page),'saved');
  await page.reload();await openFromLibrary(page,helpers,args[0]||'ea2e3d75-8caf-445a-aa4e-2e3c71cc1008',log);
  assert.equal((await audioReport(page)).stageText,after);log('reload-private-source',true);await shot('material-reload');
};
