import {LOCALES, type Locale} from '../../config';
import {copyDictionaryFrom, type CopyMessagesOf} from './shell-overhaul-copy-shared';

const SOURCE = {
  title: '电脑任务通知',
  idle: '任务需要你回应时，在这台手机上提醒。',
  registered: '任务等待权限确认或回答时，通知这台手机。',
  denied: '系统通知未开启，请在手机设置中允许 OceanLeo 通知。',
  unsupported: '当前客户端尚未启用原生通知。',
  unconfigured: '通知设备已登记，推送服务尚未配置。',
  error: '通知设置未保存，请重试。',
  busy: '正在更新通知设置…',
  signoutTitle: '无法退出登录',
  signoutFailed: '未能移除这台手机的任务通知。请联网后重试退出。',
} as const;
const EN: CopyMessagesOf<typeof SOURCE> = {
  title: 'Computer task notifications',
  idle: 'Notify this phone when a task needs your response.',
  registered: 'Notify this phone when a task needs permission or an answer.',
  denied: 'System notifications are off. Allow OceanLeo notifications in your phone settings.',
  unsupported: 'Native notifications are not enabled in this client.',
  unconfigured: 'Notification device registered; the push service is not configured yet.',
  error: 'Notification settings were not saved. Retry.',
  busy: 'Updating notification settings…',
  signoutTitle: 'Could not sign out',
  signoutFailed: 'Could not remove task notifications from this phone. Connect to the internet and retry signing out.',
};
const TW: CopyMessagesOf<typeof SOURCE> = {
  title: '電腦任務通知',
  idle: '任務需要你回應時，在這台手機上提醒。',
  registered: '任務等待權限確認或回答時，通知這台手機。',
  denied: '系統通知未開啟，請在手機設定中允許 OceanLeo 通知。',
  unsupported: '目前用戶端尚未啟用原生通知。',
  unconfigured: '通知裝置已登記，推送服務尚未設定。',
  error: '通知設定未儲存，請重試。',
  busy: '正在更新通知設定…',
  signoutTitle: '無法登出',
  signoutFailed: '未能移除這台手機的任務通知。請連線後重試登出。',
};
export function pushNativeText(locale: string) {
  const tag = locale.toLowerCase();
  return tag === 'zh-tw' || tag === 'zh-hk' || tag.startsWith('zh-hant') ? TW :
    tag === 'zh' || tag === 'zh-cn' || tag === 'zh-sg' || tag.startsWith('zh-hans') ? SOURCE : EN;
}
export const PUSH_NATIVE_MESSAGES = Object.fromEntries(LOCALES.map(locale => [locale,
  copyDictionaryFrom(SOURCE, locale === 'zh' ? SOURCE : locale === 'zh-TW' ? TW : EN),
])) as Record<Locale, Record<string, string>>;
