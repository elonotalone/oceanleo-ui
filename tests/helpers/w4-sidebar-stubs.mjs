import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dataModule } from './module-bench.mjs';
const require = createRequire(import.meta.url);
const react = JSON.stringify(pathToFileURL(require.resolve('react')).href);
/** Keep unrelated panel/network/editor implementations out of shell regression tests. */
export const W4_SIDEBAR_STUBS = {
  './asset-detail/resolve': dataModule(`export function resolveAssetDetail(ref, options){ return globalThis.__w4Resolve ? globalThis.__w4Resolve(ref, options) : Promise.reject(new Error('unavailable')); }`),
  './asset-detail/AssetDetail': dataModule(`import React from ${react}; export function AssetDetail(props){ globalThis.__w4Detail=props; return React.createElement('section', {'data-shared-detail':props.entry.id}, React.createElement('button', {onClick:props.onBack, 'data-shared-back':true},props.entry.title), props.actions); }`),
  './asset-detail/BayAssetActions': dataModule(`import React from ${react}; export function BayAssetActions(props){ globalThis.__w4Actions=props; return React.createElement('div', {'data-shared-actions':true}); }`),
  './bay/asset/BayAssetLibrary': dataModule(`import React from ${react}; export function BayAssetLibrary(props){ globalThis.__w4Shelf=props; return React.createElement('div', {'data-bay-material-shelf':true}); }`),
};
