"""Generate only named, synthetic attachment test files in OUTPUT_DIRECTORY."""
from pathlib import Path
import json
import sys
from PIL import Image, ImageDraw

if len(sys.argv) != 2:
    raise SystemExit('Usage: python create-mobile-attachment-fixture.py OUTPUT_DIRECTORY')
root = Path(sys.argv[1]).resolve()
library, picker = root / 'library', root / 'picker'
for folder in [library / 'blocked', library / 'positives', picker]:
    folder.mkdir(parents=True, exist_ok=True)
image = Image.new('RGB', (320, 200), '#e9f0e5')
draw = ImageDraw.Draw(image)
draw.rectangle((30, 30, 145, 165), fill='#37765a')
draw.rectangle((175, 70, 290, 165), fill='#e7ad45')
draw.text((178, 35), 'LongEdit test', fill='#263a30')
for name, fmt in [('diagram.png', 'PNG'), ('photo.jpg', 'JPEG'), ('sample.webp', 'WEBP')]:
    image.save(picker / name, fmt)
    image.save(library / 'positives' / name, fmt)
(picker / 'invalid.png').write_bytes(b'not-an-image')
(picker / 'too-large.png').write_bytes((picker / 'diagram.png').read_bytes() + b'\0' * (2 * 1024 * 1024))
Image.new('RGB', (5000, 2000), '#37765a').save(picker / 'too-many-pixels.png', 'PNG')
(library / 'Attachment-Note.md').write_text('# 附件操作验收\n\nNativeOriginalBody\n\n![丢失图片](missing.png)\n', encoding='utf-8')
(library / 'Formats.md').write_text('# 三种图片格式\n\n![PNG 正向样本](positives/diagram.png)\n\n![JPEG 正向样本](positives/photo.jpg)\n\n![WebP 正向样本](positives/sample.webp)\n', encoding='utf-8')
(library / 'blocked' / 'Conflict-Note.md').write_text('# 导入失败与重试\n\nConflictOriginalBody\n', encoding='utf-8')
(library / 'blocked' / 'attachments').write_text('A dedicated test blocker; rename this file to retry.\n', encoding='utf-8')
print(json.dumps({'library': str(library), 'picker': str(picker), 'positiveFormats': ['PNG', 'JPEG', 'WebP'], 'invalidSamples': ['invalid.png', 'too-large.png', 'too-many-pixels.png']}, indent=2))
