import assert from 'node:assert/strict';
import {openFromLibrary,guardProduction,dragSelect,waitAudioReady,audioReport} from './_w12-lib.mjs';
async function wave(page){return page.evaluate(()=>{
  const found=[];function visit(root){for(const node of root.querySelectorAll('*')){if(node.tagName==='CANVAS')found.push(node);if(node.shadowRoot)visit(node.shadowRoot);}}
  const host=document.querySelector('[data-audio-wave-host]');if(!host)return null;visit(host);
  return found.map(canvas=>{const bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let hash=2166136261,ink=0;for(let i=0;i<bytes.length;i+=16){hash=Math.imul(hash^bytes[i],16777619);ink+=bytes[i+3];}return {hash:hash>>>0,ink:ink/(canvas.width*canvas.height)};});
});}
export default async({page,context,helpers,log,shot,args})=>{
  await guardProduction(context,log);await openFromLibrary(page,helpers,args[0]||'ea2e3d75-8caf-445a-aa4e-2e3c71cc1008',log);
  async function panel(id){const button=page.locator(`[data-selection-control-id="${id}"] button`).first();await button.click();await page.locator('[data-selection-inspector]').waitFor({state:'visible'});await page.waitForTimeout(800);}
  async function undo(){await page.locator('[data-global-history-undo]').click();await page.waitForTimeout(1400);await waitAudioReady(page,log);}
  async function effect(name,run){
    const before=await wave(page), text=(await audioReport(page)).stageText;
    await run();await page.waitForTimeout(1200);await waitAudioReady(page,log);
    const after=await wave(page), nextText=(await audioReport(page)).stageText;
    const duration=(value)=>value.match(/^.*?\/\s*\d+:\d+/)?.[0];
    assert.ok(JSON.stringify(after)!==JSON.stringify(before)||duration(text)!==duration(nextText),`${name} must change waveform or duration`);
    await undo();
    const matches=async()=>{const current=await wave(page);return duration((await audioReport(page)).stageText)===duration(text)&&current.length===before.length&&current.every((entry,i)=>Math.abs(entry.ink-before[i].ink)/Math.max(.001,before[i].ink)<.03);};
    const started=Date.now();while(Date.now()-started<30000){if(await matches())break;await page.waitForTimeout(250);}
    log('undo-compare',name,JSON.stringify({before,after,current:await wave(page),text,currentText:(await audioReport(page)).stageText}));
    assert.equal(await matches(),true,`${name} undo must restore duration and waveform envelope`);
    log('effect',name,'changed-and-undone',JSON.stringify({before,after,beforeText:text,afterText:nextText}));
  }
  if(args[1]!=='remaining'){
  await panel('selection-inspector-audio-gain');
  const gain=page.locator('[data-selection-inspector] input[type=number]').first();await gain.fill('70');await gain.blur();
  await effect('gain',()=>page.locator('[data-selection-inspector]').getByRole('button',{name:/^(应用增益|Apply gain)$/i}).click());
  await panel('selection-inspector-audio-fade-tools');
  await effect('fade-in',()=>page.locator('[data-selection-inspector]').getByRole('button',{name:/^(淡入|Fade in)$/i}).click());
  await effect('fade-out',()=>page.locator('[data-selection-inspector]').getByRole('button',{name:/^(淡出|Fade out)$/i}).click());
  }
  await dragSelect(page,.2,.6);
  await panel('selection-inspector-audio-effect-chain');
  const inputs=page.locator('[data-selection-inspector] input[type=number]');
  for(const [index,value] of ['1.5','6','3','-3'].entries()){await inputs.nth(index).fill(value);await inputs.nth(index).blur();}
  await effect('speed-and-EQ',()=>page.locator('[data-selection-inspector]').getByRole('button',{name:/^(应用效果链|Apply effects)$/i}).click());
  for(const id of ['audio-trim','delete']){await dragSelect(page,.2,.6);await effect(id,()=>page.locator(`[data-selection-control-id="${id}"] button`).click());}
  await page.keyboard.press('Escape');
  const drawer=page.locator('[data-edit-bar-drawer]').filter({hasText:/音轨工具|Audio/i}).first();
  await drawer.waitFor({state:'visible',timeout:15000});await drawer.click();
  await page.locator('[data-audio-transport]').getByRole('button',{name:/^(播放|Play)$/i}).click();await page.waitForTimeout(1400);
  log('playing-position',(await audioReport(page)).stageText);
  await page.locator('[data-audio-transport]').getByRole('button',{name:/^(停止|Stop)$/i}).click();
  log('transport-stop',(await audioReport(page)).stageText);await shot('bars-transport');
};
