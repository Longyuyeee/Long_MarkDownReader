"""Synthetic mixed-page regression corpus. Never overwrites an existing PDF."""
import argparse
import io
import hashlib
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

parser = argparse.ArgumentParser()
parser.add_argument('--output', default='scripts/fixtures/mobile-pdf-orientation.pdf')
args = parser.parse_args()
out = Path(args.output)
if out.exists():
    raise FileExistsError(f'Refusing to replace {out}')
out.parent.mkdir(parents=True, exist_ok=True)
stream = io.BytesIO()
c = canvas.Canvas(stream, invariant=1, pageCompression=1)

def heading(width, height, title, subtitle, page):
    c.setPageSize((width, height))
    c.setFillColor(HexColor('#263a30'))
    c.setFont('Helvetica', 10)
    c.drawString(28, height-32, 'LONGEDIT / MIXED PAGE READING')
    c.setFont('Helvetica-Bold', 22)
    c.drawString(28, height-74, title)
    c.setFont('Helvetica', 12)
    c.drawString(28, height-100, subtitle)
    c.setStrokeColor(HexColor('#d8dfd4'))
    c.line(28, height-116, width-28, height-116)
    c.setFont('Helvetica', 10)
    c.drawRightString(width-28, 20, str(page)+' / 6')

heading(420, 660, 'Keep the same idea', 'Portrait notes beside landscape diagrams.', 1)
for i, line in enumerate(['Read the paper in its original layout.', 'Turn the view when a chart is sideways.', 'Return to the same part after rotating.', 'The source file remains unchanged.']):
    c.setFont('Helvetica', 14)
    c.drawString(28, 490-i*32, line)
c.bookmarkPage('start'); c.addOutlineEntry('Start reading', 'start', level=0)
c.showPage()
heading(840, 520, 'A wider view', 'Landscape table and vector chart - source remains original.', 2)
for i in range(9):
    y=340-i*27
    c.setFillColor(HexColor('#e8eee3' if i%2==0 else '#fcfcf8'))
    c.rect(28,y,360,26,fill=1,stroke=0)
    c.setFillColor(HexColor('#263a30'));c.setFont('Helvetica',11)
    c.drawString(38,y+8,'Reading step '+str(i+1));c.drawString(255,y+8,str((i+1)*12)+' minutes')
for i in range(30):
    c.setStrokeColor(HexColor('#347459'));c.line(430+i*12,96,430+i*12,120+(i%7)*26)
c.setFont('Helvetica-Bold',13);c.drawString(430,340,'Look for the pattern')
c.bookmarkPage('wide');c.addOutlineEntry('Landscape diagram','wide',level=0)
c.showPage()
heading(420,660,'Turn to keep reading','This physical page has an embedded 90-degree rotation.',3)
c.setFont('Helvetica',16)
for i,line in enumerate(['SIDEWAYS TARGET', 'Select this line after turning.', 'Keep highlights on the source text.']):c.drawString(28,460-i*40,line)
c.bookmarkPage('sideways');c.addOutlineEntry('Sideways source','sideways',level=0)
c.showPage()
heading(240,200,'A small page','Small source, full original width.',4)
c.setFont('Helvetica',12);c.drawString(28,48,'SMALL PAGE TARGET');c.showPage()
heading(600,800,'Cropped page','Nonzero crop origin with embedded 270-degree rotation.',5)
c.setFont('Helvetica',16);c.drawString(110,510,'CROP TARGET');c.drawString(110,470,'Text stays inside the crop.');c.showPage()
heading(2400,1600,'Inspect the details','Large vector drawing and a 2048 x 1024 embedded test image.',6)
image=Image.new('RGB',(2048,1024),'#fcfcf8');d=ImageDraw.Draw(image)
for y in range(0,1024,32):
    for x in range(0,2048,32):d.rectangle((x,y,x+30,y+30),fill=('#347459' if (x//32+y//32)%2 else '#e8eee3'))
c.drawImage(ImageReader(image),100,200,width=1600,height=800)
for i in range(800):
    c.setStrokeColor(HexColor('#263a30' if i%2 else '#347459'))
    c.circle(1950+(i%20)*12,220+(i//20)*24,4,fill=0,stroke=1)
c.setFillColor(HexColor('#263a30'));c.setFont('Helvetica-Bold',36);c.drawString(100,1120,'LARGE IMAGE TARGET')
c.showPage();c.save()
writer=PdfWriter();reader=PdfReader(io.BytesIO(stream.getvalue()))
for i,page in enumerate(reader.pages):
    if i==2:page.rotate(90)
    if i==4:
        page.cropbox=RectangleObject([80,100,540,680]);page.rotate(270)
    writer.add_page(page)
for title,n in [('Start reading',0),('Landscape diagram',1),('Sideways source',2),('Small page',3),('Cropped source',4),('Large image',5)]:writer.add_outline_item(title,n)
writer.add_metadata({'/Title':'LongEdit synthetic mixed page fixture','/Author':'LongEdit regression tests'})
with out.open('wb') as f:writer.write(f)
manifest={'synthetic':True,'pages':len(writer.pages),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'source':'scripts/create-mobile-pdf-orientation-fixture.py','pageRotations':[0,0,90,0,270,0],'purpose':'Mixed geometry, crop origins, embedded rotations, vectors and raster image; no third-party document content.'}
out.with_suffix('.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps(manifest))
