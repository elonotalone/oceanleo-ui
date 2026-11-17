#!/usr/bin/env python3
"""Stage exact original fonts and licences; never touches a running renderer.

Parent copies the staged directory into both convert and sandbox images, runs
fc-cache while building, then checks every listed family with fc-match. This
script performs local file writes only with --write; default prints the list.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from xml.sax.saxutils import escape


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(noto_manifest, noto_cache, display_cache):
    noto = json.loads(noto_manifest.read_text())
    entries = []
    for font in noto['fonts']:
        source = noto_cache / Path(font['path']).name
        licence = noto_manifest.parent / font['licensePath']
        entries.append(dict(family=font['family'], source=str(source), sha256=font['sourceSha256'], license=str(licence), licenseSha256=font['licenseSha256']))
    lock = json.loads(Path(__file__).with_name('material-font-sources.json').read_text())
    for item in lock:
        if not item['cachePath'].endswith(('.ttf','.otf')): continue
        licence = next(e for e in lock if e['family']==item['family'] and e['cachePath'].endswith('OFL.txt'))
        entries.append(dict(family=item['family'],source=str(display_cache/item['cachePath']),sha256=item['sourceSha256'],license=str(display_cache/licence['cachePath']),licenseSha256=licence['sourceSha256']))
    # The November special cases already ship in Debian's Noto CJK/DejaVu packages.
    # Stage the exact system bytes too, so image versions cannot silently drift.
    for name in ['NotoSansCJK-Regular.ttc','NotoSansCJK-Bold.ttc']:
        source=Path('/usr/share/fonts/opentype/noto')/name
        entries.append(dict(family='Noto Sans Mono CJK SC',source=str(source),sha256=sha(source),license='/usr/share/doc/fonts-noto-cjk/copyright',licenseSha256=sha(Path('/usr/share/doc/fonts-noto-cjk/copyright'))))
    for name in ['DejaVuSans.ttf','DejaVuSans-Bold.ttf','DejaVuSansMono.ttf','DejaVuSansMono-Bold.ttf']:
        source=Path('/usr/share/fonts/truetype/dejavu')/name
        entries.append(dict(family='DejaVu Sans Mono' if 'Mono' in name else 'DejaVu Sans',source=str(source),sha256=sha(source),license='/usr/share/doc/fonts-dejavu-core/copyright',licenseSha256=sha(Path('/usr/share/doc/fonts-dejavu-core/copyright'))))
    return entries


def stage(entries, output):
    output.mkdir(parents=True, exist_ok=True)
    for entry in entries:
        source=Path(entry['source']);licence=Path(entry['license'])
        if sha(source)!=entry['sha256'] or sha(licence)!=entry['licenseSha256']: raise ValueError('server font input digest mismatch')
        dest=output/entry['family'].lower().replace(' ','-');dest.mkdir(exist_ok=True)
        shutil.copyfile(source,dest/source.name)
        shutil.copyfile(licence,dest/(source.name+'-LICENSE.txt'))
    aliases=[]
    for kind in ['Sans','Serif']:
        for region in ['SC','TC','JP','KR']:
            target=f'Noto {kind} {region}'
            for name in [f'Noto {kind} CJK {region}',f'Source Han {kind} {region}']:
                aliases.append(f'<alias binding="strong"><family>{escape(name)}</family><prefer><family>{target}</family></prefer></alias>')
    (output/'60-oceanleo-material-fonts.conf').write_text('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>'+''.join(aliases)+'</fontconfig>\n')
    (output/'server-inputs.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--noto-manifest',required=True,type=Path)
    parser.add_argument('--noto-cache',required=True,type=Path)
    parser.add_argument('--display-cache',required=True,type=Path)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--write',action='store_true')
    args=parser.parse_args();entries=inventory(args.noto_manifest,args.noto_cache,args.display_cache)
    if args.write:
        if not args.output: parser.error('--write requires --output')
        stage(entries,args.output)
    print(json.dumps({'files':len(entries),'families':sorted({e['family'] for e in entries})},ensure_ascii=False))

if __name__=='__main__': main()
