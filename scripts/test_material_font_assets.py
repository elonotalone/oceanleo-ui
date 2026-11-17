"""Focused binary delivery verification; consumes local prepared assets only."""
import hashlib
import json
import os
import unittest
from pathlib import Path
from fontTools.ttLib import TTFont

ROOT=Path(os.environ['OCEANLEO_MATERIAL_FONT_ASSETS'])
MANIFEST=json.loads((ROOT/'manifest.json').read_text())
CACHE=Path(os.environ['OCEANLEO_MATERIAL_FONT_CACHE'])
LOCK=json.loads(Path(__file__).with_name('material-font-sources.json').read_text())

class FontAssetsTests(unittest.TestCase):
    def test_every_published_display_family_has_delivery(self):
        required={'Space Grotesk','Playfair Display','ZCOOL QingKe HuangYou','JetBrains Mono','Smiley Sans','Bebas Neue','EB Garamond','Caveat','LXGW WenKai','Archivo','ZCOOL KuaiLe','Orbitron','Ma Shan Zheng','Noto Sans Mono CJK SC','DejaVu Sans','DejaVu Sans Mono'}
        self.assertEqual({f['family'] for f in MANIFEST['fonts']},required)
    def test_exact_font_and_licence_digests(self):
        for font in MANIFEST['fonts']:
            for spec in font['subsets']+[{'path':font['licensePath'],'sha256':font['licenseSha256']}]:
                with self.subTest(path=spec['path']):
                    self.assertEqual(hashlib.sha256((ROOT/spec['path']).read_bytes()).hexdigest(),spec['sha256'])
    def test_subsets_preserve_original_advances(self):
        for font in MANIFEST['fonts']:
            item=next((e for e in LOCK if e['sourceSha256']==font['sourceSha256']),None)
            source=CACHE/item['cachePath'] if item else Path(font['source'])
            original=TTFont(source,fontNumber=font['collectionIndex'])
            spec=font['subsets'][0];face=TTFont(ROOT/spec['path'])
            cmap=original.getBestCmap()
            for point,glyph in face.getBestCmap().items():
                with self.subTest(family=font['family'],point=point):
                    self.assertEqual(face['hmtx'][glyph][0],original['hmtx'][cmap[point]][0])
            original.close();face.close()
    def test_variable_axes_and_italic_faces_survive(self):
        for font in MANIFEST['fonts']:
            face=TTFont(ROOT/font['subsets'][0]['path'])
            if font['axes']:
                self.assertEqual({a.axisTag:[a.minValue,a.defaultValue,a.maxValue] for a in face['fvar'].axes},font['axes'])
            self.assertEqual(bool(face['OS/2'].fsSelection & 1),font['style']=='italic')
            face.close()
    def test_no_oversized_cjk_download(self):
        for font in MANIFEST['fonts']:
            for spec in font['subsets']:
                self.assertLess(spec['bytes'],1_000_000)

if __name__=='__main__': unittest.main()
