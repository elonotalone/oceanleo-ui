"""Independent downloaded-PDF check; run with the existing /tmp/be-venv Python."""
import sys
from pathlib import Path

from pypdf import PdfReader
import pypdfium2

filename, *expected = sys.argv[1:]
reader = PdfReader(filename)
annotations = [
    annotation.get_object()
    for page in reader.pages
    for annotation in page.get("/Annots", [])
    if annotation.get_object().get("/Subtype") == "/FreeText"
]
for text in expected:
    matches = [annotation for annotation in annotations if annotation.get("/Contents") == text]
    assert len(matches) == 1, f"Expected one exact FreeText: {text!r}; got {len(matches)}"
    appearance = matches[0]["/AP"]["/N"]
    encoded = text.encode("utf-16-be").hex().upper().encode("ascii")
    if any(ord(char) > 255 for char in text):
        assert encoded in appearance.get_data(), "Appearance does not contain the exact text"
        assert appearance["/Resources"]["/Font"]["/FCJK"]["/Subtype"] == "/Type0"
    print(f"PASS standard /FreeText, exact Contents and appearance: {text}")

document = pypdfium2.PdfDocument(filename)
output = Path(filename).with_name("independent.png")
document[0].render(scale=1.5).to_pil().save(output)
print(f"Independent PDFium rendering: {output}")
