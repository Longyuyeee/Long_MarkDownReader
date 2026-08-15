import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops
from pypdf import PdfReader


source_path = Path(sys.argv[1])
target_path = Path(sys.argv[2])
source_renders = [Path(sys.argv[3]), Path(sys.argv[4])]
target_renders = [Path(sys.argv[5]), Path(sys.argv[6])]
output_path = Path(sys.argv[7])

source = PdfReader(str(source_path))
target = PdfReader(str(target_path))
requested = {
    "/Title": "知识图谱专业管理 P1B5D",
    "/Author": "LongEdit 证据审计",
    "/Keywords": "知识管理, PDF, 元数据, P1B5D",
}
source_metadata = source.metadata or {}
target_metadata = target.metadata or {}
preserved_keys = ["/Creator", "/Producer", "/CreationDate", "/ModDate", "/Trapped"]

def geometry(page):
    return {
        "media": tuple(float(value) for value in page.mediabox),
        "crop": tuple(float(value) for value in page.cropbox),
        "rotate": int(page.get("/Rotate", 0)),
    }

render_checks = []
render_sha256 = []
for source_render, target_render in zip(source_renders, target_renders):
    source_image = Image.open(source_render).convert("RGB")
    target_image = Image.open(target_render).convert("RGB")
    difference = ImageChops.difference(source_image, target_image)
    render_checks.append(source_image.size == target_image.size and difference.getbbox() is None)
    render_sha256.append({
        "source": hashlib.sha256(source_render.read_bytes()).hexdigest(),
        "target": hashlib.sha256(target_render.read_bytes()).hexdigest(),
        "size": source_image.size,
    })

source_text = [page.extract_text() or "" for page in source.pages]
target_text = [page.extract_text() or "" for page in target.pages]
source_annotations = [len(page.get("/Annots", [])) for page in source.pages]
target_annotations = [len(page.get("/Annots", [])) for page in target.pages]
checks = {
    "pageCountPreserved": len(source.pages) == len(target.pages) == 2,
    "requestedMetadataMatches": all(target_metadata.get(key) == value for key, value in requested.items()),
    "subjectRemoved": target_metadata.get("/Subject") is None,
    "preservedInfoMatches": all(source_metadata.get(key) == target_metadata.get(key) for key in preserved_keys),
    "originalTextPreserved": source_text == target_text,
    "pageGeometryPreserved": all(geometry(source.pages[index]) == geometry(target.pages[index]) for index in range(len(source.pages))),
    "annotationsPreserved": source_annotations == target_annotations,
    "popplerPixelsIdentical": all(render_checks),
    "fullRewriteTrailerHasNoPrev": "/Prev" not in target.trailer,
}
passed = all(checks.values())
evidence = {
    "schemaVersion": 1,
    "stage": "P1-B5D",
    "engine": "pypdf + Poppler + Pillow",
    "sourcePages": len(source.pages),
    "targetPages": len(target.pages),
    "requested": requested,
    "sourcePreservedMetadata": {key: source_metadata.get(key) for key in preserved_keys},
    "targetPreservedMetadata": {key: target_metadata.get(key) for key in preserved_keys},
    "sourceAnnotations": source_annotations,
    "targetAnnotations": target_annotations,
    "renderSha256": render_sha256,
    "checks": checks,
    "sourceUserContentIncluded": False,
    "passed": passed,
}
output_path.write_bytes((json.dumps(evidence, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
if not passed:
    raise SystemExit(f"P1-B5D independent metadata verification failed: {checks}")
print("P1-B5D independent PDF metadata verification passed.")
