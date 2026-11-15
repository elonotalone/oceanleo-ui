// UC-NONE: the server viewer is a mount, so it cannot drift into a second preview implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/shell/works/ServerWorkViewer.tsx',import.meta.url),'utf8');
test('server work viewer mounts the shared works workbench',()=>{assert.match(source,/<WorkWorkbench workId=\{item.id\}/);assert.doesNotMatch(source,/iframe|worksApi\.|setInterval|setTimeout/);});
