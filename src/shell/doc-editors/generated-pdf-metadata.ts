import { aigcLabelActive, aigcMetadata } from "../../contracts/aigc-label";

/** The DOCX conversion already carries the visible notice. Preserve all page streams/fonts. */
export async function labelGeneratedPdf(blob: Blob, generated: boolean): Promise<Blob> {
  if (!generated || !aigcLabelActive()) return blob;
  const { PDFDocument, PDFName, PDFHexString, PDFDict, PDFRawStream, decodePDFRawStream } = await import("pdf-lib");
  const pdf = await PDFDocument.load(await blob.arrayBuffer());
  const payload = aigcMetadata(`OL-${crypto.randomUUID()}`).AIGC;
  // Info and XMP both contain the same appendix-E JSON, not flattened substitute keys.
  pdf.context.lookup(pdf.context.trailerInfo.Info, PDFDict).set(PDFName.of("AIGC"), PDFHexString.fromText(payload));
  const xml = payload.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const description = `<rdf:Description rdf:about="" xmlns:AIGC="http://www.ai-gc.com/1.0/"><AIGC:AIGC>${xml}</AIGC:AIGC></rdf:Description>`;
  const previousObject = pdf.catalog.lookup(PDFName.of("Metadata"));
  const previous = previousObject instanceof PDFRawStream ? previousObject : undefined;
  const previousXml = previous ? new TextDecoder().decode(decodePDFRawStream(previous).decode()).replace(/<AIGC:AIGC\b[^>]*>[\s\S]*?<\/AIGC:AIGC>/g, "") : "";
  const xmp = previousXml.includes("</rdf:RDF>")
    ? previousXml.replace("</rdf:RDF>", description + "</rdf:RDF>")
    : `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${description}</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  pdf.catalog.set(PDFName.of("Metadata"), pdf.context.register(pdf.context.stream(new TextEncoder().encode(xmp), { Type: "Metadata", Subtype: "XML" })));
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
}
