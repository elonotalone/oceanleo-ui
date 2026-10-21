import type { PluginCommandSurfaceInput, PluginCommandSpec } from "../../plugin-command/types";
import { boundedAgentContent } from "../../plugin-command/bounded-agent-content";
import { runVideoDesigncomboCommand } from "./facade-commands";
import type { OpenVideoProject } from "./schema";

interface Port {
  project(): OpenVideoProject;
  revision(): number;
  ready(): boolean;
  readOnly(): boolean;
  selectedClipId(): string;
  commit(project: OpenVideoProject): void;
}

const clip = { key: "clipId", label: "片段 ID", type: "string" as const, required: true };
const at = { key: "atMs", label: "时间（毫秒）", type: "number" as const, required: true };
const COMMANDS: PluginCommandSpec[] = [
  { id: "video-timeline.add-caption", label: "加字幕", summary: "在明确的时间点加入用户要求的字幕正文。", mutates: true,
    params: [{ key: "text", label: "字幕正文", type: "string", required: true }, at] },
  { id: "video-timeline.delete-clip", label: "删除片段", summary: "从当前时间线删除指定 ID 的片段。", mutates: true, params: [clip] },
  { id: "video-timeline.split-clip", label: "分割片段", summary: "在指定时间点分割指定片段。", mutates: true, params: [clip, at] },
  { id: "video-timeline.set-volume", label: "调片段音量", summary: "调整指定片段的音量百分比。", mutates: true,
    params: [clip, { key: "percent", label: "音量百分比", type: "number", required: true }] },
  { id: "video-timeline.set-speed", label: "调片段速度", summary: "调整指定片段的播放倍速。", mutates: true,
    params: [clip, { key: "speed", label: "倍速", type: "number", required: true }] },
  { id: "video-timeline.set-muted", label: "切换片段静音", summary: "明确设置指定片段是否静音。", mutates: true,
    params: [clip, { key: "muted", label: "静音", type: "boolean", required: true }] },
];

/** Real vendor-document operations; the shared host review gate controls execution. */
export function createVideoDesigncomboAgentSurface(port: Port): PluginCommandSurfaceInput {
  return {
    editorId: "video-timeline",
    describe: () => port.ready() && !port.readOnly() ? COMMANDS : [],
    state: () => ({ revision: port.revision(), selectedClipId: port.selectedClipId() }),
    agentContext: () => !port.ready()
      ? { ready: false, reason: "当前视频工程尚未载入。" }
      : boundedAgentContent({
          selectedClip: port.project().clips[port.selectedClipId()],
          selectedClipId: port.selectedClipId(),
          project: port.project(),
        }, "这是当前视频工程和字幕，不代表已看过视频画面或听过音轨。"),
    run: (id, params = {}) => {
      const fail = (message: string) => ({ ok: false, message });
      if (!port.ready() || port.readOnly()) return fail("视频工程未就绪或只能查看，时间线没有改动。");
      if (!COMMANDS.some((command) => command.id === id)) return fail("当前视频工程没有这条原生指令。");
      const clipId = String(params.clipId || "");
      const action = id.slice("video-timeline.".length);
      if (action !== "add-caption" && !clipId) return fail("必须指定当前时间线中的片段 ID。");
      if ((action === "add-caption" || action === "split-clip") &&
          (typeof params.atMs !== "number" || !Number.isFinite(params.atMs) || params.atMs < 0)) {
        return fail("必须提供明确且非负的时间点（毫秒）。");
      }
      if (action === "set-volume" && (typeof params.percent !== "number" ||
          !Number.isFinite(params.percent) || params.percent < 0 || params.percent > 200)) {
        return fail("音量必须是 0–200 之间的百分比。");
      }
      const controls: Record<string, string> = {
        "add-caption": "add-caption", "delete-clip": "delete", "split-clip": "split",
        "set-volume": "volume", "set-speed": "speed", "set-muted": "muted",
      };
      const control = controls[action];
      if (!control) return fail("无法解析视频操作。");
      const result = runVideoDesigncomboCommand(control, port.project(), {
        clipId, atUs: typeof params.atMs === "number" ? params.atMs * 1000 : undefined,
        text: typeof params.text === "string" ? params.text : undefined,
        value: (action === "set-volume" ? Number(params.percent) / 100 : action === "set-speed" ? params.speed : params.muted) as number | boolean | undefined,
      });
      if (!result.ok) return fail(result.reason);
      port.commit(result.project);
      return { ok: true, message: "已修改当前右侧视频时间线。", revision: port.revision() };
    },
  };
}
