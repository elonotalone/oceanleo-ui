import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/shell/works/ServerWorkViewer.tsx', import.meta.url), 'utf8');

test('server work viewer exposes preview state machine and safe ready iframe', () => {
  for (const marker of ['"starting"', '"ready"', '"failed"', '电脑离线', 'sandbox={webViewerFrameSandbox(false)}', 'worksApi.preview', 'worksApi.stop', 'worksApi.remove']) {
    assert.ok(source.includes(marker), `missing ${marker}`);
  }
  assert.match(source, /PREVIEW_TIMEOUT_MS\s*=\s*90_000/);
});
