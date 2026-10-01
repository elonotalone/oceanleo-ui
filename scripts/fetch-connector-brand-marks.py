#!/usr/bin/env python3
"""Download official connector marks into src/pages/plugins/brand-marks/.

Sources (in listed order per id): Simple Icons path+hex for the same product,
gilbarbara/logos, dashboard-icons, LobeHub static SVG, the brand's own URL,
or Google's cached copy of that brand's favicon. Never invent path markup.
"""

from __future__ import annotations

import base64
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "src" / "pages" / "plugins" / "brand-marks"
GEN_TS = OUT_DIR / "generated.ts"
SOURCES_JSON = OUT_DIR / "sources.json"
SI_JSON = Path("/tmp/si-probe/package/data/simple-icons.json")
SI_ICONS = Path("/tmp/si-probe/package/icons")

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
CTX = ssl.create_default_context()

# Connector id → source attempts. First successful official file wins.
# si / gb / di / lobe are collections of unmodified official marks.
# url is the brand's own file. gfav is Google's cache of that host's favicon.
SOURCES: dict[str, list[str]] = {
    "tencent-docs": ["gfav:docs.qq.com"],
    "tencent-meeting": [
        "url:https://cdn.meeting.tencent.com/assets/next-website/logo128.png",
        "gfav:meeting.tencent.com",
    ],
    "wecom": [
        "url:https://wwcdn.weixin.qq.com/node/wwnl/wwnl/style/images/independent/favicon/favicon_48h$c976bd14.png",
        "gfav:work.weixin.qq.com",
    ],
    "weixin-drive": [
        "url:https://img.weiyun.com/vipstyle/nr/box/img/favicon.ico?max_age=31536000",
        "gfav:www.weiyun.com",
    ],
    "tencent-survey": ["gfav:wj.qq.com"],
    "tencent-qidian": ["gfav:qidian.qq.com"],
    "ima-kb": [
        "url:https://fe-static.ima.myqcloud.com/ima/assets/chat/favicon.svg",
        "gfav:ima.qq.com",
    ],
    "lexiang-kb": ["gfav:lexiang.qq.com", "gfav:work.weixin.qq.com"],
    "fubangshou": ["gfav:fubangshou.com", "gfav:work.weixin.qq.com"],
    "cnb": [
        "url:https://cnb.cool/images/favicon.svg",
        "url:https://cnb.cool/images/favicon.png",
    ],
    "edgeone-pages": [
        "url:https://edgeone.ai/128.png",
        "lobe:tencentcloud-color",
    ],
    "cloudbase": [
        "url:https://www.cloudbase.net/img/favicon.png",
        "lobe:tencentcloud-color",
    ],
    "qingflow": ["url:https://qingflow.com/favicon.ico", "gfav:qingflow.com"],
    "qq-mail": ["si:qq", "gfav:mail.qq.com"],
    "netease-mail": [
        "url:https://mail.163.com/favicon.ico",
        "gfav:mail.163.com",
    ],
    "feishu": ["di:lark", "gfav:www.feishu.cn"],
    "dingtalk": [
        "url:https://gw.alicdn.com/imgextra/i3/O1CN014ZbI6ZTEhdC0ttN2_!!6000000003783-2-tps-444-444.png",
        "gfav:www.dingtalk.com",
    ],
    "tapd": ["url:https://www.tapd.cn/favicon_new.png", "gfav:www.tapd.cn"],
    "wps-docs": ["url:https://www.wps.cn/favicon.ico", "gfav:www.wps.cn"],
    "baidu-pan": ["si:baidu", "gfav:pan.baidu.com"],
    "tdx": [
        "url:https://www.tdx.com.cn/templates/tdxOfficial/images/favicon.ico",
        "gfav:www.tdx.com.cn",
    ],
    "tianyancha": ["gfav:www.tianyancha.com"],
    "qichacha": [
        "url:https://qcc-static.qcc.com/resources/web/omaterial/favicon.png",
        "gfav:www.qcc.com",
    ],
    "hundsun": [
        "url:https://www.gildata.com/assets/logo-DSZmfQOO.png",
        "gfav:www.gildata.com",
    ],
    "zte-icloud-report": ["gfav:www.zte.com.cn"],
    "pkulaw": [
        "url:https://www.pkulaw.com/favicon.ico",
        "gfav:www.pkulaw.com",
    ],
    "huayu-law": [
        "url:https://gongwen.thunisoft.com/IntelligentEditor/file/logo",
        "url:https://v.thunisoft.com/wenku/file/logo",
        "gfav:www.thunisoft.com",
    ],
    "neocrm": [
        "url:https://www.neocrm.com/wp-content/uploads/2026/03/logo_72_72.png",
        "gfav:www.neocrm.com",
    ],
    "weishi-scrm": [
        "url:https://www.weishi100.com/img/weishi.ico",
        "gfav:www.weishi100.com",
    ],
    "xiaoetong": [
        "url:https://commonresource-1252524126.cdn.xiaoeknow.com/image/lhyaurs50zil.ico",
        "gfav:www.xiaoe-tech.com",
    ],
    "ctrip": ["si:tripdotcom", "gfav:www.ctrip.com"],
    "github": ["si:github"],
    "notion": ["si:notion"],
    "openai": ["gb:openai-icon", "gb:openai", "lobe:openai"],
    "anthropic": ["si:anthropic"],
    "google-gemini": ["si:googlegemini", "lobe:gemini-color"],
    "grok": ["gb:grok", "lobe:grok"],
    "openrouter": ["si:openrouter"],
    "perplexity": ["si:perplexity"],
    "cohere": ["lobe:cohere-color", "gfav:cohere.com"],
    "huggingface": ["si:huggingface"],
    "elevenlabs": ["si:elevenlabs"],
    "heygen": [
        "url:https://www.heygen.com/favicon.ico?favicon.2m321y0geyyfh.ico",
        "gfav:www.heygen.com",
    ],
    "kling": ["lobe:kling-color", "gfav:klingai.com"],
    "flux": ["lobe:bfl", "gfav:bfl.ai"],
    "tripo": ["lobe:tripo-color", "gfav:www.tripo3d.ai"],
    "slack": ["gb:slack-icon", "gb:slack"],
    "asana": ["si:asana"],
    "linear": ["si:linear"],
    "atlassian": ["si:atlassian"],
    "monday": ["gb:monday-icon", "gb:monday"],
    "clickup": ["si:clickup"],
    "todoist": ["si:todoist"],
    "airtable": ["si:airtable"],
    "fireflies": [
        "url:https://fireflies.ai/icon.png",
        "gfav:www.fireflies.ai",
    ],
    "granola": [
        "url:https://www.granola.ai/favicon/favicon.svg",
        "url:https://www.granola.ai/favicon/apple-touch-icon.png",
    ],
    "tldv": ["url:https://tldv.io/faviconV2.png", "gfav:tldv.io"],
    "gmail": [
        "url:https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png",
        "si:gmail",
    ],
    "google-calendar": [
        "url:https://www.gstatic.com/images/branding/productlogos/calendar_2020q4/v13/192px.svg",
        "si:googlecalendar",
    ],
    "google-drive": [
        "url:https://www.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png",
        "si:googledrive",
    ],
    "outlook-mail": ["di:microsoft-outlook"],
    "outlook-calendar": ["di:microsoft-outlook"],
    "dropbox": ["si:dropbox"],
    "sentry": ["si:sentry"],
    "vercel": ["si:vercel"],
    "cloudflare": ["si:cloudflare"],
    "supabase": ["si:supabase"],
    "neon": ["si:neon"],
    "prisma-postgres": ["si:prisma"],
    "webflow": ["si:webflow"],
    "wix": ["si:wix"],
    "playwright": [
        "url:https://playwright.dev/img/playwright-logo.svg",
        "gb:playwright",
    ],
    "zapier": ["si:zapier"],
    "make": ["si:make"],
    "n8n": ["si:n8n"],
    "apify": [
        "url:https://apify.com/icon0.svg",
        "gfav:apify.com",
    ],
    "firecrawl": ["gb:firecrawl"],
    "browser": ["inline:app-window"],
    "hubspot": ["si:hubspot"],
    "intercom": ["si:intercom"],
    "close-crm": ["gb:close"],
    "apollo": [
        "url:https://www.apollo.io/icon.svg",
        "gfav:www.apollo.io",
    ],
    "mailchimp": ["si:mailchimp"],
    "stripe": ["si:stripe"],
    "paypal": ["si:paypal"],
    "xero": ["si:xero"],
    "revenuecat": ["si:revenuecat"],
    "polygon": ["gfav:polygon.io", "gfav:massive.com"],
    "ahrefs": [
        "url:https://static.ahrefs.com/favicon.svg?v=2",
        "url:https://static.ahrefs.com/apple-touch-icon-192x192.png?v=2",
    ],
    "similarweb": ["si:similarweb"],
    "zoominfo": ["gfav:www.zoominfo.com"],
    "metabase": ["si:metabase"],
    "posthog": ["si:posthog"],
    "canva": [
        "url:https://static.canva.com/static/images/android-192x192-2.png",
        "gfav:www.canva.com",
    ],
    "figma": ["si:figma"],
    "miro": ["si:miro"],
    "cloudinary": ["si:cloudinary"],
    "gitlab": ["si:gitlab"],
    "jam": [
        "url:https://framerusercontent.com/images/3zAY5a6TukbdTWkNAkTDO1Yqpc.svg",
        "gfav:jam.dev",
    ],
    "netlify": ["si:netlify"],
    "datadog": ["si:datadog"],
    "pagerduty": ["si:pagerduty"],
    "amplitude": ["gb:amplitude"],
    "mixpanel": ["si:mixpanel"],
    "explorium": [
        "url:https://www.explorium.ai/wp-content/themes/moveo-theme/assets/icon/explorium-favicon-2026.svg",
        "gfav:www.explorium.ai",
    ],
    "attio": ["gfav:attio.com"],
    "plaid": [
        "url:https://plaid.com/assets/img/favicons/apple-touch-icon.png",
        "gfav:plaid.com",
    ],
    "ramp": ["di:ramp"],
    "box": ["si:box"],
    "docusign": ["di:docusign"],
    "square": ["si:square"],
    "semrush": ["si:semrush"],
    "indeed": ["si:indeed"],
    "shopify": ["si:shopify"],
    "salesforce": ["gb:salesforce"],
    "dify": ["si:dify"],
    "serena": [
        "url:https://raw.githubusercontent.com/oraios/serena/main/src/serena/resources/dashboard/serena-icon-64.png",
    ],
    "jsonbin": [
        "url:https://jsonbin.io/images/favicon.png",
        "gfav:jsonbin.io",
    ],
    "custom": [
        "url:https://modelcontextprotocol.io/mintlify-assets/_mintlify/favicons/mcp/ebiVJzri-bsiCfVZ/_generated/favicon/android-chrome-192x192.png",
        "gfav:modelcontextprotocol.io",
    ],
}

# Lucide app-window (MIT). Used only for "My Browser", which has no vendor mark.
APP_WINDOW_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#525252" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/></svg>"""


def load_si() -> dict[str, dict]:
    if not SI_JSON.is_file():
        raise SystemExit("simple-icons pack missing at /tmp/si-probe; npm pack simple-icons first")
    icons = json.loads(SI_JSON.read_text())
    return {row["slug"]: row for row in icons}


def fetch(url: str) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, context=CTX, timeout=20) as resp:
        return resp.read(), resp.headers.get("Content-Type") or ""


def sniff(data: bytes, ctype: str) -> str | None:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"GIF":
        return "image/gif"
    if data[:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:4] in (b"\x00\x00\x01\x00", b"\x00\x00\x02\x00"):
        return "image/x-icon"
    head = data.lstrip()[:200].lower()
    if head.startswith(b"<svg") or b"<svg" in data[:800]:
        return "image/svg+xml"
    if b"<html" in head or b"<!doctype html" in head:
        return None
    if "image/" in ctype and "html" not in ctype:
        return ctype.split(";")[0].strip()
    return None


def si_bytes(slug: str, catalog: dict[str, dict]) -> bytes:
    row = catalog[slug]
    raw = (SI_ICONS / f"{slug}.svg").read_text()
    if "fill=" not in raw.split(">", 1)[0]:
        raw = raw.replace("<svg", f'<svg fill="#{row["hex"]}"', 1)
    return raw.encode("utf-8")


def resolve_spec(spec: str, catalog: dict[str, dict]) -> tuple[bytes, str, str]:
    kind, _, rest = spec.partition(":")
    if kind == "si":
        data = si_bytes(rest, catalog)
        return data, "image/svg+xml", f"simple-icons:{rest}"
    if kind == "gb":
        url = f"https://cdn.jsdelivr.net/gh/gilbarbara/logos@main/logos/{rest}.svg"
        data, ctype = fetch(url)
        mime = sniff(data, ctype)
        if not mime:
            raise RuntimeError(f"not an image: {url}")
        return data, mime, url
    if kind == "di":
        url = f"https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/{rest}.svg"
        data, ctype = fetch(url)
        mime = sniff(data, ctype)
        if not mime:
            raise RuntimeError(f"not an image: {url}")
        return data, mime, url
    if kind == "lobe":
        url = f"https://unpkg.com/@lobehub/icons-static-svg@1.74.0/icons/{rest}.svg"
        data, ctype = fetch(url)
        mime = sniff(data, ctype)
        if not mime:
            raise RuntimeError(f"not an image: {url}")
        return data, mime, url
    if kind == "url":
        data, ctype = fetch(rest)
        mime = sniff(data, ctype)
        if not mime:
            raise RuntimeError(f"not an image: {rest} ({ctype})")
        return data, mime, rest
    if kind == "gfav":
        url = (
            "https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON"
            f"&fallback_opts=TYPE,SIZE,URL&url=http://{rest}&size=128"
        )
        data, ctype = fetch(url)
        mime = sniff(data, ctype)
        if not mime:
            raise RuntimeError(f"gfav failed: {rest}")
        return data, mime, url
    if kind == "inline" and rest == "app-window":
        return APP_WINDOW_SVG.encode("utf-8"), "image/svg+xml", "lucide:app-window"
    raise RuntimeError(f"unknown spec {spec}")


def main() -> int:
    catalog = load_si()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    marks: dict[str, dict[str, str]] = {}
    provenance: dict[str, dict[str, str]] = {}
    failed: list[str] = []

    for cid, specs in SOURCES.items():
        last_err = "no sources"
        for spec in specs:
            try:
                data, mime, source = resolve_spec(spec, catalog)
                if len(data) < 80:
                    raise RuntimeError(f"too small ({len(data)} bytes)")
                marks[cid] = {
                    "src": f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}",
                    "source": source,
                    "mime": mime,
                }
                provenance[cid] = {"source": source, "spec": spec, "bytes": str(len(data)), "mime": mime}
                print(f"OK  {cid:22s} {spec} ({len(data)} {mime})")
                break
            except Exception as exc:  # noqa: BLE001 — try next official source
                last_err = f"{spec}: {exc}"
                print(f"..  {cid:22s} {last_err}")
        else:
            failed.append(f"{cid}: {last_err}")
            print(f"FAIL {cid}: {last_err}")

    if failed:
        print("FAILED", len(failed), file=sys.stderr)
        for row in failed:
            print(" ", row, file=sys.stderr)
        return 1

    SOURCES_JSON.write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + "\n")
    ids = json.dumps(sorted(marks), ensure_ascii=False)
    body = json.dumps(marks, ensure_ascii=False, indent=2)
    GEN_TS.write_text(
        "/* Generated by scripts/fetch-connector-brand-marks.py — official files only. */\n"
        "export type BrandMark = { src: string; source: string; mime: string };\n"
        f"export const CONNECTOR_BRAND_IDS: readonly string[] = {ids};\n"
        f"export const BRAND_MARKS: Record<string, BrandMark> = {body};\n"
    )
    print(f"wrote {len(marks)} marks → {GEN_TS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
