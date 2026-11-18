import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import '../../../tests/helpers/w1-jsdom-window.mjs';
import { compileModule, dataModule } from '../../../tests/helpers/module-bench.mjs';
// UC-NONE: jsdom, recording APIs and plain text only; no browser or real cloud operations.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__ucReact = React;
const copyModule = await compileModule('src/i18n/ui/messages/website-service-tiers-copy.ts');
const { WEBSITE_SERVICE_TIERS_COPY: copy } = await import(copyModule);
const i18n = dataModule(`import {WEBSITE_SERVICE_TIERS_COPY as copy} from ${JSON.stringify(copyModule)}; const tt=(s,v)=>{const text=copy[globalThis.__ucLocale||'zh']?.[s]||s;return text.replace(/\\{(\\w+)\\}/g,(_,k)=>v?.[k]??'{'+k+'}');}; export function useWebsiteUI(){return tt;} export function useWebsiteLanguage(){return globalThis.__ucLocale||'zh';}`);
const stubApi = dataModule('export const workUsageApi={get:async()=>{throw {status:404}},limit:async()=>{throw {status:404}}};');
const usageModule = await compileModule('src/shell/website-platform/WorkUsagePanel.tsx', { './website-preview-i18n': i18n, '../../api/work-usage': stubApi });
const { WorkUsagePanel, monthlyLimitMinor } = await import(usageModule);
const tierModule = await compileModule('src/shell/website-platform/WebsiteTierPresets.tsx', { './website-preview-i18n': i18n, './WorkUsagePanel': usageModule });
const { WebsiteTierPresets } = await import(tierModule);
const runtimeModule = await compileModule('src/api/website-runtime.ts');
const { WebsiteRequestError } = await import(runtimeModule);
const { WebsiteConfiguration } = await import(await compileModule('src/shell/website-platform/WebsiteConfiguration.tsx', {
  './website-preview-i18n': i18n, './WorkUsagePanel': usageModule, './WebsiteTierPresets': tierModule,
  '../../api/website-connectors': dataModule('export const websiteConnectorsApi={};'),
  '../../api/website-runtime': runtimeModule,
  './SiteVaultPanel': dataModule('export function SiteVaultPanel(){return null;}'),
  '../works-workbench/WorkWorkbench': dataModule('const React=globalThis.__ucReact; export function WorkWorkbench({workId}){return React.createElement("div",{"data-open-work":workId},workId);}'),
}));
const { createRoot } = await import('react-dom/client');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const money = (amount_minor = 123) => ({ amount_minor, currency: 'USD' });
const limit = (overrides = {}) => ({ monthly_limit: money(1000), on_reach: 'stop', used: money(), reached: false, ...overrides });
const api = (overrides = {}) => ({ get: async () => ({ total: money(), lines: [] }), limit: async () => limit(), setLimit: async (_id, input) => limit(input), ...overrides });
const id = '11111111-1111-4111-8111-111111111111';
async function mount(Component, props) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return { host, root, async render(props) { await act(async () => root.render(React.createElement(Component, props))); }, async destroy() { await act(async () => root.unmount()); host.remove(); delete globalThis.__ucLocale; } };
}
async function click(button) { assert.ok(button); await act(async () => button.click()); }
async function change(select, value) { await act(async () => { select.value = value; select.dispatchEvent(new window.Event('change', { bubbles: true })); }); }
async function input(node, value) {
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
async function submit(host) { await act(async () => host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); }
const button = (host, text) => [...host.querySelectorAll('button')].find(node => node.textContent === text);
const tier = (overrides = {}) => ({ id: 'static', label: 'Static', label_zh: '静态展示', selections: {}, audience: 'Portfolios', audience_zh: '适合作品集', can_run: 'HTML', can_run_zh: '静态文件', cannot_run: 'Long jobs', cannot_run_zh: '长任务', billing: 'Attributed usage at cost', billing_zh: '按可归属用量成本计费', upgrade: 'Ask the agent to add functions', upgrade_zh: '让 agent 添加函数', available: true, status: 'available', sample: { tier_id: 'static', source: 'sample', create_path: 'https://untrusted.invalid' }, ...overrides });
const tierProps = (overrides = {}) => ({ projectId: id, api: { tiers: async () => [tier()] }, presets: [tier()], blocked: false, available: true, legacy: React.createElement('p', { 'data-legacy': true }, 'legacy presets'), onApply() {}, onOpen() {}, ...overrides });

function snapshot(slotOverrides = {}) {
  const detail = { connector_id: 'ours_fc', provider_kind: 'ours', label: 'FC', label_zh: '函数托管', slots: ['hosting'], cost_basis: 'at cost', rate_source: 'meter', limits: [], standard_interface: [], panels: [], agent_brief: '' };
  return { project_id: id, environment: 'preview', slots: [{ ...detail, slot: 'hosting', environment: 'production', status: 'not_ready', status_detail: 'Feature disabled', status_detail_zh: '托管尚未启用', selection_source: 'default', vault_refs: [], ...slotOverrides }], catalog: [{ ...detail, available: true }], presets: [], changes: [], persistence: { available: true, migration: 'fixture' } };
}

test('monthly usage and limit load independently, show lower-bound/unattributed lines and real totals', async () => {
  const read = deferred(); const m = await mount(WorkUsagePanel, { projectId: id, api: api({ get: () => read.promise }) });
  try {
    assert.match(m.host.querySelector('[data-testid="work-monthly-usage"]').textContent, /加载中/);
    assert.match(m.host.querySelector('[data-testid="work-monthly-limit"]').textContent, /80%.*100%/);
    await act(async () => read.resolve({ total: money(250), lines: ['metered', 'lower_bound', 'not_attributed'].map(basis => ({ kind: 'fc_requests', unit: 'request', quantity: 2, amount: money(basis === 'not_attributed' ? 0 : 125), basis })) }));
    assert.match(m.host.textContent, /2\.50/);
    assert.match(m.host.textContent, /按可确认的较低用量计费/); assert.match(m.host.textContent, /未计费：无法归属/);
    assert.equal(m.host.querySelectorAll('[data-usage-basis]').length, 3);
  } finally { await m.destroy(); }
});

test('usage read failure retries without showing zero; older routes and unavailable limit stay separate', async () => {
  let reads = 0;
  const m = await mount(WorkUsagePanel, { projectId: id, api: api({ get: async () => { if (++reads === 1) throw { status: 503 }; return { total: money(0), lines: [] }; }, limit: async () => { throw { status: 501 }; } }) });
  try {
    const usage = m.host.querySelector('[data-testid="work-monthly-usage"]');
    assert.match(usage.textContent, /暂时无法读取本月用量/); assert.doesNotMatch(usage.textContent, /合计/);
    assert.match(m.host.querySelector('[data-testid="work-monthly-limit"]').textContent, /此功能尚未在当前服务端开通/);
    await click(button(usage, '重试')); assert.match(usage.textContent, /本月尚无用量记录/);
  } finally { await m.destroy(); }
});

test('limit editor saves exact cents and notify, accepts zero, and removes the limit', async () => {
  const calls = []; const m = await mount(WorkUsagePanel, { projectId: id, api: api({ setLimit: async (...args) => { calls.push(args); return limit(args[1]); } }) });
  try {
    await input(m.host.querySelector('input'), '12.34');
    await change(m.host.querySelector('[aria-label="达到上限时"]'), 'notify'); await submit(m.host);
    assert.deepEqual(calls[0][1], { monthly_limit: money(1234), on_reach: 'notify' }); assert.match(m.host.textContent, /月度上限已保存/);
    await input(m.host.querySelector('input'), '0'); await submit(m.host); assert.equal(calls[1][1].monthly_limit.amount_minor, 0);
    await change(m.host.querySelector('[aria-label="上限"]'), 'none'); await submit(m.host); assert.equal(calls[2][1].monthly_limit, null);
  } finally { await m.destroy(); }
});

test('invalid decimals do not save; pending saves cannot double-submit or claim success early', async () => {
  const save = deferred(); let calls = 0;
  const m = await mount(WorkUsagePanel, { projectId: id, api: api({ setLimit: () => { calls++; return save.promise; } }) });
  try {
    await input(m.host.querySelector('input'), '-1'); await submit(m.host); assert.equal(calls, 0);
    await input(m.host.querySelector('input'), '1.234'); await submit(m.host); assert.equal(calls, 0);
    await input(m.host.querySelector('input'), '0.29'); await submit(m.host); await submit(m.host);
    assert.equal(calls, 1); assert.match(m.host.textContent, /保存中/); assert.doesNotMatch(m.host.textContent, /月度上限已保存/);
    await act(async () => save.resolve(limit({ monthly_limit: money(29), reached: true })));
    assert.match(m.host.textContent, /已达上限/); assert.equal(m.host.querySelector('input').value, '0.29');
  } finally { await m.destroy(); }
  for (const [raw, expected] of [['0', 0], ['0.29', 29], ['12.3', 1230], ['1e3', null], ['-1', null], ['', null], ['1.234', null], ['1000000000.01', null]]) assert.equal(monthlyLimitMinor(raw), expected);
});

test('unconfirmed limit save requires a fresh read before retry; missing writes explain the route', async () => {
  let saves = 0, reads = 0;
  const m = await mount(WorkUsagePanel, { projectId: id, api: api({ limit: async () => { reads++; return limit(); }, setLimit: async () => { saves++; throw { status: 404 }; } }) });
  try {
    await submit(m.host); assert.match(m.host.textContent, /此功能尚未在当前服务端开通/);
    await submit(m.host); assert.equal(saves, 1);
    await click(button(m.host, '重新读取上限')); assert.equal(reads, 2);
    assert.equal(button(m.host, '保存月度上限').disabled, false);
  } finally { await m.destroy(); }
});

test('late usage and limit reads are aborted when switching works', async () => {
  const old = deferred(), signals = []; const service = api({ get: (id, _range, signal) => { signals.push(signal); return id === 'old' ? old.promise : Promise.resolve({ total: money(200), lines: [] }); }, limit: async () => limit() });
  const m = await mount(WorkUsagePanel, { projectId: 'old', api: service });
  try {
    await m.render({ projectId: 'new', api: service }); assert.equal(signals[0].aborted, true);
    await act(async () => old.resolve({ total: money(9999), lines: [] }));
    assert.match(m.host.textContent, /2\.00/); assert.doesNotMatch(m.host.textContent, /99\.99/);
  } finally { await m.destroy(); }
});

test('tier cards display supplied zh/en metadata, disable unavailable tiers and apply the actual tier id', async () => {
  const applied = [], tiers = [tier(), tier({ id: 'request_billed', available: false, status: 'not_ready', status_detail: 'FC is disabled', status_detail_zh: '函数托管尚未启用' })];
  const m = await mount(WebsiteTierPresets, tierProps({ api: { tiers: async () => tiers }, onApply: id => applied.push(id) }));
  try {
    assert.match(m.host.textContent, /适合作品集.*静态文件.*长任务.*成本计费.*添加函数/s);
    const cards = m.host.querySelectorAll('[data-tier-id]'); await click(button(cards[0], '使用此层级')); assert.deepEqual(applied, ['static']);
    assert.equal(button(cards[1], '使用此层级').disabled, true); assert.equal(button(cards[1], '用样板新建一个作品看看').disabled, true);
    assert.match(cards[1].textContent, /暂不可用.*函数托管尚未启用/s);
    globalThis.__ucLocale = 'en'; await m.render(tierProps({ api: { tiers: async () => [tier()] } }));
    assert.match(m.host.textContent, /Portfolios.*HTML.*Long jobs.*Attributed usage at cost.*Ask the agent/s);
  } finally { await m.destroy(); }
});

test('tier loading, retry, route missing with legacy fallback and old injected APIs', async () => {
  const read = deferred(); const props = tierProps({ api: { tiers: () => read.promise }, presets: [{ id: 'landing_page', label: 'Legacy', selections: {} }] });
  const m = await mount(WebsiteTierPresets, props);
  try {
    assert.match(m.host.textContent, /加载中/); await act(async () => read.reject({ status: 503 })); assert.match(m.host.textContent, /暂时无法读取服务层级/);
    await m.render({ ...props, api: { tiers: async () => { throw { status: 404 }; } } });
    assert.match(m.host.textContent, /此功能尚未在当前服务端开通/); assert.ok(m.host.querySelector('[data-legacy]'));
    await m.render({ ...props, api: {} }); assert.ok(m.host.querySelector('[data-legacy]'));
    await m.render({ ...props, api: {}, presets: [tier()] }); assert.ok(m.host.querySelector('[data-tier-id="static"]'));
  } finally { await m.destroy(); }
});

test('sample creation opens the returned work and prevents duplicate in-flight creation', async () => {
  const created = deferred(), calls = [], opened = [];
  const m = await mount(WebsiteTierPresets, tierProps({ api: { tiers: async () => [tier()], createSample: (...args) => { calls.push(args); return created.promise; } }, onOpen: id => opened.push(id) }));
  try {
    await click(button(m.host, '用样板新建一个作品看看')); await click(button(m.host, '创建中…'));
    assert.equal(calls.length, 1); assert.deepEqual(calls[0].slice(0, 2), ['static', 'zh']); assert.deepEqual(opened, []);
    await act(async () => created.resolve({ project: { project_id: id }, tier_id: 'static' })); assert.deepEqual(opened, [id]);
  } finally { await m.destroy(); }
});

test('partial sample creation offers its receipt; unknown outcomes never auto-retry', async () => {
  for (const partial of [true, false]) {
    let calls = 0; const opened = [];
    const m = await mount(WebsiteTierPresets, tierProps({ api: { tiers: async () => [tier()], createSample: async () => { calls++; throw partial ? Object.assign(new Error('safe'), { name: 'WebsiteTierSampleError', status: 503, project_id: id }) : new Error('network'); } }, onOpen: id => opened.push(id) }));
    try {
      await click(button(m.host, '用样板新建一个作品看看')); assert.equal(button(m.host, '用样板新建一个作品看看').disabled, true);
      assert.match(m.host.textContent, partial ? /作品已创建/ : /创建结果尚未确认/);
      if (partial) { await click(button(m.host, '打开样板作品')); assert.deepEqual(opened, [id]); }
      await click(button(m.host, '刷新层级状态')); assert.equal(calls, 1);
    } finally { await m.destroy(); }
  }
});

test('configuration distinguishes not-ready and unconnected services and suppresses unusable apply', async () => {
  const data = snapshot(); const m = await mount(WebsiteConfiguration, { projectId: id, api: { get: async () => data }, usageApi: api(), onTaskCreated() {} });
  try {
    const row = m.host.querySelector('[data-testid="website-connector-hosting"]');
    assert.equal(row.querySelector('[data-connection-status]').textContent, '暂不可用'); assert.match(row.textContent, /托管尚未启用/);
    assert.equal(button(row, '应用').disabled, true); assert.equal(row.querySelector('[data-testid="request-billed-hosting-facts"]'), null);
  } finally { await m.destroy(); }
});

test('connected FC shows only returned function lines, last publish and manifest schedules as plain text', async () => {
  const state = { status: 'connected', status_detail_zh: '作品已发布', last_publish_at: '2026-11-18T01:00:00Z', schedules: [{ cron: '0 1 * * *', path: '/daily' }], state_lines: [{ label: 'State', label_zh: '函数状态', value: '<b>live</b>' }] };
  const m = await mount(WebsiteConfiguration, { projectId: id, api: { get: async () => snapshot(state) }, usageApi: api(), onTaskCreated() {} });
  try {
    const facts = m.host.querySelector('[data-testid="request-billed-hosting-facts"]'); assert.match(facts.textContent, /函数状态: <b>live<\/b>.*2026-11-18.*0 1 \* \* \*.*\/daily/s); assert.equal(facts.querySelector('b'), null);
    await m.render({ projectId: 'other', api: { get: async () => snapshot({ status: 'connected' }) }, usageApi: api(), onTaskCreated() {} });
    assert.equal(m.host.querySelector('[data-testid="request-billed-hosting-facts"]').textContent, '');
    assert.doesNotMatch(m.host.textContent, /最近发布|没有定时任务/);
  } finally { await m.destroy(); }
});

test('configuration sample success opens the ordinary workbench with the returned cloud work id', async () => {
  const original = snapshot(); const service = { get: async () => original, tiers: async () => [tier()], createSample: async () => ({ project: { project_id: id }, tier_id: 'static' }) };
  const m = await mount(WebsiteConfiguration, { projectId: 'original', api: service, usageApi: api(), onTaskCreated() {} });
  try {
    await click(button(m.host, '用样板新建一个作品看看'));
    for (let attempt = 0; attempt < 20 && !m.host.querySelector('[data-open-work]'); attempt++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    assert.equal(m.host.querySelector('[data-open-work]').getAttribute('data-open-work'), 'cloud:' + id);
    await click(button(m.host, '返回原作品配置')); assert.ok(m.host.querySelector('[data-testid="website-configuration"]'));
    assert.equal(original.slots[0].connector_id, 'ours_fc');
  } finally { await m.destroy(); }
});

test('all 17 locale dictionaries cover the same messages and preserve interpolation variables', () => {
  const keys = Object.keys(copy.zh); assert.equal(Object.keys(copy).length, 17); assert.equal(keys.length, 46);
  for (const [locale, dictionary] of Object.entries(copy)) {
    assert.deepEqual(Object.keys(dictionary), keys, locale);
    for (const key of keys) { assert.ok(dictionary[key].length, `${locale}: ${key}`); assert.deepEqual(dictionary[key].match(/\{\w+\}/g), key.match(/\{\w+\}/g), `${locale}: ${key}`); }
    if (locale !== 'zh') assert.notEqual(dictionary['此功能尚未在当前服务端开通'], '此功能尚未在当前服务端开通');
  }
});

test('missing usage storage names the unmet prerequisite and limit reads can retry', async () => {
  let calls = 0;
  const m = await mount(WorkUsagePanel, { projectId: id, api: api({ limit: async () => { if (++calls === 1) throw { status: 503, code: 'metering_unavailable' }; return limit(); } }) });
  try {
    const panel = m.host.querySelector('[data-testid="work-monthly-limit"]');
    assert.match(panel.textContent, /用量记录存储尚未就绪/); assert.equal(panel.querySelector('form'), null);
    await click(button(panel, '重试')); assert.ok(panel.querySelector('form'));
  } finally { await m.destroy(); }
});

test('sample missing route is honest and an unmounted creation cannot open a different work', async () => {
  const pending = deferred(), opened = [];
  let signal;
  const m = await mount(WebsiteTierPresets, tierProps({ api: { tiers: async () => [tier()], createSample: async () => { throw { status: 501 }; } } }));
  try {
    await click(button(m.host, '用样板新建一个作品看看')); assert.match(m.host.textContent, /此功能尚未在当前服务端开通/);
    await m.render(tierProps({ api: { tiers: async () => [tier()], createSample: (_tier, _locale, nextSignal) => { signal = nextSignal; return pending.promise; } }, onOpen: id => opened.push(id) }));
    await click(button(m.host, '用样板新建一个作品看看'));
  } finally { await m.destroy(); }
  assert.equal(signal.aborted, true); await act(async () => pending.resolve({ project: { project_id: id } })); assert.deepEqual(opened, []);
});

test('the real configuration translation hook resolves every locale without Chinese fallback', async () => {
  const module = await compileModule('src/shell/website-platform/website-preview-i18n.ts', {
    'next-intl': dataModule('export function useLocale(){return globalThis.__ucLocale||"zh";}'),
    '../../i18n/ui/useUI': dataModule('const tt=s=>s;export function useUI(){return tt;}'),
  });
  const { useWebsiteUI } = await import(module);
  function CopyProbe() { const tt = useWebsiteUI(); return React.createElement('div', null, tt('本月已用：{amount}', { amount: 'USD 1.23' })); }
  const m = await mount(CopyProbe, {});
  try { for (const locale of Object.keys(copy)) { globalThis.__ucLocale = locale; await m.render({ locale }); assert.equal(m.host.textContent, copy[locale]['本月已用：{amount}'].replace('{amount}', 'USD 1.23')); } }
  finally { await m.destroy(); }
});

test('a known tier availability rejection reports its reason without locking all future configuration', async () => {
  let calls = 0;
  const data = snapshot(); const service = { get: async () => data, tiers: async () => [tier()], preset: async () => { calls++; throw new WebsiteRequestError(409, { detail: { code: 'tier_unavailable' } }); } };
  const m = await mount(WebsiteConfiguration, { projectId: id, api: service, usageApi: api(), onTaskCreated() {} });
  try {
    await click(button(m.host, '使用此层级')); assert.match(m.host.textContent, /此层级暂不可用/);
    assert.equal(m.host.querySelector('[data-testid="website-connector-unconfirmed"]'), null);
    assert.equal(button(m.host, '使用此层级').disabled, false);
    await click(button(m.host, '使用此层级')); assert.equal(calls, 2);
  } finally { await m.destroy(); }
});
