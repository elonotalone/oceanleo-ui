/**
 * Testable stage plan. VideoDesigncomboStage is the only React leaf that
 * mounts preview; this file has no OpenVideo runtime imports.
 */
import {
  buildSetModeMessage,
  type EditorMode,
} from "../../hosted-editor/index";
import type { SelectionContext, SelectionControl } from "../../selection-context-types";
import {
  VIDEO_DESIGNCOMBO_DEFAULT_MODE,
  videoDesigncomboChrome,
  type VideoDesigncomboChrome,
} from "./chrome";
import { VIDEO_DESIGNCOMBO_COMMANDS } from "./facade-commands";
import type { OpenVideoClip, OpenVideoProject } from "./schema";

export const VIDEO_DESIGNCOMBO_INSTANCE_ID = "oceanleo-video-designcombo";
export const VIDEO_DESIGNCOMBO_STAGE_ATTR = "data-video-designcombo-stage";
export const VIDEO_DESIGNCOMBO_MODE_ATTR = "data-video-designcombo-mode";

export const VIDEO_DESIGNCOMBO_CHROME_ATTRS = {
  mediaPanel: "data-video-designcombo-media",
  inspector: "data-video-designcombo-inspector",
  timelineChrome: "data-video-designcombo-timeline-chrome",
  header: "data-video-designcombo-header",
} as const;

export interface VideoDesigncomboModeApplication {
  instanceId: string;
  message: ReturnType<typeof buildSetModeMessage>;
  chrome: VideoDesigncomboChrome;
  mode: EditorMode;
}

export function applyVideoDesigncomboMode(
  instanceId: string,
  mode: EditorMode,
): VideoDesigncomboModeApplication {
  const message = buildSetModeMessage(instanceId, mode);
  const next = message.type === "set-mode" ? message.mode : mode;
  return {
    instanceId,
    message,
    mode: next,
    chrome: videoDesigncomboChrome(next),
  };
}

export function applyVideoDesigncomboChromeDom(
  root: { setAttribute(name: string, value: string): void; querySelectorAll?: (sel: string) => ArrayLike<{ style: { display: string } }> },
  chrome: VideoDesigncomboChrome,
): void {
  root.setAttribute(VIDEO_DESIGNCOMBO_MODE_ATTR, chrome.header ? "pro" : "normal");
  const pairs: Array<[string, boolean]> = [
    [`[${VIDEO_DESIGNCOMBO_CHROME_ATTRS.mediaPanel}]`, !chrome.mediaPanel],
    [`[${VIDEO_DESIGNCOMBO_CHROME_ATTRS.inspector}]`, !chrome.inspector],
    [`[${VIDEO_DESIGNCOMBO_CHROME_ATTRS.timelineChrome}]`, !chrome.timelineChrome],
    [`[${VIDEO_DESIGNCOMBO_CHROME_ATTRS.header}]`, !chrome.header],
  ];
  for (const [selector, hidden] of pairs) {
    const nodes = root.querySelectorAll?.(selector);
    if (!nodes) continue;
    for (let i = 0; i < nodes.length; i += 1) {
      nodes[i].style.display = hidden ? "none" : "";
    }
  }
}

function controlForCommand(id: string, label: string): SelectionControl {
  if (id === "muted") {
    return { id, kind: "toggle", label, icon: "effects", value: false };
  }
  if (id === "volume") {
    return {
      id,
      kind: "range",
      label,
      value: 100,
      min: 0,
      max: 200,
      slot: "inspector",
      inspectorGroup: "video-audio",
      inspectorLabel: "音量",
      inspectorIcon: "effects",
    };
  }
  if (id === "speed") {
    return {
      id,
      kind: "select",
      label,
      value: "1",
      options: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].map((value) => ({
        value: String(value),
        label: `${value}x`,
      })),
    };
  }
  if (id === "crop-frame") {
    return { id, kind: "action", label, icon: "crop" };
  }
  if (id === "keyframes") {
    return { id, kind: "action", label, icon: "animate" };
  }
  if (id === "add-caption" || id === "caption-style") {
    return { id, kind: "action", label, icon: "text" };
  }
  return { id, kind: "action", label };
}

export function videoDesigncomboSelectionContext(input: {
  revision: number;
  clip: OpenVideoClip | null;
  project: OpenVideoProject;
}): SelectionContext {
  const clip = input.clip;
  const kind = clip
    ? `${String(clip.type).toLowerCase()}-clip`
    : "video-timeline";
  const controls = VIDEO_DESIGNCOMBO_COMMANDS.map((command) =>
    controlForCommand(command.id, command.label),
  );
  if (clip) {
    const volume = Math.round((clip.volume ?? 1) * 100);
    for (const control of controls) {
      if (control.id === "volume") control.value = volume;
      if (control.id === "muted") control.value = clip.muted === true || volume === 0;
      if (control.id === "speed") {
        control.value = String(clip.timing.playbackRate ?? 1);
      }
    }
  }
  return {
    version: 1,
    kind,
    id: clip?.id || "video-timeline",
    label: clip?.name || clip?.text || "时间线",
    revision: input.revision,
    controls,
  };
}

export function videoDesigncomboFacadeControlIds(): string[] {
  return VIDEO_DESIGNCOMBO_COMMANDS.map((command) => command.id);
}

export { VIDEO_DESIGNCOMBO_DEFAULT_MODE };
