import previous from "./s7-material.mjs";
export default async function (ctx) {
  ctx.page.on("request", request => {
    const url = new URL(request.url());
    if (!/\/v1\/(?:library|materials|artifacts).*search/.test(url.pathname)) return;
    let body = {};
    try { body = JSON.parse(request.postData() || "{}"); } catch {}
    const allowed = ["query", "scope", "siteId", "site_id", "artifactType", "artifact_type", "artifactTypes", "artifact_types", "limit", "types"];
    ctx.log("material-query", request.method(), url.pathname, JSON.stringify(Object.fromEntries(allowed.flatMap(key => key in body ? [[key, body[key]]] : url.searchParams.has(key) ? [[key, url.searchParams.get(key)]] : []))));
  });
  await previous(ctx);
}
