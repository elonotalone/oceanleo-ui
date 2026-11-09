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

export const ENVIRONMENT_ITEM_COPY: Record<string, string> = {
  "网站": "Website",
  "游戏": "Game",
  "App": "App",
  "通用": "Common",
  "Node.js LTS + pnpm": "Node.js LTS + pnpm",
  "构建网站和 JavaScript 工具，含固定版本 pnpm。": "Build websites and JavaScript tools with pinned pnpm.",
  "Git": "Git",
  "版本管理和从 Git 仓库同步代码。": "Version control and Git repository sync.",
  "Python 3 + uv": "Python 3 + uv",
  "运行 Python 服务和快速安装依赖。": "Run Python services and install dependencies quickly.",
  "Docker Engine + Compose": "Docker Engine + Compose",
  "本地运行 Postgres、Redis 等服务，安装体积较大。": "Run Postgres, Redis, and other local services; large download.",
  "Godot 4 headless + Web templates": "Godot 4 headless + Web templates",
  "导出和检查 Godot 4 网页游戏；只安装无界面的 headless 运行时。": "Export and check Godot 4 web games with a headless runtime.",
  "EAS CLI": "EAS CLI",
  "现代 Expo 项目使用项目本地 npx expo；EAS CLI 负责云构建和提交，iOS 构建仍需要 Mac。": "Modern Expo projects use the local npx expo CLI; EAS CLI handles cloud builds and submissions, and iOS builds require a Mac.",
  "Android SDK command-line tools + platform-tools": "Android SDK command-line tools + platform-tools",
  "Android 命令行构建工具和 platform-tools，下载较大；版本固定并校验 SHA-256。": "Android command-line build tools and platform-tools; large download with a pinned SHA-256.",
  "Flutter SDK": "Flutter SDK",
  "构建 Flutter App，下载较大；iOS 构建仍需要 Mac。": "Build Flutter apps; large download, and iOS builds require a Mac.",
  "build-essential": "build-essential",
  "C/C++ 原生依赖和常见构建工具。": "C/C++ native dependencies and common build tools.",
  "FFmpeg": "FFmpeg",
  "音视频处理和转码工具。": "Audio and video processing and transcoding tools.",
};

// The message loader merges this map into the existing UI dictionary.
const EN: Record<string, string> = {
  ...Object.fromEntries(Object.values(ENVIRONMENTS_COPY).map(({ zh, en }) => [zh, en])),
  ...ENVIRONMENT_ITEM_COPY,
};

export function environmentsCopy(locale: Locale): Record<string, string> {
  if (locale === "zh") return Object.fromEntries(Object.keys(EN).map((key) => [key, key]));
  return { ...EN };
}
