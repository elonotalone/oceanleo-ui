import assert from "node:assert/strict";
import test from "node:test";

import {
  addOpenVideoCaption,
  cropOpenVideoClip,
  deleteOpenVideoClip,
  runVideoDesigncomboCommand,
  setOpenVideoCaptionStyle,
  setOpenVideoKeyframes,
  setOpenVideoMuted,
  setOpenVideoSpeed,
  setOpenVideoVolume,
  splitOpenVideoClip,
} from "../src/shell/video-editor/designcombo/facade-commands.ts";
import {
  emptyOpenVideoProject,
  makeOpenVideoId,
} from "../src/shell/video-editor/designcombo/schema.ts";

function seeded() {
  const project = emptyOpenVideoProject();
  const id = "clip_seed";
  project.clips[id] = {
    id,
    type: "Video",
    src: "https://example.com/a.mp4",
    timing: {
      display: { from: 0, to: 4_000_000 },
      duration: 4_000_000,
      playbackRate: 1,
    },
    transform: {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      opacity: 1,
      zIndex: 10,
      flip: { x: false, y: false },
    },
    volume: 1,
  };
  project.tracks[0].clipIds.push(id);
  return { project, id };
}

test("split, mute, speed, crop, keyframes and captions mutate OpenVideo JSON", () => {
  const { project, id } = seeded();
  const split = splitOpenVideoClip(project, id, 2_000_000);
  assert.equal(split.ok, true);
  assert.equal(split.project.tracks[0].clipIds.length, 2);

  const muted = setOpenVideoMuted(split.project, id, true);
  assert.equal(muted.ok, true);
  assert.equal(muted.project.clips[id].muted, true);

  const sped = setOpenVideoSpeed(muted.project, id, 2);
  assert.equal(sped.project.clips[id].timing.playbackRate, 2);

  const cropped = cropOpenVideoClip(sped.project, id, {
    x: 0.1,
    y: 0.2,
    width: 0.5,
    height: 0.5,
  });
  assert.equal(cropped.ok, true);
  assert.equal(cropped.project.clips[id].crop.width, 0.5);
  assert.equal(cropped.project.clips[id].transform.width, 960);

  const keyed = setOpenVideoKeyframes(cropped.project, id, {
    "0%": { x: -20 },
    "100%": { x: 0 },
  });
  assert.equal(keyed.ok, true);
  assert.equal(keyed.project.clips[id].animations[0].type, "keyframes");

  const captioned = addOpenVideoCaption(keyed.project, {
    text: "hello",
    fromMs: 0,
    durationMs: 1500,
  });
  assert.equal(captioned.ok, true);
  const captions = Object.values(captioned.project.clips).filter(
    (clip) => clip.type === "Caption",
  );
  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, "hello");
});

test("delete removes the clip from tracks", () => {
  const { project, id } = seeded();
  const deleted = deleteOpenVideoClip(project, id);
  assert.equal(deleted.ok, true);
  assert.equal(deleted.project.clips[id], undefined);
  assert.equal(deleted.project.tracks[0].clipIds.includes(id), false);
});

test("bad split and empty caption return a reason a person can use", () => {
  const { project, id } = seeded();
  const tooClose = splitOpenVideoClip(project, id, 100);
  assert.equal(tooClose.ok, false);
  assert.match(tooClose.reason, /太近/);
  const empty = addOpenVideoCaption(project, { text: "  ", fromMs: 0 });
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /空的/);
  const captions = Object.values(project.clips).filter((clip) => clip.type === "Caption");
  assert.equal(captions.length, 0, "字幕正文为空时，轨道里不会落下占位文字");
});

test("crop-frame without a rect leaves the video untouched", () => {
  const { project, id } = seeded();
  const before = structuredClone(project);
  const result = runVideoDesigncomboCommand("crop-frame", project, { clipId: id });
  assert.equal(result.ok, false, "点裁切但没框选区域时，视频不会被改动");
  assert.match(result.reason, /请先框选要保留的区域/);
  assert.deepEqual(project, before, "点裁切但没框选区域时，视频不会被改动");
  assert.equal(project.clips[id].crop, undefined, "点裁切但没框选区域时，视频不会被改动");
  assert.equal(project.clips[id].transform.width, 1920, "点裁切但没框选区域时，视频不会被改动");
});

test("add-caption without body text does not plant 字幕", () => {
  const { project } = seeded();
  const result = runVideoDesigncomboCommand("add-caption", project, {
    clipId: "clip_seed",
    atUs: 0,
  });
  assert.equal(result.ok, false, "字幕正文为空时，轨道里不会落下占位文字");
  assert.match(result.reason, /请先输入字幕正文/);
  const captions = Object.values(project.clips).filter((clip) => clip.type === "Caption");
  assert.equal(captions.length, 0, "字幕正文为空时，轨道里不会落下占位文字");
  assert.equal(
    captions.some((clip) => clip.text === "字幕"),
    false,
    "字幕正文为空时，轨道里不会落下占位文字",
  );
});

test("keyframes without a table are not treated as an empty animation", () => {
  const { project, id } = seeded();
  const result = runVideoDesigncomboCommand("keyframes", project, { clipId: id });
  assert.equal(result.ok, false, "关键帧缺失时，不会被当成有关键帧继续走");
  assert.match(result.reason, /请先给出关键帧/);
  assert.equal(
    project.clips[id].animations,
    undefined,
    "关键帧缺失时，不会被当成有关键帧继续走",
  );
});

test("volume without a value does not mute the clip", () => {
  const { project, id } = seeded();
  project.clips[id].volume = 0.8;
  project.clips[id].muted = false;
  const before = structuredClone(project);
  const result = runVideoDesigncomboCommand("volume", project, { clipId: id });
  assert.equal(result.ok, false, "缺参数时不许报成功");
  assert.match(result.reason, /没有音量值时不会改变声音/);
  assert.equal(result.reason, "请先给出音量，没有音量值时不会改变声音。");
  assert.deepEqual(project, before, "缺音量值时，声音不会被改成静音");
  assert.equal(project.clips[id].volume, 0.8, "缺音量值时，声音不会被改成静音");
  assert.equal(project.clips[id].muted, false, "缺音量值时，声音不会被改成静音");
});

test("volume 0 is kept when the person actually asked for silence", () => {
  const { project, id } = seeded();
  const result = runVideoDesigncomboCommand("volume", project, {
    clipId: id,
    value: 0,
  });
  assert.equal(result.ok, true);
  assert.equal(result.project.clips[id].volume, 0);
  assert.equal(result.project.clips[id].muted, true);
});

test("speed without a value does not reset a 2x clip to 1x", () => {
  const { project, id } = seeded();
  project.clips[id].timing.playbackRate = 2;
  const before = structuredClone(project);
  const result = runVideoDesigncomboCommand("speed", project, { clipId: id });
  assert.equal(result.ok, false, "缺参数时不许报成功");
  assert.match(result.reason, /没有速度值时不会改变播放速度/);
  assert.equal(result.reason, "请先选择倍速，没有速度值时不会改变播放速度。");
  assert.deepEqual(project, before, "缺速度值时，播放速度不会被改掉");
  assert.equal(
    project.clips[id].timing.playbackRate,
    2,
    "缺速度值时，播放速度不会被改掉",
  );
});

test("a crop rect with no usable area does not become a full-frame crop", () => {
  const { project, id } = seeded();
  const widthZero = cropOpenVideoClip(project, id, {
    x: 0,
    y: 0,
    width: 0,
    height: 0.5,
  });
  assert.equal(widthZero.ok, false, "缺参数时不许报成功");
  assert.match(widthZero.reason, /没有可用面积/);
  assert.equal(widthZero.reason, "裁切框没有可用面积，画面没有被裁切。");
  assert.equal(project.clips[id].crop, undefined, "裁切宽为 0 时，画面不会被当成满幅");
  assert.equal(project.clips[id].transform.width, 1920, "裁切宽为 0 时，画面不会被当成满幅");
  assert.equal(project.clips[id].transform.height, 1080, "裁切宽为 0 时，画面不会被当成满幅");

  const heightZero = cropOpenVideoClip(project, id, {
    x: 0,
    y: 0,
    width: 0.5,
    height: 0,
  });
  assert.equal(heightZero.ok, false, "裁切高为 0 时，画面不会被当成满幅");
  assert.match(heightZero.reason, /没有可用面积/);
  assert.equal(project.clips[id].crop, undefined, "裁切高为 0 时，画面不会被当成满幅");
  assert.equal(project.clips[id].transform.height, 1080, "裁切高为 0 时，画面不会被当成满幅");

  const negativeWidth = cropOpenVideoClip(project, id, {
    x: 0,
    y: 0,
    width: -0.2,
    height: 0.5,
  });
  assert.equal(negativeWidth.ok, false, "裁切宽为负数时，不会猜成一条细缝");
  assert.equal(project.clips[id].crop, undefined, "裁切宽为负数时，不会猜成一条细缝");
  assert.equal(project.clips[id].transform.width, 1920, "裁切宽为负数时，不会猜成一条细缝");

  const negativeHeight = cropOpenVideoClip(project, id, {
    x: 0,
    y: 0,
    width: 0.5,
    height: -0.2,
  });
  assert.equal(negativeHeight.ok, false, "裁切高为负数时，不会猜成一条细缝");
  assert.equal(project.clips[id].transform.height, 1080, "裁切高为负数时，不会猜成一条细缝");

  const originAtEdge = cropOpenVideoClip(project, id, {
    x: 1,
    y: 0,
    width: 0.5,
    height: 0.5,
  });
  assert.equal(originAtEdge.ok, false, "裁切原点贴在画面外沿时，不会写出零宽画面");
  assert.equal(project.clips[id].crop, undefined, "裁切原点贴在画面外沿时，不会写出零宽画面");
  assert.equal(project.clips[id].transform.width, 1920, "裁切原点贴在画面外沿时，不会写出零宽画面");

  const viaCommand = runVideoDesigncomboCommand("crop-frame", project, {
    clipId: id,
    crop: { x: 0, y: 0, width: 0, height: 0.8 },
  });
  assert.equal(viaCommand.ok, false, "裁切宽为 0 时，画面不会被当成满幅");
  assert.match(viaCommand.reason, /没有可用面积/);
  assert.equal(project.clips[id].transform.width, 1920, "裁切宽为 0 时，画面不会被当成满幅");
});

test("missing volume at the kernel is a failure with a readable reason, not a silent success", () => {
  const { project, id } = seeded();
  project.clips[id].volume = 0.8;
  project.clips[id].muted = false;
  const result = setOpenVideoVolume(project, id, Number("not-a-volume"));
  assert.equal(result.ok, false, "缺参数时不许报成功");
  assert.match(result.reason, /没有音量值时不会改变声音/);
  assert.equal(result.reason, "请先给出音量，没有音量值时不会改变声音。");
  assert.equal(project.clips[id].volume, 0.8, "缺音量值时，声音不会被改成静音");
  assert.equal(project.clips[id].muted, false, "缺音量值时，声音不会被改成静音");
});

test("missing speed at the kernel is a failure with a readable reason, not a silent success", () => {
  const { project, id } = seeded();
  project.clips[id].timing.playbackRate = 2;
  const result = setOpenVideoSpeed(project, id, Number("not-a-speed"));
  assert.equal(result.ok, false, "缺参数时不许报成功");
  assert.match(result.reason, /没有速度值时不会改变播放速度/);
  assert.equal(result.reason, "请先选择倍速，没有速度值时不会改变播放速度。");
  assert.equal(project.clips[id].timing.playbackRate, 2, "缺速度值时，播放速度不会被改掉");
});

test("muted without a boolean does not unmute the clip", () => {
  const { project, id } = seeded();
  project.clips[id].muted = true;
  project.clips[id].volume = 0;
  const viaCommand = runVideoDesigncomboCommand("muted", project, { clipId: id });
  assert.equal(viaCommand.ok, false, "缺参数时不许报成功");
  assert.match(viaCommand.reason, /没有明确选择时不会改变静音/);
  assert.equal(viaCommand.reason, "请先确认要不要静音，没有明确选择时不会改变静音。");
  assert.equal(project.clips[id].muted, true, "缺静音选择时，不会把静音关掉");
  assert.equal(project.clips[id].volume, 0, "缺静音选择时，不会把静音关掉");

  const viaKernel = setOpenVideoMuted(project, id, Number("not-a-flag"));
  assert.equal(viaKernel.ok, false, "缺参数时不许报成功");
  assert.match(viaKernel.reason, /没有明确选择时不会改变静音/);
  assert.equal(project.clips[id].muted, true, "缺静音选择时，不会把静音关掉");
});

test("caption-style without a color or size is a failure, not a silent success", () => {
  const { project } = seeded();
  const captioned = addOpenVideoCaption(project, {
    text: "hello",
    fromMs: 1000,
    durationMs: 1500,
  });
  assert.equal(captioned.ok, true);
  const caption = Object.values(captioned.project.clips).find(
    (clip) => clip.type === "Caption",
  );
  assert.ok(caption);
  const beforeColor = caption.style?.color;
  const viaCommand = runVideoDesigncomboCommand("caption-style", captioned.project, {
    clipId: caption.id,
  });
  assert.equal(viaCommand.ok, false, "缺参数时不许报成功");
  assert.match(viaCommand.reason, /没有颜色或字号时不会改字幕/);
  assert.equal(
    viaCommand.reason,
    "请先给出字幕样式，没有颜色或字号时不会改字幕。",
  );
  assert.equal(
    captioned.project.clips[caption.id].style?.color,
    beforeColor,
    "缺字幕样式时，字幕外观不会被改掉",
  );

  const viaKernel = setOpenVideoCaptionStyle(captioned.project, caption.id, {});
  assert.equal(viaKernel.ok, false, "缺参数时不许报成功");
  assert.match(viaKernel.reason, /没有颜色或字号时不会改字幕/);
  assert.equal(
    captioned.project.clips[caption.id].style?.color,
    beforeColor,
    "缺字幕样式时，字幕外观不会被改掉",
  );
});

test("add-caption with body text but no time does not drop the caption at 0", () => {
  const { project } = seeded();
  const viaCommand = runVideoDesigncomboCommand("add-caption", project, {
    text: "hello",
  });
  assert.equal(viaCommand.ok, false, "缺参数时不许报成功");
  assert.match(viaCommand.reason, /没有时间点时不会把字幕加到片头/);
  assert.equal(
    viaCommand.reason,
    "请先指定字幕出现的时间，没有时间点时不会把字幕加到片头。",
  );
  const captions = Object.values(project.clips).filter((clip) => clip.type === "Caption");
  assert.equal(captions.length, 0, "缺时间点时，字幕不会被扔到片头");

  const viaKernel = addOpenVideoCaption(project, {
    text: "hello",
    fromMs: Number("not-a-time"),
  });
  assert.equal(viaKernel.ok, false, "缺参数时不许报成功");
  assert.match(viaKernel.reason, /没有时间点时不会把字幕加到片头/);
  const stillNone = Object.values(project.clips).filter((clip) => clip.type === "Caption");
  assert.equal(stillNone.length, 0, "缺时间点时，字幕不会被扔到片头");
});

test("add-caption at 0 stays at the start when the person asked for 0", () => {
  const { project } = seeded();
  const result = runVideoDesigncomboCommand("add-caption", project, {
    text: "hello",
    atUs: 0,
  });
  assert.equal(result.ok, true);
  const captions = Object.values(result.project.clips).filter(
    (clip) => clip.type === "Caption",
  );
  assert.equal(captions.length, 1);
  assert.equal(captions[0].timing.display.from, 0);
});

void makeOpenVideoId;
