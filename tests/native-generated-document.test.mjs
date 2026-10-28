import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { normalizeArtifactProjection } from '../src/shell/artifact-contract.ts';
import { PDFDocument, PDFDict, PDFName, PDFRawStream, PDFHexString } from 'pdf-lib';
import { labelGeneratedPdf } from '../src/shell/doc-editors/generated-pdf-metadata.ts';
import { richDocIsGenerated, richDocLabeledText, richDocLabeledHtml } from '../src/shell/doc-editors/rich-doc-provenance.ts';
import { createRichDocDeliveryFile, loadRichDocSource } from '../src/shell/doc-editors/rich-doc-model.ts';

const dir = process.env.NATIVE_EXPORT_EVIDENCE_DIR;
const item = (kind) => ({ id: 'native-example', title: '中文文档', kind: 'document', source: 'artifact', meta: {}, artifact: { renditions: {}, provenance: { sourceKind: kind } } });
const json = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '中文文档：生成内容与人工文档分别处理。' }] }] };

test('only authoritative generated provenance grants labeling; imports cannot self-declare', () => {
  assert.equal(richDocIsGenerated(item('generated')), true);
  for (const origin of ['owned', 'user_upload', 'derivative', undefined]) assert.equal(richDocIsGenerated(item(origin)), false);
  assert.equal(richDocIsGenerated({ artifact: { provenance: { sourceKind: 'generated', generatedOrigin: false } } }), false);
  assert.equal(richDocIsGenerated({ meta: { generated: true }, content: 'AI生成' }), false);
  assert.equal(richDocIsGenerated({ ...item('derivative'), artifact: { provenance: { sourceKind: 'derivative', generatedOrigin: true } } }), true);
  assert.equal(richDocIsGenerated({ ...item('derivative'), artifact: { provenance: { sourceKind: 'derivative', generatedOrigin: 'true' } } }), false);
});

test('normalizer accepts only actual booleans from projected generation ancestry', () => {
  for (const key of ['generatedOrigin', 'generated_origin']) {
    for (const value of [true, false, undefined, 'true', 1]) {
      const raw = {
        schema: 'oceanleo.artifact.v1', artifactId: 'a1', revisionId: 'r2', artifactType: 'document',
        owner: { principalId: 'owner', visibility: 'private' }, access: Object.fromEntries(['read', 'preview', 'edit', 'fork', 'insert', 'replace', 'favorite', 'bind', 'export_source'].map(key => [key, true])),
        provenance: { id: 'p1', sourceKind: 'derivative', licenseCode: 'owned', [key]: value },
      };
      const projection = normalizeArtifactProjection(raw);
      assert.ok(projection);
      assert.equal(projection.provenance.generatedOrigin, typeof value === 'boolean' ? value : undefined);
      assert.equal(richDocIsGenerated({ artifact: projection }), value === true);
    }
  }
});

test('generated native files have read-back labels; manual documents remain unlabelled', async () => {
  process.env.NEXT_PUBLIC_OCEANLEO_AIGC_LABEL = '1';
  if (dir) await mkdir(dir, { recursive: true });
  const receipt = {};
  for (const name of ['generated', 'generated-derivative', 'manual']) {
    const generated = name !== 'manual';
    const source = item(name === 'generated' ? 'generated' : name === 'manual' ? 'owned' : 'derivative');
    if (name === 'generated-derivative') source.artifact.provenance.generatedOrigin = true;
    const file = await createRichDocDeliveryFile({ item: source, title: '中文文档', html: '<p>正文</p>', json });
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const body = await zip.file('word/document.xml').async('string');
    const custom = await zip.file('docProps/custom.xml')?.async('string') || '';
    assert.equal(body.includes('本内容由人工智能生成，仅供参考'), generated);
    assert.equal(custom.includes('name="AIGC"'), generated);
    assert.ok(body.includes('中文文档'));
    const txt = richDocLabeledText('中文正文', generated);
    const html = richDocLabeledHtml('<p>中文正文</p>', generated);
    assert.equal(txt.includes('本内容由人工智能生成'), generated);
    assert.equal(html.includes('本内容由人工智能生成'), generated);
    assert.equal(richDocLabeledHtml(html, generated), html);
    assert.equal(richDocLabeledText(txt, generated), txt);
    if (dir) {
      await writeFile(`${dir}/${name}.docx`, Buffer.from(await file.arrayBuffer()));
      await writeFile(`${dir}/${name}-document.xml`, body);
      await writeFile(`${dir}/${name}-custom.xml`, custom || '<absent/>');
      await writeFile(`${dir}/${name}.txt`, txt);
      await writeFile(`${dir}/${name}.html`, html);
    }
    receipt[name] = { visibleNotice: generated, appendixEProperty: generated, chineseTextPreserved: true };
  }
  if (dir) await writeFile(`${dir}/docx-readback.json`, JSON.stringify(receipt, null, 2));
});

test('project downgrade survives reload and never upgrades manually authored origin', async () => {
  const target = item('generated'); target.meta.editor_project_url = 'https://example.invalid/project.json';
  const loaded = await loadRichDocSource(target, undefined, { loadProject: async () => ({ ...json, generatedOrigin: false }) });
  assert.equal(loaded.generatedOrigin, false);
  assert.equal(richDocIsGenerated(item('owned')), false);
});

test('PDF contains one appendix-E XMP payload with no Info duplicate; page bytes remain unchanged', async () => {
  process.env.NEXT_PUBLIC_OCEANLEO_AIGC_LABEL = '1';
  const seed = await PDFDocument.create();
  const page = seed.addPage([595, 842]);
  seed.context.lookup(seed.context.trailerInfo.Info, PDFDict).set(PDFName.of('AIGC'), PDFHexString.fromText('{"old":true}'));
  page.drawText('PDF metadata preservation fixture');
  seed.catalog.set(PDFName.of('Metadata'), seed.context.register(seed.context.stream(new TextEncoder().encode('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description preserved="yes" xmlns:old="urn:old" old:AIGC="stale"><old:AIGC>stale</old:AIGC></rdf:Description></rdf:RDF></x:xmpmeta>'), { Type: 'Metadata', Subtype: 'XML' })));
  const original = new Blob([await seed.save()], { type: 'application/pdf' });
  assert.equal(await labelGeneratedPdf(original, false), original);
  process.env.NEXT_PUBLIC_OCEANLEO_AIGC_LABEL = '0';
  assert.equal(await labelGeneratedPdf(original, true), original);
  process.env.NEXT_PUBLIC_OCEANLEO_AIGC_LABEL = '1';
  const output = await labelGeneratedPdf(original, true);
  const pdf = await PDFDocument.load(await output.arrayBuffer());
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info, PDFDict);
  assert.equal(info.has(PDFName.of('AIGC')), false);
  const metadata = pdf.catalog.lookup(PDFName.of('Metadata'), PDFRawStream);
  const xmp = new TextDecoder().decode(metadata.getContents());
  const matches = [...xmp.matchAll(/<AIGC:AIGC>([\s\S]*?)<\/AIGC:AIGC>/g)];
  assert.equal(matches.length, 1);
  const payload = matches[0][1];
  const parsed = JSON.parse(payload).AIGC;
  assert.equal(parsed.Label, '1');
  assert.equal(parsed.ContentProducer, '91440300MAKE54BD0T');
  assert.match(parsed.ProduceID, /^OL-[a-f0-9-]+$/);
  assert.ok(xmp.includes(payload));
  assert.ok(xmp.includes('preserved="yes"'));
  assert.ok(!xmp.includes('old:AIGC'));
  const before = await PDFDocument.load(await original.arrayBuffer());
  const stream = (doc) => doc.getPages()[0].node.Contents().asArray().map(ref => Buffer.from(doc.context.lookup(ref, PDFRawStream).getContents()).toString('base64'));
  assert.deepEqual(stream(pdf), stream(before));
  if (dir) {
    await writeFile(`${dir}/metadata-fixture.pdf`, Buffer.from(await output.arrayBuffer()));
    await writeFile(`${dir}/pdf-info-readback.json`, payload);
    await writeFile(`${dir}/pdf-xmp-readback.xml`, xmp);
  }
  delete process.env.NEXT_PUBLIC_OCEANLEO_AIGC_LABEL;
});
