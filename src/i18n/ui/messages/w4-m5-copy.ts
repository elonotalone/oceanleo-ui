import {LOCALES, type Locale} from '../../config';
import {copyDictionaryFrom, type CopyMessagesOf} from './shell-overhaul-copy-shared';

const SOURCE = {
  waiting: '电脑任务正在等待你的回应，请打开 OceanLeo 查看。',
  unsupported: '当前客户端尚未启用原生通知。',
  unconfigured: '通知设备已登记，推送服务尚未配置。',
  failed: '通知设置未保存，请重试。',
  expired: '请求已结束或失效，请打开任务查看最新状态。',
} as const;
const EN: CopyMessagesOf<typeof SOURCE> = {
  waiting: 'A computer task needs your response. Open OceanLeo to review it.',
  unsupported: 'Native notifications are not enabled in this client.',
  unconfigured: 'Notification device registered; the push service is not configured yet.',
  failed: 'Notification settings were not saved. Retry.',
  expired: 'This request ended or expired. Open the task for its current status.',
};
const TW: CopyMessagesOf<typeof SOURCE> = {
  waiting: '電腦任務正在等待你的回應，請開啟 OceanLeo 查看。',
  unsupported: '目前用戶端尚未啟用原生通知。',
  unconfigured: '通知裝置已登記，推送服務尚未設定。',
  failed: '通知設定未儲存，請重試。',
  expired: '請求已結束或失效，請開啟任務查看最新狀態。',
};
export const W4_M5_MESSAGES = Object.fromEntries(LOCALES.map(locale => [locale,
  copyDictionaryFrom(SOURCE, locale === 'zh' ? SOURCE : locale === 'zh-TW' ? TW : EN),
])) as Record<Locale, Record<string, string>>;
