import assert from 'node:assert/strict';
import test from 'node:test';
import { persistPhotopeaDocument, toPhotopeaDocumentRef } from '../src/shell/advanced-routes/image-pro-handoff.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
const bytes = () => Uint8Array.from(png).buffer;
const item = { id:'image-e11', key:'artifact:image-e11', source:'artifact', title:'原图', kind:'image', siteId:'image', favorite:false, artifactId:'image-e11', revisionId:'r1', artifactType:'single_file_image', artifact:{artifactId:'image-e11',revisionId:'r1',artifactType:'single_file_image'}, meta:{}, url:'https://cdn.example/image.png' };
const source = `data:image/png;base64,${png.toString('base64')}`;
const receipt = {ok:true,item:{...item,revisionId:'r2'},url:'https://cdn.example/new.png',artifactId:'image-e11',revisionId:'r2'};

test('打开时同一字节不调用 saveFileToLibrary', async () => {
  const ref = await toPhotopeaDocumentRef(source);
  let calls=0;
  const result=await persistPhotopeaDocument({item,siteId:'image',bytes:bytes(),confirmedDigest:ref.digest,save:async()=>{calls++;return receipt;}});
  assert.equal(calls,0);
  assert.equal(result.ok,true);
  assert.equal(result.unchanged,true);
  assert.equal(result.item.revisionId,'r1');
});

test('上次成功字节不另存；保存回执提供摘要', async () => {
  let calls=0;
  const save=async()=>{calls++;return receipt;};
  const first=await persistPhotopeaDocument({item,siteId:'image',bytes:bytes(),save});
  assert.match(first.digest,/^[a-f0-9]{64}$/);
  const again=await persistPhotopeaDocument({item:first.item,siteId:'image',bytes:bytes(),confirmedDigest:first.digest,save});
  assert.equal(calls,1);
  assert.equal(again.unchanged,true);
});

test('内容幂等键跨时间稳定，保存为同一素材的新版本', async () => {
  const calls=[];
  const save=async args=>{calls.push(args);return receipt;};
  await persistPhotopeaDocument({item,siteId:'image',bytes:bytes(),save});
  await new Promise(resolve=>setTimeout(resolve,5));
  await persistPhotopeaDocument({item,siteId:'image',bytes:bytes(),save});
  assert.equal(calls[0].idempotencyKey,calls[1].idempotencyKey);
  assert.match(calls[0].idempotencyKey,/[a-f0-9]{64}$/);
  assert.equal(calls[0].item.artifactId,item.artifactId);
  assert.equal(calls[0].artifactRevision.artifactType,'single_file_image');
});

test('PSD、未知字节和只有 PNG 文件头都拒绝上传',async()=>{
  for(const data of [[0x38,0x42,0x50,0x53],[1,2,3],[0x89,0x50,0x4e,0x47]]) {
    const result=await persistPhotopeaDocument({item,siteId:'image',bytes:Uint8Array.from(data).buffer,save:async()=>{assert.fail('不可用图片不得保存');}});
    assert.equal(result.ok,false);
  }
});
