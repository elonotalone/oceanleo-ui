import {readFile} from 'node:fs/promises';
import PptxGenJS from 'pptxgenjs';
import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';

export async function sampleBytes() {
 const pptx=new PptxGenJS(); pptx.layout='LAYOUT_WIDE';
 const s=pptx.addSlide(); s.addText('placeholder',{x:1,y:1,w:3,h:1});
 s.addImage({data:'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',x:1,y:1,w:1,h:1});
 const z=unzipSync(new Uint8Array(await (await pptx.write({outputType:'blob'})).arrayBuffer()));
 const rels=strFromU8(z['ppt/slides/_rels/slide1.xml.rels']);
 const imageRel=rels.match(/<Relationship\b[^>]*Type="[^"]*\/image"[^>]*\/>/)[0].match(/Id="([^"]+)"/)[1];
 let xml=await readFile(new URL('../fixtures/ppt-paragraph-defaults.xml',import.meta.url),'utf8');
 z['ppt/slides/slide1.xml']=strToU8(xml.replace('r:embed="rId2"',`r:embed="${imageRel}"`));
 z['ppt/presentation.xml']=strToU8(strFromU8(z['ppt/presentation.xml']).replace(/<p:sldSz[^>]*\/>/,'<p:sldSz cx="12191695" cy="6858000"/>'));
 return zipSync(z).buffer;
}
