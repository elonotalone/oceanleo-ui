import { emptyCopy } from "./shell-overhaul-copy-shared";

/** Sidebar page copy used by the capability-pack workspace panels. */
const SOURCE = {
  devices: "Devices",
  projects: "Projects",
  settings: "Settings",
  devicesDescription: "你的电脑、云电脑和云端浏览器",
  projectsDescription: "管理项目和任务归属",
  settingsDescription: "偏好、保险箱和连接器",
} as const;

/** Parent registers this table in messages/index.ts; sparse locales fall back to zh. */
export const WORKSPACE_PANELS_MESSAGES = emptyCopy();
for (const locale of Object.keys(WORKSPACE_PANELS_MESSAGES) as Array<keyof typeof WORKSPACE_PANELS_MESSAGES>) {
  WORKSPACE_PANELS_MESSAGES[locale] = SOURCE;
}

