import { parentPort, workerData } from "node:worker_threads";
import { createHash } from "node:crypto";
import { compileModule } from "./module-bench.mjs";

const store = new Map(workerData.storage ?? []);
const storage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
const tabStore = new Map(workerData.tabStorage ?? []);
const tabStorage = {
  getItem: (key) => tabStore.get(key) ?? null,
  setItem: (key, value) => tabStore.set(key, String(value)),
  removeItem: (key) => tabStore.delete(key),
};
const origin = "https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com";
const win = new EventTarget();
win.location = new URL(origin + "/settings/account" + (workerData.providerError ? "?error=access_denied&error_description=fixture-denied" : workerData.stage === "return" ? "?code=fixture-google-code" : workerData.staleCode ? "?code=previous-failed-code&keep=1" : ""));
win.history = { state: null, replaceState(state, _unused, target) { this.state = state; win.location = new URL(target, win.location); } };
const doc = new EventTarget();
doc.cookie = "oceanleo-dev-guest=1; sb-family-auth-token=family-account";
doc.visibilityState = "visible";
const queues = new Map();
const locks = { request(name, options, callback) {
  if (options.ifAvailable && queues.has(name)) return Promise.resolve(callback(null));
  const previous = queues.get(name) || Promise.resolve();
  const current = previous.then(() => callback({name,mode:"exclusive"}));
  const settled = current.catch(() => {});
  queues.set(name, settled);
  void settled.finally(() => { if (queues.get(name) === settled) queues.delete(name); });
  return current;
} };
Object.assign(win, { document: doc, localStorage: storage, sessionStorage: tabStorage, navigator: {locks}, setTimeout, clearTimeout });
for (const [key, value] of Object.entries({ window: win, document: doc, localStorage: storage, sessionStorage: tabStorage, navigator: win.navigator, BroadcastChannel: undefined })) {
  Object.defineProperty(globalThis, key, { value, configurable: true });
}
process.env.NEXT_PUBLIC_OCEANLEO_SUPABASE_URL = "https://identity-fixture.supabase.co";
process.env.NEXT_PUBLIC_OCEANLEO_ANON_KEY = "fixture-public-anon-key";
const userId = "00000000-0000-4000-8000-000000000026";
const user = { id: userId, email: "oauth-fixture@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, factors: [], created_at: new Date().toISOString() };
if (workerData.chunkedSession) user.user_metadata.padding = "n".repeat(5000);
const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const token = `${part({alg:"HS256",typ:"JWT"})}.${part({sub:userId,exp:now+3600,iat:now,aal:"aal1",amr:[]})}.fixture`;
if (workerData.expiredSession) {
  const overlay = JSON.parse(store.get("oceanleo-leodev-auth-overlay") || "[]");
  const proof = overlay.find((entry) => entry.name.endsWith("-code-verifier"));
  const name = proof?.name.replace(/-code-verifier$/, "") || "sb-kvrtcumcmhyqhmawpzyc-auth-token";
  const session = { access_token: token, refresh_token: "expired-fixture-refresh", expires_at: now - 3600, user };
  if (workerData.chunkedSession) session.user = { ...user, user_metadata: { padding: "o".repeat(18000) } };
  const encodedSession = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  if (workerData.chunkedSession) {
    for (let offset = 0; offset < encodedSession.length; offset += 3180) overlay.push({ name: `${name}.${offset / 3180}`, value: encodedSession.slice(offset, offset + 3180) });
  } else overlay.push({ name, value: encodedSession });
  store.set("oceanleo-leodev-auth-overlay", JSON.stringify(overlay));
}
let exchanges = 0;
let refreshes = 0;
let proofMatches = false;
let releaseExchange;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.pathname.endsWith("/token") && url.searchParams.get("grant_type") === "refresh_token") {
    refreshes += 1;
    // A previous session's network request must not gate a fresh Google login.
    return new Promise(() => {});
  }
  if (url.pathname.endsWith("/token") && url.searchParams.get("grant_type") === "pkce") {
    exchanges += 1;
    const body = JSON.parse(init.body);
    const computed = createHash("sha256").update(body.code_verifier || "").digest("base64url");
    proofMatches = body.auth_code === "fixture-google-code" && computed === workerData.challenge;
    if (!proofMatches) return Response.json({error:"invalid_grant",msg:"PKCE proof mismatch"}, {status:400});
    if (workerData.stalledExchange) await new Promise((resolve) => { releaseExchange = resolve; });
    const payload = { access_token: token, refresh_token: "fixture-refresh", expires_in:3600, expires_at:now+3600, token_type:"bearer", user };
    if (workerData.stalledBody) return new Response(new ReadableStream({ start(controller) {
      releaseExchange = () => { controller.enqueue(new TextEncoder().encode(JSON.stringify(payload))); controller.close(); };
    } }), { headers: { "content-type": "application/json" } });
    return Response.json(payload);
  }
  if (url.pathname.endsWith("/user")) return Response.json(user);
  throw new Error("Unexpected OAuth fixture request");
};

let auth;
try {
  auth = await import(await compileModule("src/lib/auth/client.ts"));
  if (workerData.stage === "begin") {
    const initiallyGuest = await auth.getUserId() === null;
    const result = await auth.startOauthSignIn("google");
    const url = result.url ? new URL(result.url) : null;
    parentPort.postMessage({ initiallyGuest, error:result.error, challenge:url?.searchParams.get("code_challenge"), method:url?.searchParams.get("code_challenge_method"), redirect:url?.searchParams.get("redirect_to"), storage:[...store],tabStorage:[...tabStore] });
  } else {
    const initialized = await auth.browserClient().auth.initialize();
    const ids = await Promise.all(Array.from({length:8}, () => auth.getUserId()));
    const { browserOauthReturnState } = await import("../../src/lib/auth/oauth-return.ts");
    let retryUrl;
    let lateSession;
    let retryProofPreserved;
    if (workerData.retry) {
      const retry = await auth.startOauthSignIn("google");
      retryUrl = retry.url;
      const retryProof = JSON.stringify([...tabStore]);
      releaseExchange?.();
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (workerData.stalledExchange || workerData.stalledBody) lateSession = (await auth.browserClient().auth.getSession()).data.session?.user?.id || null;
      retryProofPreserved = JSON.stringify([...tabStore]) === retryProof;
    }
    parentPort.postMessage({ id:ids[0], allReadersAgree:ids.every(id=>id===ids[0]), exchanges, refreshes, proofMatches, stillHasCode:win.location.searchParams.has("code"), stillHasError:win.location.searchParams.has("error"), returnState:browserOauthReturnState(), initError:initialized.error?.code || initialized.error?.message, retryUrl, lateSession, retryProofPreserved, storage:[...store] });
  }
} catch (error) {
  parentPort.postMessage({ failure:error.name + ": " + error.message });
} finally {
  await auth?.browserClient()?.auth.dispose();
  parentPort.close();
}
