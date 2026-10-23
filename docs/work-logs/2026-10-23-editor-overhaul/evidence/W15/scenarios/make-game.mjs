// W15: put one game into the ACCEPTANCE account's library through the real generation chain.
//
// Why: there is no live public game and no game template (read-only SQL, 2026-10-23: every
// platform game root is retired, game_official_feed is empty), so "open a public game and
// fork it" is impossible. The only legitimate source is POST /v1/game-generate, which writes a
// private game owned by the signed-in (acceptance) user.
//
// The token is read from the browser context's own session cookie and only ever travels in the
// Authorization header of this one request. It is never logged and never written to disk.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w15/make node harness/run.mjs make-game.mjs
const AUTH_KEY = "sb-kvrtcumcmhyqhmawpzyc-auth-token";

function tokenFromCookies(cookies) {
  const parts = cookies
    .filter((c) => c.name === AUTH_KEY || c.name.startsWith(`${AUTH_KEY}.`))
    .sort((a, b) => {
      const ai = a.name === AUTH_KEY ? 0 : Number(a.name.split(".").pop());
      const bi = b.name === AUTH_KEY ? 0 : Number(b.name.split(".").pop());
      return ai - bi;
    })
    .map((c) => c.value)
    .join("");
  const raw = parts.startsWith("base64-") ? parts.slice(7) : parts;
  return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")).access_token;
}

export default async function ({ page, context, log, shot, helpers, args }) {
  const gateways = new Set();
  page.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/v1/")) gateways.add(url.origin);
    } catch {}
  });
  await helpers.gotoApp(page, "/library");
  for (let i = 0; i < 60 && gateways.size === 0; i += 1) await page.waitForTimeout(1000);
  log("gateway origins", JSON.stringify([...gateways]));
  const gateway = [...gateways][0];
  if (!gateway) throw new Error("no /v1/ request observed; cannot tell the gateway");
  if (/^https:\/\/api\.oceanleo\.(com|cn)$/.test(gateway)) {
    throw new Error(`refusing: ${gateway} is production`);
  }
  const token = tokenFromCookies(await context.cookies());
  const brief =
    args[0] ||
    "点击收集星星：画面里随机出现星星，点到一颗得 1 分，30 秒倒计时，时间到显示得分并可以再来一局。";
  const title = args[1] || "[W15] 星星收集";
  const started = Date.now();
  const response = await fetch(`${gateway}/v1/game-generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `w15-make-game-${args[2] || "1"}`,
    },
    body: JSON.stringify({
      brief,
      title,
      category: "休闲",
      keyMode: "platform",
      // Optional explicit route (args[3] = provider, args[4] = model); empty = gateway default.
      ...(args[3] ? { provider: args[3] } : {}),
      ...(args[4] ? { model: args[4] } : {}),
    }),
  });
  const payload = await response.json().catch(() => null);
  log(
    "generate",
    response.status,
    `${Math.round((Date.now() - started) / 1000)}s`,
    JSON.stringify({
      artifactId: payload?.artifact?.artifactId,
      revisionId: payload?.artifact?.revisionId,
      title: payload?.artifact?.title,
      repaired: payload?.generation?.repaired,
      detail: payload?.detail?.code || (typeof payload?.detail === "string" ? payload.detail : undefined),
      message: payload?.detail?.message,
      promptModeration: payload?.detail?.details?.promptModeration,
    }),
  );
  await shot("after-generate");
}
