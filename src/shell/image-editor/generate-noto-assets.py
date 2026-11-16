"""Offline WOFF2 subsets of the workflow's pinned OFL TTFs.
Run in an isolated fonttools==4.61.1/brotli==1.2.0 environment through run-heavy.
Binaries go to --out, never git. No credentials, network or database writes.
"""
import argparse, hashlib, json, re, time, unicodedata
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont


def sha(data):
    return hashlib.sha256(data).hexdigest()


def ranges(points):
    spans = []
    for n in sorted(points):
        if spans and n == spans[-1][1] + 1:
            spans[-1][1] = n
        else:
            spans.append([n, n])
    return ','.join('U+%X' % a + ('-%X' % b if b != a else '') for a, b in spans)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--workflow', type=Path, required=True)
    ap.add_argument('--font-dir', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--manifest', type=Path, required=True)
    args = ap.parse_args()
    upstream = json.loads((args.workflow / 'fonts-manifest.json').read_text())
    receipts = {f['family']: f for f in json.loads((args.font_dir / 'receipt.json').read_text())['fonts']}
    version = upstream['revision'][:12] + '-woff2-v2'
    manifest = {'revision': upstream['revision'], 'version': version,
                'prefix': 'assets/fonts/noto/' + version,
                'generator': 'fonttools 4.61.1; brotli 1.2.0; 512-codepoint CJK subsets; all layout features and names retained', 'fonts': []}
    args.out.mkdir(parents=True, exist_ok=True)
    for spec in upstream['fonts']:
        start = time.time()
        src = args.font_dir / Path(spec['path']).name
        source_sha = sha(src.read_bytes())
        assert source_sha == receipts[spec['family']]['sha256'], 'source receipt mismatch'
        font = TTFont(src, recalcTimestamp=False)
        codepoints = sorted(font.getBestCmap())
        axes = {a.axisTag: [a.minValue, a.defaultValue, a.maxValue] for a in font['fvar'].axes}
        name_version = next(n.toUnicode() for n in font['name'].names if n.nameID == 5)
        slug = spec['family'].lower().replace(' ', '-')
        # Preserve the complete license, including RFNs, both in names and alongside assets.
        license_bytes = (args.workflow / 'licenses' / (src.stem.split('[')[0] + '-OFL.txt')).read_bytes()
        assert b'SIL OPEN FONT LICENSE Version 1.1' in license_bytes
        license_path = slug + '/OFL.txt'
        (args.out / slug).mkdir(exist_ok=True)
        (args.out / license_path).write_bytes(license_bytes)
        cjk = bool(re.search(r' (SC|TC|JP|KR)$', spec['family']))
        split = cjk or spec['family'] in ('Noto Sans', 'Noto Serif')
        marks = {c for c in codepoints if unicodedata.combining(chr(c))}
        chunks = [sorted(set(codepoints[i:i+512]) | marks) for i in range(0, len(codepoints), 512)] if split else [codepoints]
        item = {**spec, 'sourceSha256': source_sha, 'fontVersion': name_version,
                'axes': axes, 'licenseCode': 'OFL-1.1', 'licensePath': license_path,
                'licenseSha256': sha(license_bytes), 'subsets': []}
        for i, points in enumerate(chunks):
            path = slug + '/%03d.woff2' % i
            target = args.out / path
            reusable = False
            if target.exists():
                cmap = set(TTFont(target).getBestCmap())
                reusable = set(points) <= cmap <= set(codepoints) and len(cmap - set(points)) < 16
            if not reusable:
                f = TTFont(src, recalcTimestamp=False)
                opts = subset.Options()
                opts.flavor = 'woff2'
                opts.layout_features = ['*']
                opts.name_IDs = ['*']
                opts.name_languages = ['*']
                opts.name_legacy = True
                s = subset.Subsetter(options=opts)
                s.populate(unicodes=points)
                s.subset(f)
                f.flavor = 'woff2'
                f.save(target)
            check = TTFont(target, recalcTimestamp=False)
            if check['head'].modified != font['head'].modified:
                check['head'].modified = font['head'].modified
                check.save(target)
            data = target.read_bytes()
            check = TTFont(target, recalcTimestamp=False)
            assert set(points) <= set(check.getBestCmap()) <= set(codepoints), 'subset coverage changed'
            assert {a.axisTag: [a.minValue,a.defaultValue,a.maxValue] for a in check['fvar'].axes} == axes
            assert next(n.toUnicode() for n in check['name'].names if n.nameID == 5) == name_version
            assert check['head'].fontRevision == font['head'].fontRevision
            # hmtx advances must survive subsetting. WOFF2 glyf transform is lossless.
            source_cmap, dest_cmap = font.getBestCmap(), check.getBestCmap()
            assert all(font['hmtx'][source_cmap[c]] == check['hmtx'][dest_cmap[c]] for c in points)
            if i % 12 == 0: print('%s %d/%d' % (spec['family'], i+1, len(chunks)), flush=True)
            item['subsets'].append({'path': path, 'unicodeRange': ranges(check.getBestCmap()), 'sha256': sha(data), 'bytes': len(data)})
        manifest['fonts'].append(item)
        print('%s: %d subsets, %d bytes, %.1fs' % (spec['family'],len(chunks),sum(s['bytes'] for s in item['subsets']),time.time()-start), flush=True)
    args.manifest.write_text('// Generated by generate-noto-assets.py; binaries are hosted outside git.\nexport const EDITOR_FONT_MANIFEST = ' + json.dumps(manifest, ensure_ascii=False, indent=2) + ';\n')
    (args.out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print('all families verified', flush=True)

if __name__ == '__main__':
    main()
