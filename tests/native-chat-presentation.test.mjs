import assert from 'node:assert/strict';
import test from 'node:test';
import {buildAgentRenderItems} from '../src/lib/agent-progress.ts';
import {nativeDeliveryStatus, nativeLastActivity, nativeThinkingVisible} from '../src/shell/native-chat-presentation.ts';

test('adjacent native turns keep separate process blocks, including autonomous work after a waiting prompt', () => {
  const messages = [
    {id:1,role:'user',kind:'text',content:'waiting',meta:{native_delivery:{state:'queued'}}},
    {id:2,role:'assistant',kind:'analysis',content:'finished work',meta:{native_turn_id:'prompt-turn',native_turn_live:false}},
    {id:3,role:'assistant',kind:'analysis',content:'background work',meta:{native_turn_id:'background-turn',native_turn_autonomous:true,native_turn_live:true}},
    {id:4,role:'assistant',kind:'step',content:'tool',meta:{native_turn_id:'background-turn',native_turn_autonomous:true,native_turn_live:true}},
  ];
  const items=buildAgentRenderItems(messages);
  assert.equal(items.length,3);
  assert.deepEqual(items.slice(1).map(item=>item.messages.map(row=>row.id)),[[2],[3,4]]);
});

test('only confirmed injection receives the current-run delivery label', () => {
  assert.equal(nativeDeliveryStatus('injected'),'已送入当前执行');
  for (const state of ['started_new_turn','accepted','delivered','unknown']) assert.equal(nativeDeliveryStatus(state),null);
  for (const state of ['sending','queued']) assert.equal(nativeDeliveryStatus(state),'等待处理');
  assert.equal(nativeDeliveryStatus('replaced'),'已替换');
  assert.equal(nativeDeliveryStatus('unsent'),'未发送');
  assert.equal(nativeDeliveryStatus('cancelled'),'已撤回');
});

test('loading old frames preserves their activity time and tool updates use their event time', () => {
  const old='2026-10-01T00:00:00Z', updated='2026-10-01T00:01:00Z';
  const messages=[
    {id:1,role:'assistant',kind:'step',content:'tool',created_at:old,meta:{native_updated_at:updated}},
    {id:2,role:'user',kind:'text',content:'queued',created_at:'2026-10-01T00:00:30Z'},
  ];
  assert.deepEqual(nativeLastActivity(messages),{at:updated,user:false});
  assert.equal(nativeLastActivity([{id:3,role:'user',kind:'text',content:'old imported'}]),null);
  assert.deepEqual(nativeLastActivity([...messages,
    {id:4,role:'assistant',kind:'notice',content:'reconnecting',created_at:'2026-11-01T00:00:00Z',meta:{native_notice:'computer_reconnecting'}},
  ]),{at:updated,user:false});
});

test('a queued prompt never borrows an autonomous turn thinking indicator, and idle or disconnected never thinks', () => {
  const prompt={id:1,role:'user',kind:'text',content:'hello',meta:{native_delivery:{state:'started_new_turn'}}};
  assert.equal(nativeThinkingVisible([prompt],true,true),true);
  assert.equal(nativeThinkingVisible([prompt],false,true),false);
  assert.equal(nativeThinkingVisible([prompt],true,false),false);
  for(const state of ['sending','queued','unsent','cancelled']) {
    assert.equal(nativeThinkingVisible([{...prompt,meta:{native_delivery:{state}}}],true,true),false);
  }
  assert.equal(nativeThinkingVisible([prompt,{id:2,role:'assistant',kind:'analysis',content:'working'}],true,true),false);
});
