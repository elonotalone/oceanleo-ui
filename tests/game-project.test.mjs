import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readGameProject, gameProjectEdits, gamePlayUrl, validGameFilePath, GAME_FILE_MAX_BYTES, GAME_PROJECT_MAX_BYTES } from '../src/shell/game-editor/game-project.ts';
import { gameFromRevisionJson, gameToArtifactJson } from '../src/shell/collab/adapters/game.ts';
import { gameSourceFormatAccess } from '../src/shell/artifact-contract.ts';
const file = (path, content, mediaType = 'text/html') => ({ path, content, mediaType, sha256: 'a'.repeat(64), byteSize: Buffer.byteLength(content) });
const project = () => ({ schema: 'game-project@1', title: '海岸', entrypoint: 'index.html', orientation: 'both', controls: ['touch'],
  files: [file('index.html', '<script src="js/game.js"></script>'), file('js/game.js', 'console.log("海岸")', 'application/javascript'),
    { path: 'art/a.webp', sha256: 'b'.repeat(64), byteSize: 45, mediaType: 'image/webp' }] });
test('reads many files and edits JS without requiring inline scripts, slots or a hidden runtime', () => {
  const value = readGameProject(project());
  assert.equal(value.files.length, 3);
  assert.deepEqual(gameProjectEdits(value, { 'js/game.js': 'export const score = 2;' }), [{ path: 'js/game.js', content: 'export const score = 2;' }]);
  assert.equal(value.files[2].sha256, 'b'.repeat(64));
});
test('legacy documents retain every byte and refuse writes', () => {
  const source = '<script data-leoplay-runtime="three@1">old</script><body>game</body>';
  const value = readGameProject({ source, sourceFormat: 'oceanleo.game-document.v1' });
  assert.equal(value.readOnly, true); assert.equal(value.files[0].content, source);
  assert.throws(() => gameProjectEdits(value, { 'index.html': 'changed' }), /只读/);
  assert.equal(gameSourceFormatAccess('game-project@1'), 'current');
  assert.equal(gameSourceFormatAccess('oceanleo.game-document.v1'), 'legacy-read-only');
});
test('rejects traversal, duplicate paths, invalid entrypoint, hashes and byte declarations', () => {
  for (const path of ['../x', '/x', 'a//x', 'a/./x', 'https://x', 'a%2fb', 'a\\b', 'a?b', 'a#b']) assert.equal(validGameFilePath(path), false, path);
  for (const mutate of [p => p.files.push(p.files[0]), p => p.entrypoint = 'missing.html', p => p.files[0].sha256 = 'bad', p => p.files[0].byteSize++, p => p.orientation = 'bad']) {
    const p = project(); mutate(p); assert.throws(() => readGameProject(p));
  }
});
test('validates 15 MB per file and 60 MB closure including binary assets', () => {
  const p = project(); p.files.push({ path: 'large.glb', sha256: 'a'.repeat(64), byteSize: GAME_FILE_MAX_BYTES + 1, mediaType: 'model/gltf-binary' });
  assert.throws(() => readGameProject(p));
  p.files = Array.from({ length: 5 }, (_, n) => ({ path: `${n}.bin`, sha256: 'a'.repeat(64), byteSize: GAME_PROJECT_MAX_BYTES / 4, mediaType: 'application/octet-stream' }));
  assert.throws(() => readGameProject(p));
  assert.throws(() => gameProjectEdits(readGameProject(project()), { 'js/game.js': 'x'.repeat(GAME_FILE_MAX_BYTES + 1) }), /15 MB/);
  assert.throws(() => gameProjectEdits(readGameProject(project()), { 'art/a.webp': 'replace' }), /文本/);
});
test('UC-1: only HTTPS game origins below oceanleo.app are playable', () => {
  assert.equal(gamePlayUrl('https://p-test.oceanleo.app/index.html?t=cap'), 'https://p-test.oceanleo.app/index.html?t=cap');
  for (const url of ['https://oceanleo.com/x', 'https://game.oceanleo.com', 'https://oceanleo.app', 'https://x.oceanleo.app.evil.test', 'http://x.oceanleo.app', 'https://user@x.oceanleo.app', 'https://x.oceanleo.app:8443']) assert.throws(() => gamePlayUrl(url), url);
});
test('UC-3/UC-6: project frame is opaque, no srcDoc and no arbitrary message bridge', () => {
  // docs/architecture/oceanleo-untrusted-content-isolation.md: UC-3 and UC-6.
  const source = readFileSync('src/shell/game-editor/GameProjectEditor.tsx', 'utf8');
  assert.match(source, /sandbox="allow-scripts allow-pointer-lock"/);
  assert.doesNotMatch(source, /allow-same-origin|srcDoc=|postMessage\(/);
  assert.match(source, /referrerPolicy="no-referrer"/);
});
test('replay retains all project files including assets; legacy still reads', () => {
  const p = readGameProject(project()); const state = gameFromRevisionJson(p);
  assert.deepEqual(state.pages.map(p => p.id), ['index.html', 'js/game.js', 'art/a.webp']);
  assert.deepEqual(gameToArtifactJson(state), p);
  state.pages[1].code = 'changed'; assert.throws(() => gameToArtifactJson(state), /先保存/);
  assert.equal(gameFromRevisionJson({ source: '<html>old</html>' }).pages[0].code, '<html>old</html>');
});
test('revision replay decodes text blobs but preserves binary transport bytes', () => {
  const p = project(); p.blobs = {};
  for (const f of p.files) {
    if (f.content !== undefined) { f.sha256 = (f.path.endsWith('.js') ? 'c' : 'a').repeat(64); p.blobs[f.sha256] = Buffer.from(f.content).toString('base64'); delete f.content; }
    else p.blobs[f.sha256] = Buffer.alloc(f.byteSize).toString('base64');
  }
  const read = readGameProject(p); assert.match(read.files[1].content, /海岸/);
  const snapshot = gameFromRevisionJson(p); const restored = gameToArtifactJson(snapshot);
  assert.deepEqual(restored.blobs, p.blobs); assert.equal(restored.files[2].sha256,p.files[2].sha256);
});
