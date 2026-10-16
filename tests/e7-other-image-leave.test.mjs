import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Image page switch keeps the Fabric canvas and does not wait on a third-party flush', () => {
  const source = readFileSync('src/shell/advanced-routes/ImageRoute.tsx', 'utf8');
  assert.match(source, /setEditorMode = useCallback\(\(mode: EditorMode\)/);
  assert.match(source, /setPluginModeState\(applyImageL0Mode\(mode\)\.mode\)/);
  assert.match(source, /<FabricImageStage /);
  assert.equal(/<iframe/i.test(source), false);
  assert.match(source, /flush: saveBeforeNewConversation/);
  assert.match(source, /hasUnsavedChanges: \(\) => editor\.dirty/);
  assert.match(source, /autoSave: true/);
});
