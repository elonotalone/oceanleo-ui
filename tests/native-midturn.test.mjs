import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDialog, initialDialogState, restoreNativeMessages, dialogToAgentMessages, mergeNativeDialogPages } from '../src/native-agent-core/index.ts';
const start = () => ({...initialDialogState(), program:'claude', activeSession:'s'});
const frame = (state, fields) => applyDialog(state, {type:'frame', frame:{program:'claude', acp_session:'s', ...fields}});
const user = (state, id, text=id, turn_id) => frame(state, {t:'user_message', message_id:id, text, turn_id});
const turns = state => state.messages.filter(m=>m.kind==='turn');

for (const state of ['sending','queued','injected','replaced','started_new_turn','delivered','unsent','cancelled']) {
  test(`durable message state ${state} is retained on the addressed bubble and exposed to the host`,()=>{
    let s=user(user(start(),'one'),'two');
    s=frame(s,{t:'prompt_ack', message_id:'one',turn_id:'t1',state,uncertain:state==='unsent'});
    assert.equal(s.messages[0].delivery.state,state);
    assert.equal(s.messages[0].turnId,'t1');
    assert.equal(s.messages[1].delivery,undefined);
    const mapped=dialogToAgentMessages(s.messages,{live:true});
    assert.equal(mapped[0].meta.native_delivery.state,state);
    assert.equal(mapped[0].meta.native_message_id,'one');
    assert.equal(mapped[0].meta.native_turn_id,'t1');
  });
}

test('late deltas, tools, thoughts, plans and final boundaries stay with the original turn after consecutive inputs',()=>{
  let s=user(start(),'one','first','t1');
  s=frame(s,{t:'turn_start',turn_id:'t1'});
  s=frame(s,{t:'delta',turn_id:'t1',text:'A'});
  s=user(s,'two','follow up','t2');
  s=frame(s,{t:'prompt_state',message_id:'two',state:'queued',turn_id:'t2'});
  s=frame(s,{t:'thought',turn_id:'t1',text:'thinking'});
  s=frame(s,{t:'tool',turn_id:'t1',id:'tool1',title:'read',kind:'read',status:'completed'});
  s=frame(s,{t:'plan',turn_id:'t1',entries:[{content:'step',status:'completed',priority:'high'}]});
  s=frame(s,{t:'delta',turn_id:'t1',text:'B'});
  s=frame(s,{t:'done',turn_id:'t1',stop:'end_turn'});
  assert.equal(turns(s).length,1);
  assert.equal(turns(s)[0].turnId,'t1');
  assert.deepEqual(turns(s)[0].items.map(m=>m.kind),['assistant','thought','tool','plan','assistant']);
  assert.equal(turns(s)[0].items.at(-1).text,'B');
  assert.equal(s.busy,false,'a queued second message remains visible without asserting active execution');
  assert.equal(s.messages.find(m=>m.messageId==='two').delivery.state,'queued');
  s=frame(s,{t:'prompt_state',message_id:'two',state:'started_new_turn',turn_id:'t2'});
  s=frame(s,{t:'turn_start',turn_id:'t2'});
  s=frame(s,{t:'delta',turn_id:'t2',text:'C'});
  s=frame(s,{t:'done',turn_id:'t1',stop:'end_turn'});
  assert.equal(s.busy,true,'duplicate old done cannot settle the new execution');
  assert.equal(turns(s)[1].items[0].text,'C');
  s=frame(s,{t:'done',turn_id:'t2',stop:'end_turn'});
  assert.equal(s.busy,false);
});

test('same message ID deduplicates anywhere in history; repeated text with different IDs remains distinct',()=>{
  let s=user(user(start(),'one','same'),'two','same');
  s=frame(s,{t:'turn_start',turn_id:'t1'});
  s=user(s,'one','same','t1');
  assert.equal(s.messages.filter(m=>m.kind==='user').length,2);
  const before=s.messages[0].id;
  s=frame(s,{t:'user_message',message_id:'one',text:'same',acp_session:'new-native'});
  assert.equal(s.messages[0].id,before,'identity survives provisional-session binding');
});

test('history restores each message state, absent queued/withdrawn users and attachment metadata',()=>{
  const rows=[
    {message_id:'two',turn_id:'t2',state:'cancelled',payload:{text:'second',attachments:[{name:'a.png',mime:'image/png',path:'/inbox/a.png'}]}},
    {message_id:'one',turn_id:'t1',state:'unsent',uncertain:true,payload:{text:'first'}},
  ];
  const s=restoreNativeMessages(start(),rows);
  assert.deepEqual(s.messages.map(m=>m.messageId),['one','two']);
  assert.deepEqual(s.messages.map(m=>m.delivery.state),['unsent','cancelled']);
  assert.equal(s.messages[0].delivery.uncertain,true);
  assert.equal(s.messages[1].attachments[0].path,'/inbox/a.png');
  assert.equal(restoreNativeMessages(s,rows).messages.length,2);
});

test('reload/live merge uses message and turn IDs across a later user input and keeps saved delivery metadata',()=>{
  let saved=user(start(),'one','first','t1');
  saved=frame(saved,{t:'delta',turn_id:'t1',text:'A'});
  saved=user(saved,'two','second','t2');
  saved=frame(saved,{t:'prompt_state',message_id:'two',turn_id:'t2',state:'queued'});
  let live=user(start(),'two','second','t2');
  live=frame(live,{t:'delta',turn_id:'t1',text:'AB'});
  const merged=mergeNativeDialogPages(saved.messages,live.messages);
  assert.deepEqual(merged.map(m=>m.kind==='turn'?m.turnId:m.messageId),['one','t1','two']);
  assert.equal(merged[1].items[0].text,'AB');
  assert.equal(merged[2].delivery.state,'queued');
});

test('a delayed chunk for an already completed turn does not reopen its occupancy',()=>{
  let s=frame(user(start(),'one'),{t:'delta',turn_id:'t1',text:'A'});
  s=frame(s,{t:'done',turn_id:'t1',stop:'end_turn'});
  s=frame(s,{t:'delta',turn_id:'t1',text:'B'});
  assert.equal(s.busy,false);
  assert.equal(turns(s).length,1);
  assert.equal(turns(s)[0].items[0].text,'AB');
  assert.equal(turns(s)[0].stop,'end_turn');
});

test('the first late output after reconnect is inserted under its original message even when a follow-up arrived first',()=>{
  let s=user(user(start(),'one','first','t1'),'two','second','t2');
  s=frame(s,{t:'delta',turn_id:'t1',text:'belongs to first'});
  assert.deepEqual(s.messages.map(m=>m.kind==='turn'?m.turnId:m.messageId),['one','t1','two']);
});

test('adding durable inputs to a legacy conversation does not duplicate its replayed history',()=>{
  const saved=[{kind:'user',id:'saved-u',text:'earlier'}, {kind:'turn',id:'saved-t',acpSession:'s',stop:'end_turn',items:[{kind:'assistant',id:'saved-a',text:'answer'}]}];
  const live=[{kind:'user',id:'live-u',text:'earlier'}, {kind:'turn',id:'live-t',acpSession:'s',stop:'end_turn',items:[{kind:'assistant',id:'live-a',text:'answer'}]}, {kind:'user',id:'frame:claude:new',messageId:'new',text:'follow-up',delivery:{state:'queued'}}];
  const merged=mergeNativeDialogPages(saved,live);
  assert.equal(merged.length,3);
  assert.equal(merged[1].items.length,1);
  assert.equal(merged[2].messageId,'new');
});
