import assert from "node:assert/strict";
import test from "node:test";

import {
  PHOTOPEA_DONE,
  PHOTOPEA_EXPORT_SCRIPT,
  PHOTOPEA_INITIAL_STATE,
  PHOTOPEA_ORIGIN,
  PHOTOPEA_PRELOAD,
  buildPhotopeaConfig,
  classifyPhotopeaMessage,
  photopeaBytesToDataUrl,
  photopeaLaunchUrl,
  photopeaReducer,
  photopeaShouldMountFrame,
} from "../src/shell/image-editor/photopea-bridge.ts";

const bytes = (values) => new Uint8Array(values).buffer;

function drive(actions, state = PHOTOPEA_INITIAL_STATE) {
  return actions.reduce((current, action) => photopeaReducer(current, action), state);
}

const message = (data, origin = PHOTOPEA_ORIGIN) => ({
  type: "message",
  message: classifyPhotopeaMessage({ origin, data }),
});

test("nothing loads until the user opens professional mode", () => {
  assert.equal(PHOTOPEA_PRELOAD, false);
  assert.equal(PHOTOPEA_INITIAL_STATE.phase, "closed");
  assert.equal(photopeaShouldMountFrame(PHOTOPEA_INITIAL_STATE), false);

  // 关闭态收到任何消息都不许把 iframe 拉起来——否则「不预载广告」就是空话。
  // 文档消息要单独试：它是唯一一条会自己把 phase 推到 returned 的分支。
  const nudged = drive([
    message(PHOTOPEA_DONE),
    message("some log line"),
    message(bytes([0x38, 0x42, 0x50, 0x53])),
    { type: "request-export" },
  ]);
  assert.deepEqual(nudged, PHOTOPEA_INITIAL_STATE, "关闭态的任何一条消息都不许改状态");
  assert.equal(photopeaShouldMountFrame(nudged), false);
});

test("opening mounts the frame and closing takes it back down", () => {
  const opened = photopeaReducer(PHOTOPEA_INITIAL_STATE, { type: "open" });
  assert.equal(opened.phase, "launching");
  assert.equal(photopeaShouldMountFrame(opened), true);

  const closed = photopeaReducer(opened, { type: "close" });
  assert.deepEqual(closed, PHOTOPEA_INITIAL_STATE);
  assert.equal(photopeaShouldMountFrame(closed), false);
});

test("only Photopea's own origin is parsed", () => {
  assert.deepEqual(classifyPhotopeaMessage({ origin: PHOTOPEA_ORIGIN, data: PHOTOPEA_DONE }), {
    kind: "script-done",
  });

  // 邻近但不相同的来源必须落在 foreign：子域、http、带端口、以及把它当前缀的钓鱼域。
  for (const origin of [
    "https://photopea.com",
    "http://www.photopea.com",
    "https://www.photopea.com.evil.test",
    "https://www.photopea.com:8443",
    "null",
    undefined,
  ]) {
    assert.deepEqual(
      classifyPhotopeaMessage({ origin, data: bytes([1, 2, 3]) }),
      { kind: "foreign" },
      String(origin),
    );
  }

  const afterForeignDocument = drive([
    { type: "open" },
    message(PHOTOPEA_DONE),
    message(bytes([0x38, 0x42, 0x50, 0x53]), "https://www.photopea.com.evil.test"),
  ]);
  assert.equal(afterForeignDocument.phase, "ready");
  assert.equal(afterForeignDocument.document, null);
});

test("a full round trip ends holding the edited PSD bytes", () => {
  const psd = bytes([0x38, 0x42, 0x50, 0x53, 0x00, 0x01]);
  const state = drive([
    { type: "open" },
    message(PHOTOPEA_DONE),
    { type: "request-export" },
    message(psd),
    message(PHOTOPEA_DONE),
  ]);
  assert.equal(state.phase, "returned");
  assert.deepEqual(new Uint8Array(state.document), new Uint8Array(psd));

  // 取回后可以再改一轮，不必关掉重开。
  const second = drive(
    [{ type: "request-export" }, message(bytes([0x38, 0x42, 0x50, 0x53, 0x02]))],
    state,
  );
  assert.equal(second.phase, "returned");
  assert.deepEqual(new Uint8Array(second.document), new Uint8Array([0x38, 0x42, 0x50, 0x53, 0x02]));
});

test("export is refused before the editor reports itself ready", () => {
  const tooEarly = drive([{ type: "open" }, { type: "request-export" }]);
  assert.equal(
    tooEarly.phase,
    "launching",
    "Photopea 会丢掉就绪前发来的脚本，改成 exporting 就会永远等不到回包",
  );

  const afterReady = drive([{ type: "open" }, message(PHOTOPEA_DONE), { type: "request-export" }]);
  assert.equal(afterReady.phase, "exporting");
});

test("typed-array payloads are copied out at their own byte offset", () => {
  const backing = new Uint8Array([9, 9, 0x38, 0x42, 0x50, 0x53]);
  const view = new Uint8Array(backing.buffer, 2, 4);
  const classified = classifyPhotopeaMessage({ origin: PHOTOPEA_ORIGIN, data: view });
  assert.equal(classified.kind, "document");
  assert.deepEqual(
    new Uint8Array(classified.bytes),
    new Uint8Array([0x38, 0x42, 0x50, 0x53]),
    "取 view.buffer 而不按 byteOffset 切，会把前面两个字节也当成文件头",
  );
});

test("the log keeps the last twenty lines and drops empty ones", () => {
  const noisy = drive([
    { type: "open" },
    message(PHOTOPEA_DONE),
    ...Array.from({ length: 25 }, (_unused, index) => message(`line ${index}`)),
    message(42),
  ]);
  assert.equal(noisy.log.length, 20);
  assert.equal(noisy.log.at(0), "line 5");
  assert.equal(noisy.log.at(-1), "line 24");
});

test("launch config carries the document and never turns on Photopea's own saving", () => {
  const empty = buildPhotopeaConfig();
  assert.deepEqual(empty.files, [], "没有文档时不许硬塞一个空串，Photopea 会当成加载失败");
  assert.equal(empty.environment.localsave, false);
  assert.equal(empty.environment.autosave, false);
  assert.equal(empty.environment.theme, 1);
  assert.equal(buildPhotopeaConfig({ theme: "light" }).environment.theme, 2);

  const dataUrl = "data:image/vnd.adobe.photoshop;base64,OEJQUw==";
  const url = photopeaLaunchUrl({ documentDataUrl: dataUrl });
  assert.ok(url.startsWith(`${PHOTOPEA_ORIGIN}#`));
  const parsed = JSON.parse(decodeURIComponent(url.slice(PHOTOPEA_ORIGIN.length + 1)));
  assert.deepEqual(parsed.files, [dataUrl]);
  assert.equal(
    url.includes("#{"),
    false,
    "配置必须 encodeURIComponent 之后再进 fragment，否则 # 与 & 会把 JSON 截断",
  );
});

test("the export script is the documented saveToOE call", () => {
  assert.equal(PHOTOPEA_EXPORT_SCRIPT, 'app.activeDocument.saveToOE("psd");');
  assert.match(PHOTOPEA_EXPORT_SCRIPT, /saveToOE\("psd"\)/);
});

test("PSD bytes go out under the Photoshop media type", () => {
  const toBase64 = (input) => Buffer.from(input).toString("base64");
  const dataUrl = photopeaBytesToDataUrl(bytes([0x38, 0x42, 0x50, 0x53]), toBase64);
  assert.equal(dataUrl, "data:image/vnd.adobe.photoshop;base64,OEJQUw==");
});
