import type { Locale } from "../../config";

export const ENVIRONMENTS_COPY = {
  title: { zh: "开发环境", en: "Development environments" },
  description: { zh: "按用途安装固定版本的工具；大型工具会提前标出。", en: "Install pinned tools by purpose; large downloads are marked first." },
  offline: { zh: "服务器在线后才能检测和安装开发环境。", en: "The server must be online before environments can be detected or installed." },
  loading: { zh: "正在读取开发环境…", en: "Loading development environments…" },
  empty: { zh: "还没有可用的开发环境。", en: "No development environments are available." },
  install: { zh: "安装", en: "Install" },
  installing: { zh: "正在安装…", en: "Installing…" },
  installed: { zh: "已安装", en: "Installed" },
  failed: { zh: "安装失败", en: "Installation failed" },
  askAgent: { zh: "让 agent 处理", en: "Ask the agent to fix it" },
  agentStarted: { zh: "已创建 Agent 任务", en: "Agent task created" },
  large: { zh: "下载较大", en: "Large download" },
  detectTitle: { zh: "检查项目需要的工具", en: "Check tools needed by a project" },
  detectPlaceholder: { zh: "例如 /srv/projects/my-site", en: "For example /srv/projects/my-site" },
  detect: { zh: "检测", en: "Detect" },
  detecting: { zh: "检测中…", en: "Detecting…" },
  found: { zh: "已找到 {n} 项", en: "Found {n}" },
  missing: { zh: "缺少 {n} 项", en: "Missing {n}" },
  iosMac: { zh: "iOS 构建需要 Mac。", en: "iOS builds require a Mac." },
  retry: { zh: "重试", en: "Retry" },
};

export type EnvironmentCopyKey = keyof typeof ENVIRONMENTS_COPY;

// The message loader merges this map into the existing UI dictionary.
const EN: Record<string, string> = Object.fromEntries(
  Object.values(ENVIRONMENTS_COPY).map(({ zh, en }) => [zh, en]),
);

export function environmentsCopy(locale: Locale): Record<string, string> {
  if (locale === "zh") return Object.fromEntries(Object.keys(EN).map((key) => [key, key]));
  return { ...EN };
}
