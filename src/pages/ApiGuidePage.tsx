"use client";

// ============================================================================
// @oceanleo/ui — API 指导文档（/api/guide 子页）
// ----------------------------------------------------------------------------
// 教用户如何在各主流平台购买 API、生成 token，并填进 OceanLeo 的 BYOK。
// 覆盖 6 家：阿里云百炼 / OpenAI / DeepSeek / OpenRouter / 火山方舟 / Anthropic。
// 纯静态内容，只依赖 react。各站把它包进自己的 shell，挂在 /api/guide。
// ============================================================================

import { useUI } from "../i18n/ui/useUI";

interface Platform {
  id: string;
  name: string;
  consoleUrl: string;
  pricingUrl: string;
  baseUrl: string;
  keyPrefix: string;
  china: "easy" | "hard";
  steps: string[];
  note?: string;
}

const PLATFORMS: Platform[] = [
  {
    id: "bailian",
    name: "阿里云百炼（通义千问 / 万相）",
    consoleUrl: "https://bailian.console.aliyun.com/?apiKey=1#/api-key",
    pricingUrl: "https://help.aliyun.com/zh/model-studio/billing-for-model-studio",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keyPrefix: "sk-",
    china: "easy",
    steps: [
      "用阿里云账号登录百炼控制台 bailian.console.aliyun.com，首次使用需实名认证并开通「百炼」。",
      "点击右上角头像旁的「API-KEY」入口（或左侧菜单「API-KEY 管理」）。",
      "点击「创建我的 API-KEY」，选择业务空间（默认即可），确认创建。",
      "在列表中「查看 / 复制」以 sk- 开头的密钥，妥善保存（仅创建时可完整查看）。",
      "回到 OceanLeo 的 API 页，厂商选「阿里云百炼」，粘贴该 key 即可。",
    ],
    note: "国内可直连，支持支付宝/微信/银行卡，新用户通常有免费额度，对大陆用户最友好。这也是唯一支持 BYOK 文/图/视频/语音全能力的厂商。",
  },
  {
    id: "deepseek",
    name: "DeepSeek（深度求索）",
    consoleUrl: "https://platform.deepseek.com/api_keys",
    pricingUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    baseUrl: "https://api.deepseek.com/v1",
    keyPrefix: "sk-",
    china: "easy",
    steps: [
      "访问 platform.deepseek.com，用手机号/邮箱注册并登录开放平台。",
      "在「充值 / 余额」处充值（支持人民币，按量计费）。",
      "点击左侧「API keys」→「创建 API key」。",
      "填写名称后创建，立即复制以 sk- 开头的密钥（仅显示一次）。",
      "在 OceanLeo 的 API 页厂商选「DeepSeek」，粘贴 key。",
    ],
    note: "国内可直连，人民币支付，对大陆用户友好。",
  },
  {
    id: "volcano",
    name: "火山方舟（豆包 / Volcengine Ark）",
    consoleUrl:
      "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    pricingUrl: "https://www.volcengine.com/docs/82379/1099320",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    keyPrefix: "",
    china: "easy",
    steps: [
      "用火山引擎账号登录方舟控制台 console.volcengine.com/ark，实名并开通方舟。",
      "在「开通管理」开通所需模型（如豆包系列）。",
      "进入左侧「API Key 管理」→「创建 API Key」，复制保存。",
      "在「在线推理 / 接入点」为目标模型创建接入点，得到接入点 ID（形如 ep-xxxx）。",
      "在 OceanLeo 的 API 页厂商选「火山方舟」，粘贴 key；调用时模型名用该 ep- 接入点 ID。",
    ],
    note: "国内可直连，人民币支付。注意它与其它平台不同：需先建「接入点」并用 ep- 作为模型名调用。",
  },
  {
    id: "openrouter",
    name: "OpenRouter（聚合 400+ 模型）",
    consoleUrl: "https://openrouter.ai/keys",
    pricingUrl: "https://openrouter.ai/models",
    baseUrl: "https://openrouter.ai/api/v1",
    keyPrefix: "sk-or-",
    china: "hard",
    steps: [
      "访问 openrouter.ai，用 Google / GitHub 等账号注册并登录。",
      "进入「Credits」页面充值（支持境外信用卡，也支持加密货币）。",
      "打开 openrouter.ai/keys，点击「Create Key」。",
      "填写名称（可设额度上限），创建并复制以 sk-or- 开头的密钥。",
      "在 OceanLeo 的 API 页厂商选「OpenRouter」，粘贴 key。",
    ],
    note: "控制台需海外网络访问，充值需境外信用卡或加密货币，大陆用户需自备网络与境外支付方式。",
  },
  {
    id: "openai",
    name: "OpenAI（GPT）",
    consoleUrl: "https://platform.openai.com/api-keys",
    pricingUrl: "https://openai.com/api/pricing",
    baseUrl: "https://api.openai.com/v1",
    keyPrefix: "sk-",
    china: "hard",
    steps: [
      "访问 platform.openai.com 注册/登录账号（部分地区需手机号验证）。",
      "进入「Settings → Billing」充值，绑定境外信用卡并预付费（无免费额度）。",
      "打开 platform.openai.com/api-keys，点击「Create new secret key」。",
      "填写名称、选择 Project，创建并立即复制以 sk- 开头的密钥（仅显示一次）。",
      "在 OceanLeo 的 API 页厂商选「OpenAI」，粘贴 key。",
    ],
    note: "大陆较难直接使用：需海外网络访问控制台，充值需境外信用卡（不支持国内卡）。",
  },
  {
    id: "anthropic",
    name: "Anthropic（Claude）",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    pricingUrl: "https://www.anthropic.com/pricing",
    baseUrl: "https://api.anthropic.com/v1/",
    keyPrefix: "sk-ant-",
    china: "hard",
    steps: [
      "访问 console.anthropic.com 注册/登录账号（需邮箱与手机号验证）。",
      "进入「Settings → Billing」充值，绑定境外信用卡并预付费。",
      "打开「Settings → API Keys」，点击「Create Key」。",
      "填写名称、选择 Workspace，创建并立即复制以 sk-ant- 开头的密钥（仅显示一次）。",
      "在 OceanLeo 的 API 页厂商选「Anthropic (Claude)」，粘贴 key。",
    ],
    note: "大陆较难使用：控制台需海外网络访问，注册/充值需境外手机号与信用卡。",
  },
];

export function ApiGuidePage() {
  const tt = useUI();
  return (
    <div className="px-8 py-6">
      <div className="flex items-center gap-3">
        <a
          href="/api"
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-600 transition hover:bg-neutral-50"
        >
          {tt("← 返回 API")}
        </a>
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
          {tt("指导文档")}
        </h1>
      </div>

      <div className="mx-auto mt-6 max-w-3xl space-y-6">
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-5 text-[13px] leading-relaxed text-neutral-600">
          {tt("OceanLeo 全家桶支持")} <span className="font-semibold text-neutral-900">{tt("BYOK（自带 API key）")}</span>{tt("：\n          你在各厂商平台买好 API、拿到 token，填进 OceanLeo 的「API」页，即可用自己的 key\n          免费使用全家桶的全部能力（用自己的 key、自己的成本，OceanLeo 不扣你的钱包）。\n          下面是 6 家主流平台的购买与取 token 步骤。")}
        </div>

        {PLATFORMS.map((p) => (
          <section
            key={p.id}
            className="v-fade-up rounded-2xl border border-neutral-200 p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-neutral-900">{tt(p.name)}</h2>
              <span
                className={[
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                  p.china === "easy"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700",
                ].join(" ")}
              >
                {p.china === "easy" ? tt("大陆可直连") : tt("需海外网络/支付")}
              </span>
            </div>

            <ol className="mt-3 space-y-1.5">
              {p.steps.map((s, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-neutral-700">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-neutral-900 text-[10px] text-white">
                    {i + 1}
                  </span>
                  <span>{tt(s)}</span>
                </li>
              ))}
            </ol>

            {p.note && (
              <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-[12px] leading-relaxed text-neutral-500">
                {tt(p.note)}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <a
                href={p.consoleUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-neutral-900 px-2.5 py-1 font-medium text-white transition hover:bg-neutral-800"
              >
                {tt("获取 API key ↗")}
              </a>
              <a
                href={p.pricingUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-neutral-200 px-2.5 py-1 text-neutral-600 transition hover:bg-neutral-50"
              >
                {tt("价格说明 ↗")}
              </a>
              <span className="rounded-md border border-neutral-200 px-2.5 py-1 font-mono text-neutral-500">
                base_url: {p.baseUrl}
              </span>
              {p.keyPrefix && (
                <span className="rounded-md border border-neutral-200 px-2.5 py-1 font-mono text-neutral-500">
                  key 前缀: {p.keyPrefix}
                </span>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
