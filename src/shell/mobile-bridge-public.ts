// 手机原生桥的**公开面**：`mobile-bridge.ts` 里哪些符号出门，只由这一份说了算。
//
// 从 `index.ts` 拆出来是因为那份门面顶到了 800 行硬顶，而这一组正好自成一体：
// 它只转出一个模块，且转出的是一张**经过挑选**的清单（见文末那条），不是整包。
//
// 装了 OceanLeo 的手机打开的是 oceanleo.com 本身（Capacitor `server.url`），
// 所以系统相册、相机、分享接收、通知必须在**网站侧**点亮 —— 客户端自带的那份策略层
// 只随断网兜底页装载，联网时不在场。主站挂载点走「动态 import + 运行时形状检查」，
// 因此**这里不导出就等于功能不通电**。
// 普通浏览器里 `detectNativeHost` 返回 null，一个插件都不引、一个监听都不注册。
export {
  detectNativeHost,
  startMobileBridge,
  pickFilesWithSystemPicker,
  pickPhotosWithSystemPicker,
  scanWithSystemCamera,
  pickNativeMedia,
  readNativeMediaUrl,
  showTaskNotification,
  normalizeTrustedDeepLink,
  queuedDeviceTaskMessage,
  MOBILE_DEGRADATION,
  MOBILE_BRIDGE_GLOBAL,
  MOBILE_NOTICE_EVENT,
  MOBILE_SHARE_EVENT,
  SHARE_EVENT_NAME,
  SHARE_LANDING_PATH,
  TRUSTED_ORIGIN as MOBILE_TRUSTED_ORIGIN,
} from "./mobile-bridge";
export type {
  MobileBridgeHandle,
  MobileBridgeOptions,
  MobileCapability,
  MobileResult,
  NativeHost,
  NativeMedia,
  TaskNotification,
} from "./mobile-bridge";
// `registerMobileAsExecutionDevice` 刻意**不**进公开门面：它是个永远返回
// `{registered:false}` 的空操作，用来把「手机永不是执行设备」钉成可断言的事实。
// 但一个叫 register… 的公开 API 却什么都不注册，对外部消费者是命名陷阱；
// 测试直接引模块路径，拿得到，不需要经过门面。
