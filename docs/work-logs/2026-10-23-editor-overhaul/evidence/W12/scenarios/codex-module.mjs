import {openFromLibrary} from './_w12-lib.mjs';
export default async({page,helpers,log,args})=>{
  const checks=[];
  page.on('response',response=>{
    if(!/\.js(?:\?|$)/.test(response.url()))return;
    checks.push(response.text().then(code=>{
      if(code.includes('audio-wave-peaks')||code.includes('audioWaveformChannels'))log('current-peaks-module',new URL(response.url()).pathname);
      if(code.includes('use-audio-wave-loader')&&code.includes('628074'))log('unexpected-fixture-code');
    }).catch(()=>{}));
  });
  await openFromLibrary(page,helpers,args[0]||'ea2e3d75-8caf-445a-aa4e-2e3c71cc1008',log);
  await Promise.allSettled(checks);
  log('script-responses-checked',checks.length);
  const drawer=page.locator('[data-edit-bar-drawer]').filter({hasText:/音轨工具|Audio/i}).first();
  await drawer.click();
  await page.locator('[data-audio-transport]').getByRole('button',{name:/^(播放|Play)$/i}).click();
  await page.waitForTimeout(1400);
  log('playing',await page.locator('[data-audio-waveform]').evaluate(el=>el.parentElement.textContent.trim().slice(0,160)));
  await page.locator('[data-audio-transport]').getByRole('button',{name:/^(停止|Stop)$/i}).click();
  log('stopped',await page.locator('[data-audio-waveform]').evaluate(el=>el.parentElement.textContent.trim().slice(0,160)));
};
