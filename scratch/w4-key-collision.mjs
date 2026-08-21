// W4 一次性检查：候选新文案里哪些 key 已经在 UI_MESSAGES 里了（已有的一律复用，
// 不再抄一份译文，否则同一句话有两处来源，迟早漂移）。
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";

const candidates = process.argv.slice(2);
const zh = UI_MESSAGES.zh;
for (const key of candidates) {
  if (zh[key] !== undefined) console.log(`EXISTS\t${key}`);
}
console.log(`checked=${candidates.length} total_zh_keys=${Object.keys(zh).length}`);
