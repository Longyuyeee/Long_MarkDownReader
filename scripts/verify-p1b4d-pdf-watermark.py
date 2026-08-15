import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops
from pypdf import PdfReader


source_path = Path(sys.argv[1])
target_path = Path(sys.argv[2])
source_render = Path(sys.argv[3])
target_render = Path(sys.argv[4])
target_page_two_render = Path(sys.argv[5])
output_path = Path(sys.argv[6])
watermark_text = "项目机密 P1B4D"

source = PdfReader(str(source_path))
target = PdfReader(str(target_path))
source_text = [page.extract_text() or "" for page in source.pages]
target_text = [page.extract_text() or "" for page in target.pages]
source_annotations = [len(page.get("/Annots", [])) for page in source.pages]
target_annotations = [len(page.get("/Annots", [])) for page in target.pages]

def geometry(page):
    media = tuple(float(value) for value in page.mediabox)
    crop = tuple(float(value) for value in page.cropbox)
    return {"media": media, "crop": crop, "rotate": int(page.get("/Rotate", 0))}

source_image = Image.open(source_render).convert("RGB")
target_image = Image.open(target_render).convert("RGB")
page_two_image = Image.open(target_page_two_render).convert("RGB")
delta = ImageChops.difference(source_image, target_image)
threshold = delta.convert("L").point(lambda value: 255 if value > 12 else 0)
bounds = threshold.getbbox()
changed_pixels = sum(1 for value in threshold.get_flattened_data() if value)
width, height = target_image.size
interior_bounds = bool(bounds and bounds[0] > 2 and bounds[1] > 2 and bounds[2] < width - 2 and bounds[3] < height - 2)

source_metadata = source.metadata or {}
target_metadata = target.metadata or {}
metadata_keys = ["/Title", "/Author", "/Subject"]
metadata_preserved = all(source_metadata.get(key) == target_metadata.get(key) for key in metadata_keys)
checks = {
    "pageCountPreserved": len(source.pages) == len(target.pages) == 2,
    "watermarkExtractedEveryPage": all(watermark_text in text for text in target_text),
    "originalTextPreservedEveryPage": all(source_text[index].strip() in target_text[index] for index in range(len(source_text))),
    "pageGeometryPreserved": all(geometry(source.pages[index]) == geometry(target.pages[index]) for index in range(len(source.pages))),
    "annotationsPreserved": source_annotations == target_annotations,
    "metadataPreserved": metadata_preserved,
    "visibleWatermarkDifference": changed_pixels >= 800,
    "watermarkNotClipped": interior_bounds,
    "landscapePageRendered": page_two_image.width > page_two_image.height and min(page_two_image.size) > 700,
    "fullRewriteTrailerHasNoPrev": "/Prev" not in target.trailer,
}
passed = all(checks.values())
evidence = {
    "schemaVersion": 1,
    "stage": "P1-B4D",
    "engine": "pypdf + Poppler + Pillow",
    "sourcePages": len(source.pages),
    "targetPages": len(target.pages),
    "watermarkText": watermark_text,
    "targetPageText": target_text,
    "sourceAnnotations": source_annotations,
    "targetAnnotations": target_annotations,
    "targetRender": {"width": width, "height": height, "changedPixels": changed_pixels, "differenceBounds": bounds},
    "sourceRenderSha256": hashlib.sha256(source_render.read_bytes()).hexdigest(),
    "targetRenderSha256": hashlib.sha256(target_render.read_bytes()).hexdigest(),
    "targetPageTwoRenderSha256": hashlib.sha256(target_page_two_render.read_bytes()).hexdigest(),
    "checks": checks,
    "sourceUserContentIncluded": False,
    "passed": passed,
}
output_path.write_bytes((json.dumps(evidence, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
if not passed:
    raise SystemExit(f"P1-B4D independent verification failed: {checks}")
print("P1-B4D independent PDF watermark verification passed.")
