// W14: read-only fetch of a website-source@1 entrypoint (public template) to learn its real shape.
// Token stays in the Authorization header of in-page requests; never logged.
// args: [artifactId, revisionId, outFile]
import fs from "node:fs";

export default async function ({ page, log, helpers, args }) {
  const artifactId = args[0] || "6b16c807-da26-4fe5-be93-ef3e4c9c60ee";
  const revisionId = args[1] || "6d45db29-943a-4abf-88e9-70724262ca19";
  const out = args[2] || "/tmp/w14-source.json";
  const depPath = args[3] || "images/ind-fashion--pexels-1381562.webp";
  const gateways = new Set();
  page.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/v1/")) gateways.add(url.origin);
    } catch {}
  });
  await helpers.gotoApp(page, "/library");
  for (let i = 0; i < 60 && gateways.size === 0; i += 1) await page.waitForTimeout(1000);
  const gateway = [...gateways][0];
  if (!gateway || /^https:\/\/api\.oceanleo\.(com|cn)$/.test(gateway)) throw new Error(`bad gateway ${gateway}`);
  log("gateway", gateway);
  const result = await page.evaluate(
    async ({ gateway, artifactId, revisionId, depPath }) => {
      const key = "sb-kvrtcumcmhyqhmawpzyc-auth-token";
      const parts = document.cookie
        .split("; ")
        .map((c) => c.split("="))
        .filter(([name]) => name === key || name.startsWith(`${key}.`))
        .sort((a, b) => (a[0] === key ? 0 : Number(a[0].split(".").pop())) - (b[0] === key ? 0 : Number(b[0].split(".").pop())))
        .map(([, v]) => decodeURIComponent(v))
        .join("");
      const raw = parts.startsWith("base64-") ? parts.slice(7) : parts;
      const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
      const token = JSON.parse(decodeURIComponent(escape(atob(b64)))).access_token;
      const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
      const grant = await fetch(`${gateway}/v1/artifacts/${artifactId}/source?revisionId=${revisionId}`, { headers });
      const grantJson = await grant.json();
      const url = grantJson.accessUrl || grantJson.access_url;
      const abs = url.startsWith("/") ? gateway + url : url;
      const text = await (await fetch(abs)).text();
      const dep = await fetch(
        `${gateway}/v1/artifacts/${artifactId}/revisions/${revisionId}/source-dependencies/${depPath}`,
        { headers },
      );
      const depJson = await dep.json().catch(() => null);
      let depFetch = null;
      if (depJson && (depJson.accessUrl || depJson.access_url)) {
        const u = depJson.accessUrl || depJson.access_url;
        const r = await fetch(u.startsWith("/") ? gateway + u : u);
        const buf = await r.arrayBuffer();
        depFetch = { status: r.status, type: r.headers.get("content-type"), bytes: buf.byteLength, text: /json|text/.test(r.headers.get("content-type") || "") ? new TextDecoder().decode(buf) : null };
      }
      return { grantStatus: grant.status, text, depStatus: dep.status, depKeys: depJson ? Object.keys(depJson) : null, depUrlShape: depJson ? String(depJson.accessUrl || "").replace(/access\/[^/?]+/, "access/<token>") : null, depFetch };
    },
    { gateway, artifactId, revisionId, depPath },
  );
  fs.writeFileSync(out, result.text);
  if (result.depFetch?.text) fs.writeFileSync(out + ".dep", result.depFetch.text);
  if (result.depFetch) delete result.depFetch.text;
  log("source", JSON.stringify({ grant: result.grantStatus, bytes: result.text.length, dep: result.depStatus, keys: result.depKeys, shape: result.depUrlShape, fetch: result.depFetch }));
}
