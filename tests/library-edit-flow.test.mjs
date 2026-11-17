import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule } from './helpers/module-bench.mjs';
const { LibraryEditFlow, libraryEditContext, editIsLocked } = await import(await compileModule('src/shell/plugin-command/library-edit-flow.ts'));
const item = revisionId => ({ id: 'a', artifactId: 'a', revisionId, kind: 'document', artifactType: 'document', title: 'Report', meta: {} });
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function harness(overrides = {}) {
  const events = [], queue = [];
  let current = item('r1');
  const binding = { item: () => current, save: async () => { events.push('save'); current = item('r2'); return current; }, writable: () => true, context: () => ({ selection: { kind: 'text', from: 12, to: 26 }, excerpt: { ready: true, kind: 'text', content: 'Selected passage' } }), ...overrides.binding };
  const ports = { create: async (prompt, context, options) => { events.push(['task', prompt, context, options]); return 't1'; }, status: async () => ({ status: 'done', note: 'Updated selected paragraph' }), stop: async () => { events.push('stop'); }, head: async () => item('r3'), restore: async (old, expected) => { events.push(['restore', old.revisionId, expected]); return item('r4'); }, schedule: fn => queue.push(fn), ...overrides.ports };
  const flow = new LibraryEditFlow(current, ports);
  return { flow, binding, events, queue, ports, setItem: value => { current = value; } };
}
test('save finishes before dispatch; selection and new durable revision are pinned; task locks until reload', async () => {
  const save = deferred(), h = harness({ binding: { save: () => save.promise } });
  const phases = []; h.flow.subscribe(() => phases.push(h.flow.getSnapshot().phase));
  const started = h.flow.start('Improve it', h.binding, { orgId: 'org' });
  assert.equal(h.flow.getSnapshot().phase, 'saving'); assert.ok(editIsLocked('saving')); assert.equal(h.events.length, 0);
  save.resolve(item('r2')); assert.equal(await started, 't1');
  const context = h.events[0][2]; assert.match(context, /library_open/); assert.match(context, /library_save_revision/); assert.match(context, /ALL content/);
  const data = JSON.parse(context.split('\n').at(-1)); assert.equal(data.revisionId, 'r2'); assert.deepEqual(data.selection, { kind: 'text', from: 12, to: 26 });
  assert.equal(h.events[0][3].orgId, 'org'); assert.ok(editIsLocked(h.flow.getSnapshot().phase));
  await h.flow.poll(); assert.equal(h.flow.getSnapshot().item.revisionId, 'r3'); assert.equal(h.flow.getSnapshot().previous.revisionId, 'r2'); assert.equal(h.flow.getSnapshot().note, 'Updated selected paragraph'); assert.equal(h.flow.getSnapshot().reload, 1);
  assert.deepEqual(phases, ['saving','starting','running','reloading','done']);
});
test('failed save never dispatches and retains the source', async () => {
  const h = harness({ binding: { save: async () => { throw new Error('Save denied'); } } });
  assert.equal(await h.flow.start('change',h.binding),null); assert.equal(h.flow.getSnapshot().phase,'failed'); assert.equal(h.flow.getSnapshot().item.revisionId,'r1'); assert.equal(h.events.length,0);
});
test('view-only entry cannot start any save or task', async () => {
  const h=harness({binding:{writable:()=>false}}); await h.flow.start('change',h.binding); assert.equal(h.events.length,0); assert.equal(h.flow.getSnapshot().phase,'failed');
});
test('file switch during save refuses dispatch',async()=>{
  const h=harness({binding:{save:async()=>({...item('r2'),artifactId:'other'})}}); await h.flow.start('change',h.binding); assert.equal(h.events.length,0);assert.equal(h.flow.getSnapshot().phase,'failed');
});
test('whole-file editing works without a selection',async()=>{
  const h=harness({binding:{context:()=>({selection:{kind:'whole-file'},excerpt:{ready:true,kind:'structured',content:{title:'Report'}}})}}); await h.flow.start('change',h.binding);
  assert.deepEqual(JSON.parse(h.events[1][2].split('\n').at(-1)).selection,{kind:'whole-file'});
});
test('conflict does not reload or discard saved local work',async()=>{
  const h=harness({ports:{status:async()=>({status:'failed',conflict:true})}});await h.flow.start('change',h.binding);await h.flow.poll();assert.equal(h.flow.getSnapshot().phase,'conflict');assert.equal(h.flow.getSnapshot().item.revisionId,'r2');assert.equal(h.flow.getSnapshot().reload,0);
});
test('stop during save prevents creation',async()=>{
  const save=deferred(),h=harness({binding:{save:()=>save.promise}});const started=h.flow.start('change',h.binding);await h.flow.stop();save.resolve(item('r2'));assert.equal(await started,null);assert.equal(h.flow.getSnapshot().phase,'stopped');assert.equal(h.events.length,0);
});
test('stop during task creation uses that same task and waits for terminal acknowledgement',async()=>{
  const create=deferred(),h=harness({ports:{create:()=>create.promise,status:async()=>({status:'stopped'})}});const started=h.flow.start('change',h.binding);await Promise.resolve();await h.flow.stop();create.resolve('t1');assert.equal(await started,'t1');assert.equal(h.events.filter(e=>e==='stop').length,1);assert.equal(h.flow.getSnapshot().phase,'stopping');assert.ok(editIsLocked('stopping'));await h.flow.poll();assert.equal(h.flow.getSnapshot().phase,'stopped');assert.equal(h.flow.getSnapshot().item.revisionId,'r3');
});
test('stop failure retains the lock and task identity',async()=>{
  const h=harness({ports:{stop:async()=>{throw Error('offline')},status:async()=>({status:'running'})}});await h.flow.start('change',h.binding);await h.flow.stop();assert.equal(h.flow.getSnapshot().phase,'stopping');assert.equal(h.flow.getSnapshot().taskId,'t1');await h.flow.poll();assert.ok(editIsLocked(h.flow.getSnapshot().phase));
});
test('transport failure while polling never dispatches twice or unlocks an active task',async()=>{
  const h=harness({ports:{status:async()=>{throw Error('offline')}}});await h.flow.start('change',h.binding);await h.flow.poll();assert.equal(h.flow.getSnapshot().phase,'running');assert.equal(h.events.filter(Array.isArray).length,1);assert.ok(h.queue.length>=2);
});
test('a second request during work cannot create a concurrent edit task',async()=>{
  const h=harness();await h.flow.start('first',h.binding);assert.equal(await h.flow.start('second',h.binding),null);assert.equal(h.events.filter(Array.isArray).length,1);
});
test('task failure after commit still reloads the saved revision and explains failure',async()=>{
  const h=harness({ports:{status:async()=>({status:'failed',error:'Render failed after save'})}});await h.flow.start('change',h.binding);await h.flow.poll();assert.equal(h.flow.getSnapshot().phase,'failed');assert.equal(h.flow.getSnapshot().reload,1);assert.equal(h.flow.getSnapshot().error,'Render failed after save');
});
test('undo preserves newer manual edits and refuses a stale head',async()=>{
  const h=harness({ports:{head:async()=>item('r9')}});await h.flow.start('change',h.binding);await h.flow.poll();await h.flow.undo();assert.equal(h.flow.getSnapshot().phase,'conflict');assert.equal(h.events.filter(e=>Array.isArray(e)&&e[0]==='restore').length,0);
});
test('undo uses CAS to restore the previous revision as another same-item revision',async()=>{
  const h=harness();await h.flow.start('change',h.binding);await h.flow.poll();h.binding.save=async()=>item('r3');await h.flow.undo();assert.equal(h.flow.getSnapshot().item.revisionId,'r4');assert.equal(h.flow.getSnapshot().previous,undefined);assert.deepEqual(h.events.at(-1),['restore','r2','r3']);assert.equal(h.flow.getSnapshot().reload,2);
});
test('an uncommitted task result never reports a new file revision',async()=>{
  const h=harness({ports:{head:async()=>item('r2'),status:async()=>({status:'done'})}});await h.flow.start('change',h.binding);await h.flow.poll();assert.equal(h.flow.getSnapshot().reload,0);assert.match(h.flow.getSnapshot().note,/没有保存/);
});
test('missing durable identity cannot enter the task context',()=>{assert.throws(()=>libraryEditContext({id:'local'}, {kind:'whole-file'},{ready:false,reason:'loading'}));});
test('undo uses the reloaded editor binding rather than the departed editor save callback',async()=>{
 const h=harness();await h.flow.start('change',h.binding);await h.flow.poll();let saved=0;h.flow.bind({...h.binding,save:async()=>{saved++;return item('r3')}});await h.flow.undo();assert.equal(saved,1);assert.equal(h.flow.getSnapshot().item.revisionId,'r4');
});
