import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import PptxGenJS from 'pptxgenjs';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { compileModule, dataModule } from './helpers/module-bench.mjs';

const lodash = import.meta.resolve('lodash');
const { init } = await import(await compileModule('vendor/pptx-preview/pptx-preview.es.js', {
  lodash: dataModule(`import lib from ${JSON.stringify(lodash)};export const get=lib.get,omit=lib.omit;`),
}));
async function deck({ missing = false, broken = false } = {}) {
  const pptx = new PptxGenJS(); pptx.addSlide().addText('Preview survives absent defaults', { x: 1, y: 1, w: 5, h: 1 });
  const zip = unzipSync(new Uint8Array(await (await pptx.write({ outputType: 'blob' })).arrayBuffer()));
  if (missing) zip['ppt/presentation.xml'] = strToU8(strFromU8(zip['ppt/presentation.xml']).replace(/<p:defaultTextStyle(?:\s[^>]*)?>[\s\S]*?<\/p:defaultTextStyle>|<p:defaultTextStyle\s*\/>/g, ''));
  if (broken) {
    // The master load must reject through preview.load, without a detached rejection.
    delete zip['ppt/slideMasters/_rels/slideMaster1.xml.rels'];
  }
  return zipSync(zip).buffer;
}
for (const missing of [false, true]) test(`PPT fixture ${missing ? 'without' : 'with'} defaultTextStyle loads complete master and slide`, async () => {
  const host = document.createElement('div'); document.body.append(host);
  const preview = init(host, { width: 960, height: 540 });
  const model = await preview.load(await deck({ missing }));
  assert.equal(model.slides.length, 1); assert.equal(model.slideMaster.length, 1);
  assert.equal(typeof model.defaultTextStyleSource, 'object');
  preview.renderSingleSlide(0);
  assert.match(host.textContent, /Preview survives absent defaults/);
  preview.destroy?.(); host.remove();
});
test('broken master rejects the awaited outer load', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const preview = init(host, { width: 960, height: 540 });
  await assert.rejects(preview.load(await deck({ missing: true, broken: true })));
  preview.destroy?.(); host.remove();
});
