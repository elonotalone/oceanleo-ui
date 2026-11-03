import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";

const SOURCE = {
  k00: "中国版网站发布到你自己的阿里云账号，费用由该账号承担。预览仍在隔离沙箱中。",
  k01: "阿里云账号 ID",
  k02: "中国大陆地域",
  k03: "专用私有 OSS Bucket",
  k04: "此网站的隔离域名",
  k05: "网站备案号",
  k06: "如果 Bucket 不存在，我同意在所选地域创建私有 Bucket。",
  k07: "连接阿里云账号",
  k08: "阿里云账号已连接；密钥已加密保存。",
  k09: "请先为隔离域名完成备案和阿里云 DNS 归属校验，并在自己的账号中准备匹配的 HTTPS 证书。",
  k10: "阿里云证书 ID",
  k11: "我同意配置此网站专用的 CDN、私有 OSS 回源和 HTTPS。",
  k12: "配置网站托管",
  k13: "请将此网站域名的 CNAME 指向：",
  k14: "发布到我的阿里云",
  k15: "托管操作未完成，请检查状态。",
  k16: "尚未发布",
  k17: "CDN 变更正在生效",
  k18: "已发布",
  k19: "云端操作结果需要核对",
  k20: "可用",
  k21: "失败",
  k22: "已删除",
  k23: "当前网站",
  k24: "检查发布状态",
  k25: "删除部署",
  k26: "托管状态尚未确认",
  k27: "网站还没有可发布的版本。",
  k28: "回滚",
  k29: "停止公开网站",
  k30: "更新阿里云密钥",
};
type Messages = CopyMessagesOf<typeof SOURCE>;
const EN: Messages = {
  k00: "China edition websites publish to your own Alibaba Cloud account, which pays the hosting charges. Previews stay in the isolated sandbox.",
  k01: "Alibaba Cloud account ID", k02: "Mainland China region", k03: "Dedicated private OSS bucket",
  k04: "This website's isolated domain", k05: "Website ICP filing number",
  k06: "If the bucket does not exist, I consent to creating a private bucket in the selected region.",
  k07: "Connect Alibaba Cloud account", k08: "Alibaba Cloud account connected. Credentials are stored encrypted.",
  k09: "Complete ICP filing and Alibaba Cloud DNS ownership verification for the isolated domain, and prepare a matching HTTPS certificate in your account.",
  k10: "Alibaba Cloud certificate ID", k11: "I consent to configuring this website's dedicated CDN, private OSS origin and HTTPS.",
  k12: "Configure website hosting", k13: "Point this website's CNAME to:", k14: "Publish to my Alibaba Cloud",
  k15: "The hosting operation did not complete. Check its status.", k16: "Not published", k17: "CDN changes are propagating",
  k18: "Published", k19: "The cloud operation needs reconciliation", k20: "Ready", k21: "Failed", k22: "Deleted",
  k23: "Current website", k24: "Check publication status", k25: "Delete deployment", k26: "Hosting status is unconfirmed",
  k27: "This website has no revision to publish yet.", k28: "Roll back",
  k29: "Unpublish website",
  k30: "Rotate Alibaba Cloud credentials",
};
const ZH_TW: Messages = {
  k00: "中國版網站發佈到你自己的阿里雲帳號，費用由該帳號承擔。預覽仍在隔離沙箱中。",
  k01: "阿里雲帳號 ID", k02: "中國大陸地域", k03: "專用私有 OSS Bucket", k04: "此網站的隔離網域", k05: "網站備案號",
  k06: "如果 Bucket 不存在，我同意在所選地域建立私有 Bucket。", k07: "連接阿里雲帳號", k08: "阿里雲帳號已連接；金鑰已加密儲存。",
  k09: "請先為隔離網域完成備案和阿里雲 DNS 歸屬驗證，並在自己的帳號中準備相符的 HTTPS 憑證。",
  k10: "阿里雲憑證 ID", k11: "我同意配置此網站專用的 CDN、私有 OSS 回源和 HTTPS。", k12: "配置網站託管",
  k13: "請將此網站網域的 CNAME 指向：", k14: "發佈到我的阿里雲", k15: "託管操作未完成，請檢查狀態。",
  k16: "尚未發佈", k17: "CDN 變更正在生效", k18: "已發佈", k19: "雲端操作結果需要核對", k20: "可用", k21: "失敗", k22: "已刪除",
  k23: "目前網站", k24: "檢查發佈狀態", k25: "刪除部署", k26: "託管狀態尚未確認", k27: "網站還沒有可發佈的版本。", k28: "回復版本",
  k29: "停止公開網站",
  k30: "更新阿里雲金鑰",
};

export const CN_HOST_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN)]),
) as Record<Locale, Record<string, string>>;
