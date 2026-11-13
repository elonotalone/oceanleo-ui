import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
await import('./agent-chat-conversations.test.mjs');
const {mount,settle,submit,posts}=globalThis.__agentChatHarness;
const {putPending,settlePending}=await import('../src/shell/acp-task/pending-send.ts');

test('retry after project task creation failed preserves the project, message id and model',async()=>{
  const requestId='55555555-5555-4555-8555-555555555555';
  const projectId='11111111-1111-4111-8111-111111111111';
  const pendingId=putPending({clientMessageId:requestId,computerId:'cc_elon',program:'claude',projectId,text:'Project task',attachments:[],choice:{model:'opus'}});
  const view=await mount({pendingId},{url:`/tasks/new?pending=${pendingId}`,
    catalog:{models:{currentModelId:'opus',availableModels:[{modelId:'opus',name:'Opus'}]}}});
  try{
    await act(async()=>settlePending(pendingId,{error:new Error('Connection failed')}));await settle();
    await act(async()=>view.host.querySelector('[data-acp-pending-retry]').click());await settle();
    const creates=globalThis.__gateway.filter(call=>call.method==='POST'&&call.path.endsWith('/task-sessions'));
    assert.equal(creates.length,1);
    assert.deepEqual(creates[0].body,{kind:'acp',program:'claude',request_id:requestId,project_id:projectId});
    const send=posts('/v1/tasks/t_new/send')[0];
    assert.equal(send.body.client_message_id,requestId);
    assert.equal(send.body.model,'opus');
  }finally{await view.unmount();}
});
