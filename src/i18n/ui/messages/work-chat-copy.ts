// 2026-10-05 work-chat 词典聚合器：消息 / 多人同改 / 工作回放的分表按语种合并成一张，
// index.ts / load.ts 只注册这一张。分表各归一个工作单元；本文件与 index.ts / load.ts 只由整合者改。

import { LOCALES, type Locale } from "../../config";
import { IM_SHELL_MESSAGES } from "./im-shell-copy";
import { IM_CONVERSATION_MESSAGES } from "./im-conversation-copy";
import { IM_PEOPLE_MESSAGES } from "./im-people-copy";
import { IM_NOTIFY_MESSAGES } from "./im-notify-copy";
import { IM_LEO_MESSAGES } from "./im-leo-copy";
import { IM_TALENT_MESSAGES } from "./im-talent-copy";
import { COLLAB_MESSAGES } from "./collab-copy";
import { COLLAB_DOCS_MESSAGES } from "./collab-docs-copy";
import { COLLAB_VISUAL_MESSAGES } from "./collab-visual-copy";
import { COLLAB_MEDIA_MESSAGES } from "./collab-media-copy";
import { WORK_REPLAY_MESSAGES } from "./work-replay-copy";

const PARTS = [
  IM_SHELL_MESSAGES,
  IM_CONVERSATION_MESSAGES,
  IM_PEOPLE_MESSAGES,
  IM_NOTIFY_MESSAGES,
  IM_LEO_MESSAGES,
  IM_TALENT_MESSAGES,
  COLLAB_MESSAGES,
  COLLAB_DOCS_MESSAGES,
  COLLAB_VISUAL_MESSAGES,
  COLLAB_MEDIA_MESSAGES,
  WORK_REPLAY_MESSAGES,
];

export const WORK_CHAT_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      Object.assign({}, ...PARTS.map((part) => part[locale] ?? {})),
    ]),
  ) as Record<Locale, Record<string, string>>;
