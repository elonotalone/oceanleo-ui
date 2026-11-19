import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { normalizeArtifactProjection } from '../src/shell/artifact-contract.ts';
import { artifactProjectionToLibraryItem } from '../src/shell/library-data.ts';
import { GATEWAY_BASE } from '../src/lib/auth/config.ts';

const { ProgressiveArtifactImage, libraryMediaGeometry } = await import(await compileModule('src/shell/library-viewer-first-paint.tsx', {
  '../i18n/ui/useUI': dataModule('export const useUI=()=>s=>s;'),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const raw = () => ({
  schema:'oceanleo.artifact.v1', artifactId:'artifact', revisionId:'revision',
  artifactType:'single_file_image', sourceFormat:'png', title:'Upload.png', roles:['user_upload'],
  owner:{principalId:'owner',visibility:'private',originSiteKey:'oceanleo'},
  editability:'view_only', access:{canRead:true,canPreview:true,canEdit:false,canFork:false,canInsert:false,canReplace:false,canFavorite:true,canBind:false,canExportSource:true},
  integrity:{ok:true,code:'ok',reason:''}, provenance:{id:'proof',sourceKind:'user_upload'},
  preview:{state:'ready',kind:'native',url:'/v1/artifact-renditions/access/preview'},
  renditions:Object.fromEntries(['thumbnail','preview','full','source'].map(purpose=>[purpose,{
    purpose,revisionId:'revision',url:'/v1/artifact-renditions/access/'+purpose,
    mediaType:'image/png',format:'png',digest:'a'.repeat(64),
  }])),
});

test('upload projection renders thumbnail and preloads full image only at the gateway origin', async () => {
  assert.notEqual(window.location.origin, new URL(GATEWAY_BASE).origin);
  const projection = normalizeArtifactProjection(raw());
  assert.ok(projection);
  const item = artifactProjectionToLibraryItem(projection);
  const requests = [];
  const originalImage = window.Image;
  window.Image = class {
    set src(value) { requests.push(new URL(value, window.location.href)); }
  };
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(ProgressiveArtifactImage, {
      thumbUrl:item.thumbUrl, fullUrl:item.previewUrl, alt:item.title, geometry:libraryMediaGeometry(item),
    })));
    requests.push(new URL(host.querySelector('img').src));
    assert.ok(requests.length >= 2, 'mounted thumbnail and actual full-image preloader');
    for (const url of requests) assert.equal(url.origin, new URL(GATEWAY_BASE).origin, url.href);
    for (const rendition of Object.values(projection.renditions)) assert.equal(new URL(rendition.url).origin, new URL(GATEWAY_BASE).origin);
    assert.equal(new URL(projection.preview.url).origin, new URL(GATEWAY_BASE).origin);
  } finally {
    await act(async () => root.unmount()); host.remove(); window.Image = originalImage;
  }
});

test('projection keeps auth-gated source-tree paths out of native media URLs', () => {
  const value = raw();
  value.renditions.source.url = '/v1/artifacts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/revisions/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source-tree/@source';
  value.renditions.source.digest = 'b'.repeat(64);
  const projection = normalizeArtifactProjection(value);
  // A source tree is not an opaque anonymous grant. Normalization must not
  // turn it into an image request that drops the required bearer credential.
  assert.equal(projection.renditions.source?.url, value.renditions.source.url);
});
