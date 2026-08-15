import sys
from pathlib import Path

from reportlab.lib.pagesizes import A4, landscape, letter
from reportlab.pdfgen import canvas


target = Path(sys.argv[1])
target.parent.mkdir(parents=True, exist_ok=True)

document = canvas.Canvas(str(target), pagesize=A4, pageCompression=1)
document.setTitle("Legacy Knowledge Base")
document.setAuthor("LongEdit Fixture Author")
document.setSubject("REMOVE THIS SUBJECT")
document.setKeywords("legacy,metadata")
document.setCreator("LongEdit Metadata Fixture")

document.bookmarkPage("portrait-page")
document.addOutlineEntry("Metadata evidence", "portrait-page", level=0)
document.setFont("Helvetica-Bold", 22)
document.drawString(72, 760, "P1-B5D SOURCE - PORTRAIT")
document.setFont("Helvetica", 12)
document.drawString(72, 724, "Page pixels and document structure must remain unchanged.")
document.drawString(72, 700, "Only four descriptive Info fields may be edited in a new copy.")
document.setFillColorRGB(0.08, 0.35, 0.72)
document.drawString(72, 660, "https://example.com/longedit-metadata-audit")
document.linkURL("https://example.com/longedit-metadata-audit", (72, 655, 350, 674), relative=0)
document.setFillColorRGB(0.18, 0.18, 0.18)
document.rect(72, 520, 250, 90, stroke=1, fill=0)
document.drawString(88, 570, "PRESERVE CONTENT AND LINK")
document.showPage()

document.setPageSize(landscape(letter))
document.bookmarkPage("landscape-page")
document.addOutlineEntry("Landscape evidence", "landscape-page", level=0)
document.setFont("Helvetica-Bold", 22)
document.drawString(72, 540, "P1-B5D SOURCE - LANDSCAPE")
document.setFont("Helvetica", 12)
document.drawString(72, 504, "A second aspect ratio verifies page geometry preservation.")
document.setStrokeColorRGB(0.75, 0.28, 0.12)
document.line(72, 450, 700, 450)
document.circle(170, 330, 58, stroke=1, fill=0)
document.drawString(118, 328, "PUBLIC CONTENT")
document.save()

print(f"P1-B5D fixture created: {target}")
