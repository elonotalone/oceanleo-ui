#!/usr/bin/env node
/** Parent-operated immutable font delivery. Default is local validation only. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function fontObjects(root) {
  const raw = await readFile(path.join(root, 'manifest.json'));
  const manifest = JSON.parse(raw);
  if (!/^assets\/fonts\/noto\/(?:material-legacy-)?[a-f0-9]{12}-woff2-v\d+$/.test(manifest.prefix)) throw Error('font prefix refused');
  const specs = manifest.fonts.flatMap(font => [
    ...font.subsets.map(subset => ({ path: subset.path, sha256: subset.sha256, type: 'font/woff2' })),
    { path: font.licensePath, sha256: font.licenseSha256, type: 'text/plain; charset=utf-8' },
  ]);
  const objects = new Map();
  for (const spec of specs) {
    if (!/^[a-zA-Z0-9/_.-]+$/.test(spec.path) || spec.path.split('/').some(p => !p || p === '..' || p === '.')) throw Error('font path refused');
    const body = await readFile(path.join(root, spec.path));
    if (sha(body) !== spec.sha256) throw Error('font digest mismatch');
    if (spec.type === 'font/woff2' && body.subarray(0,4).toString() !== 'wOF2') throw Error('font bytes refused');
    if (spec.type.startsWith('text/') && !/OPEN FONT LICENSE|Bitstream|Bitstream Vera/i.test(body.toString())) throw Error('font licence missing');
    objects.set(spec.path, { ...spec, body, key: `${manifest.prefix}/${spec.path}` });
  }
  objects.set('manifest.json', { path: 'manifest.json', body: raw, sha256: sha(raw), type: 'application/json; charset=utf-8', key: `${manifest.prefix}/manifest.json` });
  return [...objects.values()];
}

function credentials() {
  if (process.env.ALIYUN_OSS_ACCESS_KEY_ID && process.env.ALIYUN_OSS_ACCESS_KEY_SECRET) return {
    ossKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID, ossKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
  };
  // Existing server helper resolves only OSS values; never reads database/user tokens.
  const program = "import json,sys;sys.path.insert(0,'/app');from app.tools.oss_cn._oss import resolve_creds;c=resolve_creds();print(json.dumps({'ossKeyId':c.access_key_id,'ossKeySecret':c.access_key_secret}))";
  return JSON.parse(execFileSync('/usr/bin/docker', ['exec','-w','/app','-e','PYTHONPATH=/app','oceandino-lucy-service','python','-c',program], { encoding:'utf8', stdio:['ignore','pipe','pipe'] }).trim().split('\n').at(-1));
}

export async function deliver(objects, transport, { source }) {
  for (const object of objects) {
    const before = await transport({ source, method:'HEAD', key:object.key });
    if (before.status === 200) {
      const existing = await transport({ source, key:object.key });
      if (existing.status !== 200 || sha(existing.body) !== object.sha256) throw Error('existing font differs; overwrite refused');
    } else if (before.status === 404) {
      const put = await transport({ source, method:'PUT', key:object.key, body:object.body, headers:{
        'Content-Type': object.type, 'Cache-Control':'public, max-age=31536000, immutable',
        'x-oss-object-acl':'public-read', 'x-oss-forbid-overwrite':'true', 'x-oss-meta-sha256':object.sha256,
      } });
      if (put.status !== 200) throw Error('font delivery failed');
    } else throw Error('font preflight failed');
    const check = await transport({ source, key:object.key });
    if (check.status !== 200 || sha(check.body) !== object.sha256) throw Error('font verification failed');
  }
}

async function main() {
  const { values } = parseArgs({ options:{ root:{type:'string'},target:{type:'string',default:'mirror'},write:{type:'boolean',default:false},helpers:{type:'string',default:'/root/projects/oceandino/scripts/oceanleo-asset-mirror.mjs'} } });
  if (!values.root || !['source','mirror'].includes(values.target)) throw Error('use --root DIR [--target source|mirror] [--write]');
  const objects = await fontObjects(values.root);
  if (!values.write) { console.log(JSON.stringify({ mode:'dry-run',target:values.target,objects:objects.length,bytes:objects.reduce((sum,o)=>sum+o.body.length,0) })); return; }
  const { ossRequest } = await import(pathToFileURL(values.helpers));
  const creds = credentials();
  await deliver(objects, request => ossRequest(creds, request), { source:values.target === 'source' });
  console.log(JSON.stringify({ mode:'verified',target:values.target,objects:objects.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Font delivery failed; no credentials or private response are logged.'); process.exitCode=1; });
}
