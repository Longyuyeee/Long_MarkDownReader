import hashlib
import json
import sys
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


source_path = Path(sys.argv[1])
target_path = Path(sys.argv[2])
source_render = Path(sys.argv[3])
target_render = Path(sys.argv[4])
output_path = Path(sys.argv[5])
secret = "SECRET-P1B3D-ALPHA-9284"

source = PdfReader(str(source_path))
target = PdfReader(str(target_path))
source_text = "\n".join(page.extract_text() or "" for page in source.pages)
target_text = "\n".join(page.extract_text() or "" for page in target.pages)
target_root = target.trailer["/Root"]
target_annotations = sum(len(page.get("/Annots", [])) for page in target.pages)
target_metadata = target.metadata or {}

image = Image.open(target_render).convert("RGB")
width, height = image.size
x0, x1 = int(width * 0.08), int(width * 0.89)
y0, y1 = int(height * 0.22), int(height * 0.31)
redaction_pixels = list(image.crop((x0, y0, x1, y1)).getdata())
black_pixels = sum(1 for red, green, blue in redaction_pixels if red <= 8 and green <= 8 and blue <= 8)
black_ratio = black_pixels / max(1, len(redaction_pixels))

public_crop = image.crop((int(width * 0.08), int(height * 0.12), int(width * 0.82), int(height * 0.22)))
public_pixels = list(public_crop.getdata())
public_dark_pixels = sum(1 for red, green, blue in public_pixels if red < 160 and green < 160 and blue < 160)

target_bytes = target_path.read_bytes()
checks = {
    "sourceHasSecretText": secret in source_text,
    "targetTextEmpty": not target_text.strip(),
    "targetSecretBytesAbsent": secret.encode("ascii") not in target_bytes,
    "pageCountPreserved": len(source.pages) == len(target.pages) == 2,
    "annotationsRemoved": target_annotations == 0,
    "acroFormRemoved": "/AcroForm" not in target_root,
    "outlinesRemoved": "/Outlines" not in target_root,
    "metadataAllowlist": set(target_metadata.keys()).issubset({"/Producer"}),
    "redactionOpaqueBlack": black_ratio >= 0.985,
    "publicRegionReadable": public_dark_pixels >= 50,
}
passed = all(checks.values())
evidence = {
    "schemaVersion": 1,
    "stage": "P1-B3D",
    "engine": "pypdf + Poppler + Pillow",
    "sourcePages": len(source.pages),
    "targetPages": len(target.pages),
    "sourceTextLength": len(source_text),
    "targetTextLength": len(target_text.strip()),
    "targetAnnotations": target_annotations,
    "targetMetadataKeys": sorted(target_metadata.keys()),
    "targetRender": {"width": width, "height": height, "blackRatio": black_ratio, "publicDarkPixels": public_dark_pixels},
    "sourceRenderSha256": hashlib.sha256(source_render.read_bytes()).hexdigest(),
    "targetRenderSha256": hashlib.sha256(target_render.read_bytes()).hexdigest(),
    "checks": checks,
    "sourceUserContentIncluded": False,
    "passed": passed,
}
output_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if not passed:
    raise SystemExit(f"P1-B3D independent verification failed: {checks}")
print("P1-B3D independent PDF verification passed.")
