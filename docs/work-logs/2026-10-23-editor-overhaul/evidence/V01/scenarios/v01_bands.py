"""V01 D7 shell check: in each editor screenshot, how much of the top bar, the
edit bar and the stage's edge strips is the *opposite* tone of the site theme.

usage: python3 -I v01_bands.py <dir-with-r0-editors-json>...
Reads every <slug>.json written by r0-editors.mjs (rects + screenshot path).
Opposite tone: luminance < 0.35 in light theme, > 0.65 in dark theme (0..1, sRGB).
Verdict per band: ok if opposite-tone share < 15 %.
"""
import json
import sys
from pathlib import Path

from PIL import Image


def lum(p):
    r, g, b = (c / 255 for c in p[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def share(img, box, theme):
    x, y, w, h = box
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(img.width, x + w), min(img.height, y + h)
    if x1 - x0 < 2 or y1 - y0 < 2:
        return None
    crop = img.crop((x0, y0, x1, y1)).resize((max(1, (x1 - x0) // 4), max(1, (y1 - y0) // 4)))
    px = list(crop.getdata())
    bad = sum(1 for p in px if (lum(p) < 0.35 if theme == "light" else lum(p) > 0.65))
    return round(100 * bad / len(px), 1), round(sum(lum(p) for p in px) / len(px), 3)


def main():
    rows = []
    for d in sys.argv[1:]:
        for f in sorted(Path(d).glob("v01-*.json")):
            rep = json.loads(f.read_text())
            shot = rep.get("screenshot")
            if not shot or not Path(shot).exists():
                continue
            img = Image.open(shot).convert("RGB")
            theme = rep["theme"]
            rects = rep.get("rects") or {}
            bands = {}
            if rects.get("header"):
                bands["header"] = rects["header"]
            if rects.get("editBar"):
                bands["editBar"] = rects["editBar"]
            st = rects.get("stage")
            if st:
                x, y, w, h = st
                s = 14
                bands["stageEdges"] = None
                parts = [share(img, b, theme) for b in ((x, y, s, h), (x + w - s, y, s, h), (x, y + h - s, w, s))]
                parts = [p for p in parts if p]
                if parts:
                    bands["stageEdges"] = (round(sum(p[0] for p in parts) / len(parts), 1), round(sum(p[1] for p in parts) / len(parts), 3))
            res = {}
            for k, v in bands.items():
                res[k] = v if k == "stageEdges" else share(img, v, theme)
            verdict = all((v is None) or v[0] < 15 for v in res.values()) and bool(res)
            rows.append((f.stem, theme, res, "ok" if verdict else "RED"))
    for stem, theme, res, verdict in rows:
        print(f"{verdict:3} {stem:45} " + " ".join(f"{k}={v}" for k, v in res.items()))


if __name__ == "__main__":
    main()
