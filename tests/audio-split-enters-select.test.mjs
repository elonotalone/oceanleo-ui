/**
 * V9-red-3 / A-94 / W29：点「分割」必须进入选区。
 *
 * waveform-playlist 没有 split/cut。产品把 L1「分割」映成
 * statechange/select（两步式：先框选，紧邻的 crop 才 trim）。
 * 既有 `audio-playlist-wiring` 只锁 crop→trim / fade-in / mute，
 * 对 split 零命中。本闸锁这条映射。
 *
 * 改成 pause（正在听的音频被停掉）、改成 crop/trim（没框选就被切）、
 * 或删掉 case 走 default（点了没反应），闸都要红。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runAudioPlaylistCommand } from "../src/shell/media-editors/audio-playlist-engine.ts";

const SPLIT_MUST_ENTER_SELECT =
  "用户点分割，音频被停掉／被裁掉，并没有切开。分割必须进入选区（statechange/select），紧邻的裁切才会真切。";

function playlistPort() {
  const events = [];
  return {
    events,
    emit(event, ...args) {
      events.push([event, ...args]);
    },
    getDuration: () => 10,
    getCurrentTime: () => 2,
    getTimeSelection: () => ({ start: 1, end: 3 }),
    trackCount: () => 2,
  };
}

test("点分割必须进入选区，不能把正在听的音频停掉或裁掉", () => {
  const port = playlistPort();
  const result = runAudioPlaylistCommand(port, "split");
  assert.equal(result.ok, true, SPLIT_MUST_ENTER_SELECT);
  if (!result.ok) return;
  assert.equal(result.event, "statechange", SPLIT_MUST_ENTER_SELECT);
  assert.deepEqual(result.args, ["select"], SPLIT_MUST_ENTER_SELECT);
  assert.deepEqual(port.events, [["statechange", "select"]], SPLIT_MUST_ENTER_SELECT);
});
