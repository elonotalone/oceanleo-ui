import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { assetToolbarItems } from '../src/shell/asset-detail/useAssetActions.ts';
const ui = dataModule('export const useUI=()=>s=>s;');
const empty = dataModule('export async function listBayOrders(){return []} export const orderStatusLabel=()=>"";');
const { MyBoughtPane } = await import(await compileModule('src/shell/bay/mine/MyBoughtPane.tsx', {
  '../../../i18n/ui/useUI': ui,
  '../../../lib/bay/orders': empty,
  '../../../lib/bay/assets': dataModule('export async function listPurchasedBayAssets(){return {items:globalThis.__pay2Receipts}}'),
  '../../../lib/bay/app-paid': dataModule('export async function listBoughtBayApps(){return {}}'),
  '../../../lib/bay/lessons': dataModule('export async function listBoughtBayLessonOrders(){return {items:[]}}'),
  '../../../lib/bay/mine-hidden': dataModule('export async function listBayMineHidden(){return new Set()} export const hiddenKey=(k,id)=>k+":"+id;'),
  '../../../contracts/domain-family': dataModule(`export * from ${JSON.stringify(new URL("../src/contracts/domain-family.ts",import.meta.url).href)}; export const portalHref=p=>p;`),
  '../../../lib/money': dataModule('export const useLedgerCurrency=()=>"CNY";'),
  '../settings/money-ui': dataModule('export const useBayMoneyLocale=()=>"zh-CN";'),
  '../shell/bay-state': dataModule('export const useBaySignedIn=()=>true; export function openBay(){}'),
  './mine-hide': dataModule('export function hideRowProps(){return {}}'),
  './mine-load': dataModule('export async function loadServiceCards(){return {}}'),
  './mine-bundle': dataModule('export function useMineBundle(s,load){globalThis.__pay2Loader=load;return {data:globalThis.__pay2Bundle,reload(){},loading:false}}'),
  './MineTradeList': dataModule('export function MineTradeList(p){globalThis.__pay2Rows=p.rows;return null}'),
}));

test('official receipts load into Mine by claim identity and open the purchased Library copy', async () => {
  globalThis.__pay2Receipts = [1,2].map(n=>({id:`claim-${n}`,listing_id:null,ref:{kind:'template',id:`tpl-${n}`},title:`模板${n}`,status:'settled',entitled:true,price_fen:0,currency:'CNY',libraryIdentity:{kind:'artifact',id:`copy-${n}`}}));
  globalThis.__pay2Bundle = null;
  renderToStaticMarkup(React.createElement(MyBoughtPane));
  globalThis.__pay2Bundle = await globalThis.__pay2Loader();
  renderToStaticMarkup(React.createElement(MyBoughtPane));
  const rows = globalThis.__pay2Rows;
  assert.deepEqual(rows.map(row=>row.id), ['asset:claim-1','asset:claim-2']);
  assert.deepEqual(rows.map(row=>row.amount), ['免费','免费']);
  const previous = globalThis.window;
  const opened=[];
  globalThis.window={location:{assign:href=>opened.push(href)}};
  try { rows[1].onOpen(); } finally { globalThis.window=previous; }
  assert.match(opened[0], /\/library\?item=copy-2$/);
  renderToStaticMarkup(React.createElement(MyBoughtPane,{category:'lesson'}));
  assert.equal(globalThis.__pay2Rows.length,0);
});

const { BayAssetCard } = await import(await compileModule('src/shell/bay/asset/BayAssetCard.tsx', {
  '../../../i18n/ui/useUI': ui,
  'next-intl': dataModule('export const useLocale=()=>"zh-CN";'),
  '../../workspace-library-view': dataModule('export function WorkspaceCard(){return null} export const WorkspaceListRow=WorkspaceCard;'),
}));

test('real grid and list cards render the official zero price with the existing price text', () => {
  const asset={id:'tpl',shelfKind:'official',origin:'first-party',title:'官方模板',catalog:{source:'template-materials',catalogId:'tpl'},entry:{id:'tpl',title:'官方模板'}};
  for (const view of ['grid','list']) {
    const html=renderToStaticMarkup(React.createElement(BayAssetCard,{asset,view,onOpen(){}}));
    assert.match(html,/data-asset-price/);
    assert.match(html,/免费/);
  }
});

test('official template detail uses Get before checkout and usable actions after it', () => {
  const context={surface:'bay',ref:{kind:'template',id:'tpl'},owned:false,commerce:{priceFen:0,currency:'CNY',free:true,purchaseState:'none'},rights:{canView:true}};
  assert.deepEqual(assetToolbarItems(context).map(x=>x.id),['get']);
  assert.deepEqual(assetToolbarItems({...context,owned:true,commerce:{...context.commerce,purchaseState:'settled'},rights:{canUseInTask:true,canEdit:true,canDownload:true}}).map(x=>x.id),['use','download','edit']);
});
