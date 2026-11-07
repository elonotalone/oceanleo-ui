import assert from 'node:assert/strict';
import test from 'node:test';
import {buildAgentRenderItems} from '../src/lib/agent-progress.ts';

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
