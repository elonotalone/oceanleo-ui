import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { LOCALES } from "../src/i18n/config.ts";
import { RDLOGIN_ACT_MESSAGES, RDLOGIN_ACT_SOURCE as COPY } from "../src/i18n/ui/messages/rdlogin-act-copy.ts";
const { rdActivationView, rdCapabilityView } = await import(await compileModule("src/shell/RdServiceStatus.tsx", {
  "next-intl": dataModule('export function useLocale() { return "en"; }'),
}));
test("missing and malformed activation stay unapproved",()=>{
  for(const value of [null,{}, {activation:null},{activation:"ready"}]){
    const view=rdActivationView(value);
    assert.equal(view.signing,COPY.signingRequired);assert.equal(view.elevation,COPY.elevationUnavailable);assert.equal(view.owner,COPY.ownerUnknown);
  }
});
test("configured signer alone does not verify a service or owner",()=>{
  const view=rdActivationView({activation:{signing:"configured",elevation:"unavailable",owner:"approved"}});
  assert.equal(view.signing,COPY.signingConfigured);assert.equal(view.owner,COPY.ownerUnknown);
});
test("verified connection and owner do not verify capture or input",()=>{
  const snapshot={activation:{signing:"configured",elevation:"ready",owner:"approved"}};
  assert.equal(rdActivationView(snapshot).owner,COPY.ownerApproved);
  assert.equal(rdActivationView(snapshot).elevation,COPY.elevationReady);
  assert.equal(rdCapabilityView(snapshot).rows[1].input,"尚未验证");
});
test("approval and unknown raw errors use only closed localized copy",()=>{
  const view=rdActivationView({activation:{elevation:"requiresApproval",error:"secret or untranslated library diagnostic"}});
  assert.equal(view.elevation,COPY.approvalRequired);assert.equal(view.error,COPY.operationFailed);
  assert.doesNotMatch(JSON.stringify(view),/secret or untranslated/);
});
test("all locales have complete safe copy",()=>{
  for(const locale of LOCALES)for(const source of Object.values(COPY)){
    const value=RDLOGIN_ACT_MESSAGES[locale][source];assert.ok(value);
    if(!["zh","zh-TW"].includes(locale)){assert.equal(value,RDLOGIN_ACT_MESSAGES.en[source]);assert.doesNotMatch(value,/\p{Script=Han}/u);}
  }
});
