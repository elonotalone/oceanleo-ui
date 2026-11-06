import {LOCALES, type Locale} from '../../config';
import {copyDictionaryFrom, type CopyMessagesOf} from './shell-overhaul-copy-shared';

const SOURCE = {
  location: '在哪里执行', cloud: '云端', cloudHint: '在 OceanLeo 云端执行',
  servers: '你的服务器', computers: '你的电脑', loading: '正在读取…',
  loadFailed: '读取失败，请重试；当前选择未改变', emptyServers: '还没有连接的服务器',
  programs: '选择程序', models: '程序模型', noModels: '等待程序提供模型…',
  online: '在线', offline: '离线', notConfirmed: '尚未确认接入',
  installed: '已安装', notInstalled: '未安装，请先在服务器上安装',
  signedIn: '已登录', signIn: '需要在服务器上登录', authUnknown: '登录状态待确认',
  ready: '选择程序和模型后发送', chooseProgram: '先选择程序',
  unavailable: '程序暂不可用，请确认安装和登录状态',
  startFailed: '没有发送，请检查连接后重试',
  nativeFiles: '请重新选择本地文件，随程序会话私密上传',
  nativeFileSize: '无法读取附件大小，请重新选择文件后发送',
  nativeModel: '程序默认模型', send: '发送', modelLabel: '模型：{name}',
  locationLabel: '在哪里执行：{name}',
  conversation: 'AI 对话', commandLine: 'AI 命令行', terminal: '终端',
  capabilities: '能力', selectNative: '选择这台服务器上的程序和模型',
  terminalHint: '打开这台服务器的终端', terminalConnecting: '正在连接终端…',
  terminalConnected: '已连接', terminalDisconnected: '终端已断开',
  terminalEnded: '终端已结束', terminalFailed: '终端连接失败，请重试',
  command: '输入命令', interrupt: '中断', retry: '重试',
  devices: '设备设置', myDevices: '去我的设备', noComputers: '还没有连接的服务器',
  connectHint: '接入之后会出现在这里。', missingComputer: '找不到这台服务器',
  backToList: '回列表再选一次。', terminalOutput: '终端输出',
  install: '安装', installDetail: '在这台电脑上安装这个程序', logIn: '登录',
  loginCode: '登录验证码', loginCodeHint: '输入电脑上显示的验证码', submitCode: '提交验证码',
  cancelLogin: '取消登录', modeLabel: '模式：{label}', effortLabel: '思考档位：{label}', fast: '快速',
} as const;

const EN: CopyMessagesOf<typeof SOURCE> = {
  location: 'Run on', cloud: 'Cloud', cloudHint: 'Run in the OceanLeo cloud',
  servers: 'Your servers', computers: 'Your computers', loading: 'Loading…',
  loadFailed: 'Could not load. Retry; your selection has not changed.', emptyServers: 'No connected servers yet',
  programs: 'Choose a program', models: 'Program models', noModels: 'Waiting for models from the program…',
  online: 'Online', offline: 'Offline', notConfirmed: 'Connection not confirmed',
  installed: 'Installed', notInstalled: 'Not installed. Install it on the server first.',
  signedIn: 'Signed in', signIn: 'Sign in on the server first', authUnknown: 'Sign-in status unconfirmed',
  ready: 'Choose a program and model, then send', chooseProgram: 'Choose a program first',
  unavailable: 'Program unavailable. Check installation and sign-in.',
  startFailed: 'Nothing sent. Check the connection and retry.',
  nativeFiles: 'Choose local files again to upload privately with the program session.',
  nativeFileSize: 'Could not read the attachment size. Choose the file again before sending.',
  nativeModel: 'Program default', send: 'Send', modelLabel: 'Model: {name}', locationLabel: 'Run on: {name}',
  conversation: 'AI conversation', commandLine: 'AI command line', terminal: 'Terminal',
  capabilities: 'Capabilities', selectNative: 'Choose a program and model on this server',
  terminalHint: 'Open a terminal on this server', terminalConnecting: 'Connecting terminal…',
  terminalConnected: 'Connected', terminalDisconnected: 'Terminal disconnected',
  terminalEnded: 'Terminal ended', terminalFailed: 'Could not connect the terminal. Retry.',
  command: 'Enter a command', interrupt: 'Interrupt', retry: 'Retry', devices: 'Device settings',
  myDevices: 'My devices', noComputers: 'No connected servers yet', connectHint: 'Connected servers appear here.',
  missingComputer: 'Server not found', backToList: 'Return to the list and choose again.', terminalOutput: 'Terminal output',
  install: 'Install', installDetail: 'Install this program on the computer', logIn: 'Log in',
  loginCode: 'Login code', loginCodeHint: 'Enter the code shown on the computer', submitCode: 'Submit code',
  cancelLogin: 'Cancel login', modeLabel: 'Mode: {label}', effortLabel: 'Effort: {label}', fast: 'Fast',
};

const TW: CopyMessagesOf<typeof SOURCE> = {
  location: '在哪裡執行', cloud: '雲端', cloudHint: '在 OceanLeo 雲端執行',
  servers: '你的伺服器', computers: '你的電腦', loading: '正在讀取…',
  loadFailed: '讀取失敗，請重試；目前選擇未改變', emptyServers: '還沒有連接的伺服器',
  programs: '選擇程式', models: '程式模型', noModels: '等待程式提供模型…',
  online: '線上', offline: '離線', notConfirmed: '尚未確認接入',
  installed: '已安裝', notInstalled: '未安裝，請先在伺服器上安裝',
  signedIn: '已登入', signIn: '需要在伺服器上登入', authUnknown: '登入狀態待確認',
  ready: '選擇程式和模型後傳送', chooseProgram: '先選擇程式',
  unavailable: '程式暫不可用，請確認安裝和登入狀態', startFailed: '沒有傳送，請檢查連線後重試',
  nativeFiles: '請重新選擇本機檔案，隨程式對話私密上傳', nativeModel: '程式預設模型',
  nativeFileSize: '無法讀取附件大小，請重新選擇檔案後傳送',
  send: '傳送', modelLabel: '模型：{name}', locationLabel: '在哪裡執行：{name}',
  conversation: 'AI 對話', commandLine: 'AI 命令列', terminal: '終端機', capabilities: '能力',
  selectNative: '選擇這台伺服器上的程式和模型', terminalHint: '開啟這台伺服器的終端機',
  terminalConnecting: '正在連接終端機…', terminalConnected: '已連線', terminalDisconnected: '終端機已斷線',
  terminalEnded: '終端機已結束', terminalFailed: '終端機連線失敗，請重試', command: '輸入命令',
  interrupt: '中斷', retry: '重試', devices: '裝置設定', myDevices: '前往我的裝置',
  noComputers: '還沒有連接的伺服器', connectHint: '接入之後會出現在這裡。',
  missingComputer: '找不到這台伺服器', backToList: '返回列表再選一次。', terminalOutput: '終端機輸出',
  install: '安裝', installDetail: '在這台電腦上安裝這個程式', logIn: '登入',
  loginCode: '登入驗證碼', loginCodeHint: '輸入電腦上顯示的驗證碼', submitCode: '送出驗證碼',
  cancelLogin: '取消登入', modeLabel: '模式：{label}', effortLabel: '思考檔位：{label}', fast: '快速',
};

export const W3_M3_MESSAGES = Object.fromEntries(LOCALES.map(locale => [locale,
  copyDictionaryFrom(SOURCE, locale === 'zh' ? SOURCE : locale === 'zh-TW' ? TW : EN),
])) as Record<Locale, Record<string, string>>;

/** Also consumed directly by RN, whose language preference is shared with the web. */
export function mobileNativeText(locale = 'en') {
  const table = locale === 'zh' ? SOURCE : locale === 'zh-TW' ? TW : EN;
  return (key: keyof typeof SOURCE, vars?: Record<string, string | number>): string =>
    table[key].replace(/\{(\w+)\}/g, (match, name: string) => vars?.[name] === undefined ? match : String(vars[name]));
}
