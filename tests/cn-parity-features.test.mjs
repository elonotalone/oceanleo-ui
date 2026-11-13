import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { DOMAIN_FAMILIES, domainFamilyFeatures } from "../src/contracts/domain-family.ts";
import { imEnabledFor } from "../src/shell/messages/messages-family.ts";

test("domain family registration covers exactly the three supported families", () => {
  assert.equal(DOMAIN_FAMILIES.length, 3);
  assert.deepEqual([...DOMAIN_FAMILIES].sort(), ["cn", "com", "ws"]);
});

for (const family of DOMAIN_FAMILIES) {
  test(`${family}: full product features and authenticated LeoChat`, () => {
    assert.deepEqual(domainFamilyFeatures(family), { bay: true, commerce: true, chat: true });
    assert.equal(Object.isFrozen(domainFamilyFeatures(family)), true);
    assert.equal(imEnabledFor(family, true), true);
    assert.equal(imEnabledFor(family, false), false);
  });
}

test("invalid family fails closed", () => {
  assert.throws(() => domainFamilyFeatures("unknown"), /Unknown domain family/);
});

test("CN LeoDev environment enables the same contract without changing family trust", () => {
  const module = new URL("../src/contracts/domain-family.ts", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "--experimental-loader", new URL("./ts-extension-loader.mjs", import.meta.url).href, "--input-type=module", "-e", `
    import { currentDomainFamily, domainFamilyFeatures, isFirstPartyHostOf, sharedCookieDomainFor } from ${JSON.stringify(module)};
    process.stdout.write(JSON.stringify({family:currentDomainFamily(),features:domainFamilyFeatures(),trust:isFirstPartyHostOf('oceanleo.app','cn'),cookie:sharedCookieDomainFor('oceanleo.cn')}));
  `], { encoding: "utf8", env: { ...process.env, NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY: "cn" } });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { family: "cn", features: { bay: true, commerce: true, chat: true }, trust: false, cookie: ".oceanleo.cn" });
});

test("CN payment messages cover every locale without Chinese in other languages", async () => {
  const { CN_PARITY_MESSAGES } = await import("../src/i18n/ui/messages/cn-parity-copy.ts");
  const { LOCALES } = await import("../src/i18n/config.ts");
  for (const locale of LOCALES) {
    assert.equal(Object.keys(CN_PARITY_MESSAGES[locale]).length, 14, locale);
    for (const text of Object.values(CN_PARITY_MESSAGES[locale])) {
      assert.ok(text.length > 0, locale);
      if (locale !== "zh" && locale !== "zh-TW") assert.doesNotMatch(text, /\p{Script=Han}/u, locale);
    }
  }
});
