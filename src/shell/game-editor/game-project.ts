/** A game is a static file closure. Binary files remain content-addressed assets. */
export const GAME_PROJECT_SCHEMA = "game-project@1";
export const GAME_PROJECT_MAX_BYTES = 60 * 1024 * 1024;
export const GAME_FILE_MAX_BYTES = 15 * 1024 * 1024;
export interface GameProjectFile {
  path: string;
  sha256: string;
  byteSize: number;
  mediaType: string;
  content?: string;
}
export interface GameProject {
  schema: typeof GAME_PROJECT_SCHEMA;
  entrypoint: string;
  title: string;
  orientation: "portrait" | "landscape" | "both";
  controls: ("touch" | "keyboard" | "mouse")[];
  files: GameProjectFile[];
  readOnly?: boolean;
  loadedRevisionId?: string;
  /** Preserve the digest-keyed transport closure for revision replay/fork. */
  blobs?: Record<string, string>;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function validGameFilePath(path: string): boolean {
  return !!path && path.length <= 512 && !/[\\:%?#\x00-\x1f\x7f]/.test(path) &&
    !path.startsWith("/") && path.split("/").every(part => !!part && !part.startsWith("."));
}
export function isGameTextFile(file: GameProjectFile): boolean {
  return /^(text\/|application\/(javascript|json|xml|x-javascript))/.test(file.mediaType) ||
    /\.(html?|css|[cm]?js|json|gltf|txt|svg|glsl|vert|frag|wgsl)$/i.test(file.path);
}
export function readGameProject(input: unknown): GameProject {
  if (!record(input)) throw new Error("无法读取游戏工程。");
  // Legacy documents are visible as one file, never silently converted or saved.
  if (input.schema !== GAME_PROJECT_SCHEMA && typeof input.source === "string") {
    return { schema: GAME_PROJECT_SCHEMA, entrypoint: "index.html", title: String(input.title || ""),
      orientation: "both", controls: [], readOnly: true,
      files: [{ path: "index.html", sha256: "", byteSize: new TextEncoder().encode(input.source).length,
        mediaType: "text/html", content: input.source }] };
  }
  if (input.schema !== GAME_PROJECT_SCHEMA || !Array.isArray(input.files) ||
      typeof input.entrypoint !== "string" || !validGameFilePath(input.entrypoint) ||
      !["portrait", "landscape", "both"].includes(String(input.orientation)) ||
      !Array.isArray(input.controls) || input.controls.some(control => !["touch", "keyboard", "mouse"].includes(String(control)))) {
    throw new Error("游戏工程格式不完整。");
  }
  const blobs = record(input.blobs) && Object.values(input.blobs).every(value => typeof value === "string")
    ? input.blobs as Record<string, string> : undefined;
  const seen = new Set<string>();
  let total = 0;
  const files = input.files.map(value => {
    if (!record(value) || typeof value.path !== "string" || !validGameFilePath(value.path) || seen.has(value.path) ||
        typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256) ||
        typeof value.byteSize !== "number" || !Number.isSafeInteger(value.byteSize) || value.byteSize < 0 || value.byteSize > GAME_FILE_MAX_BYTES ||
        typeof value.mediaType !== "string" || !value.mediaType ||
        (value.content !== undefined && typeof value.content !== "string")) throw new Error("游戏文件清单无效。");
    seen.add(value.path);
    total += value.byteSize;
    if (typeof value.content === "string" && new TextEncoder().encode(value.content).length !== value.byteSize) {
      throw new Error("游戏文件大小与清单不一致。");
    }
    let content = typeof value.content === "string" ? value.content : undefined;
    if (content === undefined && blobs?.[value.sha256] && isGameTextFile(value as unknown as GameProjectFile)) {
      const binary = atob(blobs[value.sha256]);
      content = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
      if (new TextEncoder().encode(content).length !== value.byteSize) throw new Error("游戏文件大小与清单不一致。");
    }
    return { path: value.path, sha256: value.sha256, byteSize: value.byteSize, mediaType: value.mediaType,
      ...(content !== undefined ? { content } : {}) };
  });
  if (total > GAME_PROJECT_MAX_BYTES || !files.some(file => file.path === input.entrypoint && /\.html?$/i.test(file.path))) {
    throw new Error("游戏入口缺失或工程超过 60 MB。");
  }
  return { schema: GAME_PROJECT_SCHEMA, entrypoint: input.entrypoint, title: String(input.title || ""),
    orientation: input.orientation as GameProject["orientation"], controls: input.controls as GameProject["controls"],
    files, ...(blobs ? { blobs } : {}), readOnly: input.readOnly === true || input.legacy === true };
}
export function gameProjectEdits(project: GameProject, edits: Record<string, string>): { path: string; content: string }[] {
  if (project.readOnly) throw new Error("旧版游戏只读，不能保存修改。");
  let total = project.files.reduce((sum, file) => sum + file.byteSize, 0);
  const result = Object.entries(edits).map(([path, content]) => {
    const file = project.files.find(entry => entry.path === path);
    if (!file || !isGameTextFile(file)) throw new Error("只能修改工程内的文本文件。");
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > GAME_FILE_MAX_BYTES) throw new Error("单个文件不能超过 15 MB。");
    total += bytes - file.byteSize;
    return { path, content };
  });
  if (total > GAME_PROJECT_MAX_BYTES) throw new Error("游戏工程不能超过 60 MB。");
  return result;
}
/** UC-1: never run user games on a credentialed or arbitrary origin. */
export function gamePlayUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("游戏预览地址无效。");
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".oceanleo.app") ||
      url.username || url.password || url.port) throw new Error("游戏预览必须使用隔离域。");
  return url.href;
}
