import {LOCALES, type Locale} from '../../config';
import {copyDictionaryFrom, type CopyMessagesOf} from './shell-overhaul-copy-shared';

const SOURCE = {
  sendNow: '立即发送',
  restore: '恢复草稿',
  restoreAll: '恢复全部已撤回草稿',
  restored: '已恢复到输入框',
  restoreFailed: '部分草稿未能恢复，请检查连接后重试',
  retainedFiles: '附件已保留，但暂时无法重新发送。移除这些附件后可以发送文字。',
} as const;
const EN: CopyMessagesOf<typeof SOURCE> = {
  sendNow: 'Send now',
  restore: 'Restore draft',
  restoreAll: 'Restore all withdrawn drafts',
  restored: 'Restored to composer',
  restoreFailed: 'Some drafts could not be restored. Check the connection and retry.',
  retainedFiles: 'Files are retained but cannot be sent again yet. Remove these files to send the text.',
};
const TW: CopyMessagesOf<typeof SOURCE> = {
  sendNow: '立即傳送',
  restore: '恢復草稿',
  restoreAll: '恢復全部已撤回草稿',
  restored: '已恢復到輸入框',
  restoreFailed: '部分草稿未能恢復，請檢查連線後重試',
  retainedFiles: '附件已保留，但暫時無法重新傳送。移除這些附件後可以傳送文字。',
};

export const MOBILE_MIDTURN_MESSAGES = Object.fromEntries(LOCALES.map(locale => [locale,
  copyDictionaryFrom(SOURCE, locale === 'zh' ? SOURCE : locale === 'zh-TW' ? TW : EN),
])) as Record<Locale, Record<string, string>>;

export function mobileMidturnText(locale = 'en') {
  const table = locale === 'zh' ? SOURCE : locale === 'zh-TW' ? TW : EN;
  return (key: keyof typeof SOURCE) => table[key];
}
