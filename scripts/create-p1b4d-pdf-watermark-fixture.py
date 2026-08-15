import sys
from pathlib import Path

from reportlab.lib.pagesizes import A4, landscape, letter
from reportlab.pdfgen import canvas


target = Path(sys.argv[1])
target.parent.mkdir(parents=True, exist_ok=True)

document = canvas.Canvas(str(target), pagesize=A4, pageCompression=1)
document.setTitle("P1-B4D Watermark Evidence")
document.setAuthor("LongEdit Audit")
document.setSubject("Source preservation and watermark rendering")

document.bookmarkPage("portrait-page")
document.addOutlineEntry("Portrait evidence", "portrait-page", level=0)
document.setFont("Helvetica-Bold", 22)
document.drawString(72, 760, "P1-B4D SOURCE - PORTRAIT")
document.setFont("Helvetica", 12)
document.drawString(72, 724, "Original text, page geometry, metadata and link must remain readable.")
document.drawString(72, 700, "The watermark is visible attribution, not DRM or redaction.")
document.setFillColorRGB(0.08, 0.35, 0.72)
document.drawString(72, 660, "https://example.com/longedit-watermark-audit")
document.linkURL("https://example.com/longedit-watermark-audit", (72, 655, 350, 674), relative=0)
document.setFillColorRGB(0.18, 0.18, 0.18)
document.rect(72, 520, 210, 90, stroke=1, fill=0)
document.drawString(88, 570, "STRUCTURE PRESERVATION BOX")
document.showPage()

document.setPageSize(landscape(letter))
document.bookmarkPage("landscape-page")
document.addOutlineEntry("Landscape evidence", "landscape-page", level=0)
document.setFont("Helvetica-Bold", 22)
document.drawString(72, 540, "P1-B4D SOURCE - LANDSCAPE")
document.setFont("Helvetica", 12)
document.drawString(72, 504, "A second page with a different aspect ratio verifies automatic sizing.")
document.setStrokeColorRGB(0.75, 0.28, 0.12)
document.line(72, 450, 700, 450)
document.circle(170, 330, 58, stroke=1, fill=0)
document.drawString(118, 328, "PUBLIC CONTENT")
document.save()

print(f"P1-B4D fixture created: {target}")
