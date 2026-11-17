#!/usr/bin/env python3
"""Local-only font delivery preparation, no bucket/container/fontconfig writes.

Default: list pinned source files. --fetch downloads exact locked bytes to cache.
--write emits hashed WOFF2 subsets with full licences; requires existing fontTools
and brotli (use the existing material font environment, never install at runtime).
"""
import argparse
import copy
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

SYSTEM = [
    ('Noto Sans Mono CJK SC', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 7, 400),
    ('Noto Sans Mono CJK SC', '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 7, 700),
    ('DejaVu Sans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 0, 400),
    ('DejaVu Sans', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 0, 700),
    ('DejaVu Sans Mono', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 0, 400),
    ('DejaVu Sans Mono', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', 0, 700),
]
SYSTEM_SHA256 = {'/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc': 'b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a', '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc': 'faa5f3656a78b2e2d450d27fe8382c778bc2b6bb5ea29c986664a6a435056ceb', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf': 'ae7b7855e115a5966d8b1b3f80f254ccc117ec86f9965e202ee2940453837280', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf': '5c1247acef7f2b8522a31742c76d6adcb5569bacc0be7ceaa4dc39dd252ce895', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf': 'c805f9436dbc268644c1d9584f01a601a653e028e08fd74b9b949f6cf8304d88', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf': '3a3c502eeff669a231549e80df9f7c49de109bafe303170409e905d0b31a38fe'}
LOCK = Path(__file__).with_name('material-font-sources.json')


def sha(data): return hashlib.sha256(data).hexdigest()


def ranges(points):
    out = []
    for point in sorted(points):
        if out and point == out[-1][1] + 1: out[-1][1] = point
        else: out.append([point, point])
    return ','.join(f'U+{a:X}' + (f'-{b:X}' if a != b else '') for a, b in out)


def fetch(cache, entries):
    for entry in entries:
        dest = cache / entry['cachePath']
        if dest.is_file() and sha(dest.read_bytes()) == entry['sourceSha256']: continue
        with urllib.request.urlopen(urllib.request.Request(entry['source'], headers={'User-Agent': 'OceanLeo-font-delivery'}), timeout=60) as response:
            raw = response.read(40*1024*1024)
        if entry.get('archiveMember'):
            if sha(raw) != entry['archiveSha256']: raise ValueError('archive digest mismatch')
            with zipfile.ZipFile(io.BytesIO(raw)) as archive: raw = archive.read(entry['archiveMember'])
        if sha(raw) != entry['sourceSha256']: raise ValueError('source digest mismatch')
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(raw)


def prepare(output, cache, entries):
    from fontTools.ttLib import TTFont
    from fontTools import subset
    inputs = []
    for family, source, index, weight in SYSTEM:
        if sha(Path(source).read_bytes()) != SYSTEM_SHA256[source]: raise ValueError('system font version differs from the delivery lock')
        inputs.append(dict(family=family, path=source, index=index, weight=weight, source=source, sourceSha256=sha(Path(source).read_bytes())))
    for entry in entries:
        path = cache / entry['cachePath']
        if sha(path.read_bytes()) != entry['sourceSha256']: raise ValueError('cached source digest mismatch')
        if path.suffix.lower() in {'.ttf', '.otf'}:
            inputs.append(dict(entry, path=str(path), index=0))
    version = sha(json.dumps([(i['family'],i['sourceSha256']) for i in inputs]).encode())[:12]
    output.mkdir(parents=True, exist_ok=True)
    specs = []
    for item in inputs:
        font = TTFont(item['path'], fontNumber=item['index'], recalcTimestamp=False)
        family = item['family']
        # Legacy names must refer to real font bytes, never a Noto substitute.
        if family not in {font['name'].getDebugName(1),font['name'].getDebugName(16)}:
            raise ValueError(f'font family mismatch: {family}')
        axes = {a.axisTag: [a.minValue,a.defaultValue,a.maxValue] for a in font['fvar'].axes} if 'fvar' in font else {}
        weight = item.get('weight') or (axes.get('wght') or [None, font['OS/2'].usWeightClass])[1]
        weight_range = f"{axes['wght'][0]:g} {axes['wght'][2]:g}" if 'wght' in axes else str(weight)
        style = 'italic' if font['OS/2'].fsSelection & 1 else 'normal'
        stem = family.lower().replace(' ', '-') + f'-{weight:g}-{style}'
        license_input = next((e for e in entries if e['family']==family and e['cachePath'].endswith('OFL.txt')), None)
        license_text = (cache/license_input['cachePath']).read_text() if license_input else font['name'].getDebugName(13)
        if not license_text: raise ValueError('font has no licence')
        license_path = output / (stem + '-LICENSE.txt')
        license_path.write_text(license_text+'\n', encoding='utf-8')
        points = sorted(font.getBestCmap())
        groups = [points[i:i+512] for i in range(0,len(points),512)] if len(points)>5000 else [points]
        subsets=[]
        for number, group in enumerate(groups):
            face=copy.deepcopy(font)
            if len(groups)>1:
                options=subset.Options();options.layout_features=['*'];options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*']
                worker=subset.Subsetter(options=options);worker.populate(unicodes=group);worker.subset(face)
            face.flavor='woff2'
            path=output/(stem+f'-{number:03}.woff2');face.save(path)
            subsets.append(dict(path=path.name,unicodeRange=ranges(group),sha256=sha(path.read_bytes()),bytes=path.stat().st_size))
            face.close()
        specs.append(dict(family=family, weight=weight, weightRange=weight_range, style=style,
            source=item['source'],sourceSha256=item['sourceSha256'],collectionIndex=item['index'],axes=axes,
            licensePath=license_path.name,licenseSha256=sha(license_path.read_bytes()),subsets=subsets))
        font.close()
        print(f'prepared {family} {weight:g} {style}',flush=True)
    manifest=dict(prefix=f'assets/fonts/noto/material-legacy-{version}-woff2-v2',fonts=specs)
    (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    return manifest


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch',action='store_true')
    parser.add_argument('--write',action='store_true')
    parser.add_argument('--cache',type=Path)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args();entries=json.loads(LOCK.read_text())
    if args.fetch or args.write:
        if not args.cache: parser.error('--fetch/--write requires --cache')
        if args.fetch: fetch(args.cache,entries)
        if args.write:
            if not args.output: parser.error('--write requires --output')
            m=prepare(args.output,args.cache,entries)
            print(json.dumps({'prefix':m['prefix'],'faces':len(m['fonts'])}))
    else: print(json.dumps({'system':SYSTEM,'lockedSources':entries},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
