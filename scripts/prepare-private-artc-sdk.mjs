// Reproducible mechanical dependency rewrite. Never run on an unreviewed SDK.
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

export const UPSTREAM_SHA256 = 'ef9c768984463027dad8aa064bda7180d1fecb23c037902b5bc264797dc6c74d';
export const PRIVACY_REVISION = 'oceanleo-remote-artc-7.3.8-private-v1';
const root = fileURLToPath(new URL('../', import.meta.url));
export function privateSdk(source) {
  if (createHash('sha256').update(source).digest('hex') !== UPSTREAM_SHA256) throw Error('Unreviewed ARTC SDK digest');
  function replaceOnce(before, after) {
    if (source.split(before).length !== 2) throw Error('ARTC privacy patch anchor changed');
    source = source.replace(before, after);
  }
  // NONE only suppresses console output upstream; it still serializes tokens
  // into logCache. Disable the collector before any argument serialization.
  replaceOnce(`    S(this, "logMethod", (i, e = console.log) => (...t) => {
      let r = ra();
      this.logLevel <= i && e(r, ...t);
      let s = Ze.paramArrayToString(t);
      i > 0 && this.addLog(s);
    });`, `    S(this, "logMethod", () => () => undefined); // OceanLeo: no diagnostic serialization.`);
  replaceOnce('    i && (this.globalEnv = i), this.ensureBeforeUnloadHandler(), this.reset(), this.startSTSUpdateTask();',
    '    i && (this.globalEnv = i), this.reset(); // OceanLeo: no logger STS/upload timer.');
  replaceOnce('    this.initParam(i), this.createTracker(), this.startSTSUpdateTask();',
    '    return; // OceanLeo: no structured diagnostic tracker or persistent UUID.');
  replaceOnce('    i && (i.tm = i.tm || (/* @__PURE__ */ new Date()).getTime(), A.debug("[ConsoleLogger]", "log", i), this.logClient.sendReport(i));',
    '    return; // OceanLeo: discard structured diagnostics, including jntoken/nonce.');
  replaceOnce('  sendReport(i) {\n    var r;',
    '  sendReport(i) {\n    return; // OceanLeo: defense in depth for direct diagnostic callers.\n    var r;');
  // Independent ARMS error/health proxy: disable only this module's instance,
  // not a global window flag that could affect unrelated call clients.
  replaceOnce('disabled: window.AliRtcOptionsDisableProxy === !0, deferRegionSet: !0',
    'disabled: true, deferRegionSet: !0');
  // The lower-level RTS transport has an independent fourth reporter with
  // signed playback URLs. Disable initialization and its final collector.
  replaceOnce(`    this.customReporter = i == null ? void 0 : i.customReporter, this.ct = i && i.customTag ? i.customTag : "", this.enableLog = !i || i.trackLog != 0, this._initParam();
    let e = "cn-hangzhou.log.aliyuncs.com", t = "videocloud", r = "live-client-log";
    (i == null ? void 0 : i.env) === "SEA" && (e = "ap-southeast-1.log.aliyuncs.com", t = "videocloud-sgp", r = "live-client-log"), this.slsTracker = new Po({ host: e, project: t, logstore: r, time: 10, count: 10 });`,
    '    this.customReporter = undefined; this.ct = ""; this.enableLog = false; this.param = {}; this.slsTracker = null;');
  replaceOnce('  reporter(i) {\n    var t;',
    '  reporter(i) {\n    return; // OceanLeo: no RTS signed-URL diagnostic collection.\n    var t;');
  // Fail closed even if a future local edit calls either private scheduler.
  const scheduler = '  startSTSUpdateTask() {\n    return w(this, null, function* () {';
  if (source.split(scheduler).length !== 3) throw Error('Unexpected SDK diagnostic scheduler count');
  source = source.replaceAll(scheduler, '  startSTSUpdateTask() {\n    return; // OceanLeo: diagnostic STS requests disabled.\n    return w(this, null, function* () {');
  // A few RTS retry/error branches bypass all collectors and call console
  // directly with signed URLs. Shadow console in this module only; never
  // replace window.console or affect other app/call diagnostics.
  const consoleSink = 'const console = Object.freeze(Object.fromEntries(["log","info","debug","warn","error","trace","group","groupCollapsed","groupEnd","table","time","timeEnd","timeLog","assert","count","countReset","clear","dir","dirxml"].map(name => [name, () => undefined])));';
  return `// Mechanically derived from aliyun-rtc-sdk@7.3.8; upstream SHA256 ${UPSTREAM_SHA256}.\n// See README.md and scripts/prepare-private-artc-sdk.mjs; media/signaling code unchanged.\n${consoleSink}\n${source}\nexport const OCEANLEO_REMOTE_PRIVACY = ${JSON.stringify(PRIVACY_REVISION)};\n`;
}
export async function generate() {
  const source = await readFile(path.join(root, 'node_modules/aliyun-rtc-sdk/dist/aliyun-rtc-sdk.es.js'), 'utf8');
  const output = privateSdk(source);
  const destination = path.join(root, 'vendor/remote-artc/aliyun-rtc-sdk.private.mjs');
  await mkdir(path.dirname(destination), {recursive: true});
  await writeFile(destination, output);
  return {upstreamSha256: UPSTREAM_SHA256, outputSha256: createHash('sha256').update(output).digest('hex')};
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) console.log(JSON.stringify(await generate()));
