import assert from "node:assert/strict";
import { randomBytes, randomUUID, webcrypto } from "node:crypto";
import test from "node:test";
import { sealVaultValue } from "../src/lib/vault-seal.ts";

const subtle = webcrypto.subtle;
const decode = (value) => Buffer.from(value, "base64url");
async function receiver() {
  const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return { pair, key: { kid: randomUUID(), jwk: await subtle.exportKey("jwk", pair.publicKey) } };
}
async function decrypt(pair, envelope) {
  const peer = await subtle.importKey("jwk", envelope.epk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = await subtle.deriveBits({ name: "ECDH", public: peer }, pair.privateKey, 256);
  const material = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const aes = await subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(`oceanleo-vault-seal-v1|${envelope.kid}`) }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  return new TextDecoder().decode(await subtle.decrypt({ name: "AES-GCM", iv: decode(envelope.nonce), additionalData: decode(envelope.aad), tagLength: 128 }, aes, decode(envelope.ct)));
}

test("shared UI envelopes interoperate with existing ECDH/HKDF/AES-GCM vault protocol and bind owner, name and operation", async () => {
  const { pair, key } = await receiver();
  const context = { uid: randomUUID(), op: "create", name: "服务引用 🔐" };
  const value = `${randomBytes(32).toString("base64url")}\n私密文本`;
  const now = Date.now();
  const rid = randomBytes(16).toString("base64url");
  const sealed = await sealVaultValue(key, context, value, { now, rid, subtle });
  assert.equal(await decrypt(pair, sealed), value);
  assert.deepEqual(JSON.parse(decode(sealed.aad)), { v: 1, kid: key.kid, ...context, sid: "", ts: now, rid });
  assert.deepEqual(Object.keys(sealed).sort(), ["v", "kid", "epk", "nonce", "aad", "ct"].sort());
  assert.equal(decode(sealed.nonce).length, 12);
  assert.equal(decode(sealed.ct).length, Buffer.byteLength(value) + 16);
  assert.equal(JSON.stringify(sealed).includes(value), false);
});

test("rotation binds the existing secret id and uses fresh ephemeral keys/nonces for every write", async () => {
  const { pair, key } = await receiver();
  const context = { uid: randomUUID(), op: "update", name: "service", sid: randomUUID() };
  const value = randomBytes(32).toString("base64url");
  const first = await sealVaultValue(key, context, value);
  const second = await sealVaultValue(key, context, value);
  assert.equal(await decrypt(pair, second), value);
  assert.equal(JSON.parse(decode(second.aad)).sid, context.sid);
  assert.notDeepEqual(first.epk, second.epk);
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.ct, second.ct);
  const changed = JSON.parse(decode(second.aad));
  changed.uid = randomUUID();
  await assert.rejects(decrypt(pair, { ...second, aad: Buffer.from(JSON.stringify(changed)).toString("base64url") }));
});

test("invalid/oversized values and private seal keys are rejected without echoing input", async () => {
  const { key } = await receiver();
  const context = { uid: randomUUID(), op: "create", name: "service" };
  for (const invalid of ["", `${randomUUID()}\0`, "🔐".repeat(3001)]) await assert.rejects(sealVaultValue(key, context, invalid), { message: "invalid_vault_value" });
  await assert.rejects(sealVaultValue({ ...key, jwk: { ...key.jwk, d: randomUUID() } }, context, randomUUID()), { message: "invalid_vault_seal_key" });
});
