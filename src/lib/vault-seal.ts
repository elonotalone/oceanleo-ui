export type VaultSealKey = { kid: string; jwk: JsonWebKey };
export type VaultSealContext = { uid: string; op: "create" | "update"; name: string; sid?: string };
export type VaultSealedEnvelope = {
  v: 1; kid: string; epk: { kty: "EC"; crv: "P-256"; x: string; y: string };
  nonce: string; aad: string; ct: string;
};

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sealVaultValue(
  key: VaultSealKey, ctx: VaultSealContext, value: string,
  opts?: { now?: number; rid?: string; subtle?: SubtleCrypto },
): Promise<VaultSealedEnvelope> {
  const subtle = opts?.subtle ?? globalThis.crypto.subtle;
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(value);
  if (!plaintext.length || plaintext.length > 12000 || value.includes("\0")) {
    throw new Error("invalid_vault_value");
  }
  if (key.jwk.kty !== "EC" || key.jwk.crv !== "P-256" || key.jwk.d) {
    throw new Error("invalid_vault_seal_key");
  }
  try {
    const recipient = await subtle.importKey("jwk", key.jwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const ephemeral = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const shared = await subtle.deriveBits({ name: "ECDH", public: recipient }, ephemeral.privateKey, 256);
    const material = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
    new Uint8Array(shared).fill(0);
    const aes = await subtle.deriveKey({
      name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32),
      info: encoder.encode(`oceanleo-vault-seal-v1|${key.kid}`),
    }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const aad = encoder.encode(JSON.stringify({
      v: 1, kid: key.kid, uid: ctx.uid, op: ctx.op, name: ctx.name, sid: ctx.sid ?? "",
      ts: opts?.now ?? Date.now(), rid: opts?.rid ?? base64url(globalThis.crypto.getRandomValues(new Uint8Array(16))),
    }));
    const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 }, aes, plaintext);
    const pub = await subtle.exportKey("jwk", ephemeral.publicKey);
    return {
      v: 1, kid: key.kid, epk: { kty: "EC", crv: "P-256", x: pub.x!, y: pub.y! },
      nonce: base64url(nonce), aad: base64url(aad), ct: base64url(new Uint8Array(ciphertext)),
    };
  } finally {
    plaintext.fill(0);
  }
}
