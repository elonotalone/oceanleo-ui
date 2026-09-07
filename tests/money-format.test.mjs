// 账本货币契约（2026-09-07）：钱包 / AI 费用文案的唯一格式化入口。
//
// 判据按契约写：.cn 账本是人民币（¥），.com 账本是美元（$）；前端不猜、不换算，
// 网关没说货币时回落 CNY（今天的行为），**绝不**回落 USD。
// 钱包响应归一化要同时认新键（balance / amount_major / price / input_per_m）与旧键
// （balance_yuan / amount_yuan / price_cny / input_cny_per_m），旧键在类型上保留让老站编译。

import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  DEFAULT_LEDGER_CURRENCY,
  currencySymbol,
  formatMinor,
  formatMoney,
  ledgerCurrency,
  majorToMinor,
  minorToMajor,
  normalizeCurrency,
  rememberLedgerCurrency,
  resetLedgerCurrencyForTests,
  subscribeLedgerCurrency,
} from "../src/lib/money.ts";

test("formatMoney：同一个数在两种账本上只差符号，位数按调用方给", () => {
  assert.equal(formatMoney(0.7, "USD"), "$0.70");
  assert.equal(formatMoney(5, "CNY"), "¥5.00");
  assert.equal(formatMoney(0.0037, "USD", 4), "$0.0037");
  assert.equal(formatMoney(0.0037, "CNY", 4), "¥0.0037");
  assert.equal(formatMoney(12, "USD", 0), "$12");
  assert.equal(formatMoney(1234.5678, "cny", 6), "¥1234.567800", "货币码大小写不敏感");
});

test("formatMoney：负数把负号放在符号外面；-0 不出现负号", () => {
  assert.equal(formatMoney(-3.25, "USD"), "-$3.25");
  assert.equal(formatMoney(-0.001, "CNY", 2), "¥0.00");
  assert.equal(formatMoney(-0, "USD"), "$0.00");
});

test("formatMoney：脏值按 0；未知货币码回落 CNY（今天的行为），绝不猜成美元", () => {
  assert.equal(formatMoney(undefined, "USD"), "$0.00");
  assert.equal(formatMoney("abc", "CNY"), "¥0.00");
  assert.equal(formatMoney(Number.NaN, "USD"), "$0.00");
  assert.equal(formatMoney("12.5", "USD"), "$12.50", "字串数字照样认");
  assert.equal(formatMoney(1, undefined), "¥1.00");
  assert.equal(formatMoney(1, null), "¥1.00");
  assert.equal(formatMoney(1, ""), "¥1.00");
  assert.equal(formatMoney(1, "yuan"), "¥1.00", "不是三位 ISO 码就回落 CNY");
  assert.equal(formatMoney(1, "$"), "¥1.00", "符号不是货币码，也回落 CNY");
  assert.equal(formatMoney(1, "RMB"), "¥1.00");
  assert.equal(formatMoney(1, "EUR"), "EUR 1.00", "认识的 ISO 码但没有符号表：码 + 空格，不瞎编符号");
  assert.equal(formatMoney(1, "USD", -1), "$1.00", "位数脏值按 2");
});

test("currencySymbol / normalizeCurrency", () => {
  assert.equal(currencySymbol("CNY"), "¥");
  assert.equal(currencySymbol("USD"), "$");
  assert.equal(currencySymbol(" usd "), "$");
  assert.equal(currencySymbol(undefined), "¥");
  assert.equal(currencySymbol("EUR"), "EUR");
  assert.equal(normalizeCurrency("usd"), "USD");
  assert.equal(normalizeCurrency("RMB"), "CNY");
  assert.equal(normalizeCurrency(42), "CNY");
  assert.equal(DEFAULT_LEDGER_CURRENCY, "CNY");
});

test("最小单位换算：两种账本都是 100 最小单位 = 1 主单位，四舍五入到整分", () => {
  assert.equal(minorToMajor(70), 0.7);
  assert.equal(minorToMajor("1234"), 12.34);
  assert.equal(minorToMajor(undefined), 0);
  assert.equal(majorToMinor(0.7), 70);
  assert.equal(majorToMinor(12.345), 1235);
  assert.equal(majorToMinor(1.005), 100, "浮点边界照 Math.round 的结果，不做银行家舍入");
  assert.equal(formatMinor(70, "USD"), "$0.70");
  assert.equal(formatMinor(500, "CNY"), "¥5.00");
});

test("记住的账本货币：默认 CNY，网关说了才变，变了才通知订阅者", () => {
  resetLedgerCurrencyForTests();
  assert.equal(ledgerCurrency(), "CNY");
  let notified = 0;
  const off = subscribeLedgerCurrency(() => {
    notified += 1;
  });
  assert.equal(rememberLedgerCurrency("USD"), "USD");
  assert.equal(ledgerCurrency(), "USD");
  assert.equal(notified, 1);
  rememberLedgerCurrency("usd");
  assert.equal(notified, 1, "同一个货币再记一次不通知");
  rememberLedgerCurrency(undefined);
  assert.equal(ledgerCurrency(), "CNY", "网关不说就回 CNY，不是留在上一次");
  assert.equal(notified, 2);
  off();
  rememberLedgerCurrency("USD");
  assert.equal(notified, 2, "退订后不再通知");
  resetLedgerCurrencyForTests();
});

// ---------------------------------------------------------------------------
// 钱包响应归一化（account.ts）：`./client` 换成永远有 token 的替身，fetch 换成桩，
// 让 getCredits() 真的走一遍 authed() + normalizeWallet()。
// `../money` 不替换：account.ts 与本文件 import 的是同一份真模块（data: 编译台把相对
// specifier 解析成 file://），所以 rememberLedgerCurrency 的副作用能在这里读到。
// ---------------------------------------------------------------------------

const account = await import(
  await compileModule("src/lib/auth/account.ts", {
    "./client": dataModule(`export async function accessToken() { return "test-token"; }`),
  })
);

async function withGateway(body, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("getCredits：.com 网关的新键 → balance/balance_minor/signup_grant + 旧名字同数，货币记进共享包", async () => {
  resetLedgerCurrencyForTests();
  const r = await withGateway(
    {
      currency: "USD",
      balance: 0.7,
      balance_minor: 70,
      signup_grant: 0.7,
      markup_pct: 0,
      pricing: { currency: "USD", source: "openrouter", library: "x" },
    },
    () => account.getCredits(),
  );
  assert.equal(r.ok, true);
  assert.equal(r.data.currency, "USD");
  assert.equal(r.data.balance, 0.7);
  assert.equal(r.data.balance_minor, 70);
  assert.equal(r.data.signup_grant, 0.7);
  assert.equal(r.data.balance_yuan, 0.7, "旧名字保留一个版本，同一个数");
  assert.equal(r.data.balance_fen, 70);
  assert.equal(r.data.signup_grant_yuan, 0.7);
  assert.equal(r.data.pricing.currency, "USD");
  assert.equal(ledgerCurrency(), "USD", "AppShell 余额胶囊等没有钱包响应在手的组件靠这个");
  assert.equal(formatMoney(r.data.balance, r.data.currency), "$0.70");
  resetLedgerCurrencyForTests();
});

test("getCredits：旧网关只有 balance_yuan / balance_fen 且不说货币 → 按 CNY，绝不猜美元", async () => {
  resetLedgerCurrencyForTests();
  const r = await withGateway(
    { balance_yuan: 12.5, balance_fen: 1250, signup_grant_yuan: 5, markup_pct: 0 },
    () => account.getCredits(),
  );
  assert.equal(r.data.currency, "CNY");
  assert.equal(r.data.balance, 12.5);
  assert.equal(r.data.balance_minor, 1250);
  assert.equal(r.data.signup_grant, 5);
  assert.equal(r.data.pricing.currency, "CNY");
  assert.equal(ledgerCurrency(), "CNY");
  assert.equal(formatMoney(r.data.balance, r.data.currency), "¥12.50");
});

test("getCredits：只给最小单位时主单位从它算出来；数值字串照样认", async () => {
  const r = await withGateway(
    { currency: "usd", balance_minor: "70" },
    () => account.getCredits(),
  );
  assert.equal(r.data.currency, "USD");
  assert.equal(r.data.balance, 0.7);
  assert.equal(r.data.balance_minor, 70);
  resetLedgerCurrencyForTests();
});

test("账单事件 / 用量：creditEventAmount、creditEventCost、siteUsageSpent 新键优先旧键回落", () => {
  const { creditEventAmount, creditEventCost, creditEventCurrency, siteUsageSpent } = account;
  assert.equal(creditEventAmount({ amount_major: -0.01, amount_yuan: -0.07 }), -0.01);
  assert.equal(creditEventAmount({ amount_yuan: -0.07 }), -0.07);
  assert.equal(creditEventAmount({}), 0);
  assert.equal(creditEventCost({ price: 0.002, price_cny: 0.014 }), 0.002);
  assert.equal(creditEventCost({ price_cny: 0.014 }), 0.014);
  assert.equal(creditEventCost({ price: 0 }), 0, "BYOK 免费是真 0，不回落旧键");
  assert.equal(creditEventCost(null), 0);
  assert.equal(siteUsageSpent({ spent_major: 1.5, spent_yuan: 10 }), 1.5);
  assert.equal(siteUsageSpent({ spent_yuan: 10 }), 10);
  assert.equal(siteUsageSpent(undefined), 0);

  resetLedgerCurrencyForTests();
  assert.equal(creditEventCurrency({ currency: "USD", meta: {} }), "USD");
  assert.equal(creditEventCurrency({ meta: { currency: "usd" } }), "USD", "meta 里的也认");
  assert.equal(creditEventCurrency({ meta: {} }), "CNY", "都没说 → 网关记住的（默认 CNY）");
  rememberLedgerCurrency("USD");
  assert.equal(creditEventCurrency({ meta: {} }), "USD");
  resetLedgerCurrencyForTests();
});

test("模型目录：sticker 的 input_per_m ?? input_cny_per_m，货币跟 pricing.currency 走", async () => {
  const usd = await withGateway(
    {
      pricing: { currency: "USD", source: "x", library: "y" },
      groups: [
        {
          id: "text",
          label: "文本",
          providers: [
            {
              id: "openrouter",
              label: "OpenRouter",
              models: [
                {
                  id: "gpt",
                  provider: "openrouter",
                  price: {
                    billing: "token",
                    unit: "USD/1M tokens",
                    input_per_m: 0.5,
                    output_per_m: 1.5,
                    cache_hit_per_m: 0.05,
                  },
                },
                {
                  id: "img",
                  provider: "openrouter",
                  price: { billing: "job", unit: "USD/张", price_per_unit: 0.04 },
                },
              ],
            },
          ],
          capabilities: [],
        },
      ],
    },
    () => account.getModelCatalog(),
  );
  const [gpt, img] = usd.data.groups[0].providers[0].models;
  assert.equal(gpt.price.currency, "USD");
  assert.equal(gpt.price.input_per_m, 0.5);
  assert.equal(gpt.price.output_per_m, 1.5);
  assert.equal(gpt.price.cache_hit_per_m, 0.05);
  assert.equal(gpt.price.input_cny_per_m, 0.5, "旧字段镜像同一个数，老消费站照常编译运行");
  assert.equal(img.price.currency, "USD");
  assert.equal(img.price.price_per_unit, 0.04);
  assert.equal(img.price.price_cny_per_unit, 0.04);

  const cny = await withGateway(
    {
      groups: [
        {
          id: "text",
          providers: [
            {
              id: "bailian",
              models: [
                {
                  id: "qwen",
                  provider: "bailian",
                  price: { billing: "token", unit: "CNY/1M tokens", input_cny_per_m: 2, output_cny_per_m: 6 },
                },
              ],
            },
          ],
        },
      ],
    },
    () => account.getModelCatalog(),
  );
  const qwen = cny.data.groups[0].providers[0].models[0];
  assert.equal(qwen.price.currency, "CNY", "pricing 没说货币 → CNY");
  assert.equal(qwen.price.input_per_m, 2, "旧键回填到新键");
  assert.equal(qwen.price.output_per_m, 6);
  resetLedgerCurrencyForTests();
});
