"""Reproduce the three-page synthetic PDF; requires ReportLab and a CJK TTF/TTC.

Default output is a new intermediate file. The checked-in fixture is not changed.
"""
import argparse
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

parser = argparse.ArgumentParser()
parser.add_argument('--output', default='tmp/pdfs/reading-guide.pdf')
parser.add_argument('--cjk-font', default='C:/Windows/Fonts/simsun.ttc')
args = parser.parse_args()
out = Path(args.output)
if out.exists():
    raise FileExistsError(f'Refusing to replace {out}; choose a new output path')
out.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('MobileCJK', args.cjk_font, subfontIndex=0))
c = canvas.Canvas(str(out), pagesize=(420,660), invariant=1)
c.setTitle('LongEdit Reading Guide')
c.setAuthor('LongEdit synthetic test fixture')

def base(title, sub, num):
    c.setFillColor(HexColor('#263a30')); c.setFont('Times-Roman',9)
    c.drawString(32,628,'LONGEDIT  /  READING GUIDE')
    c.setFont('Times-Bold',30); c.drawString(32,565,title)
    c.setFont('Times-Roman',14); c.drawString(32,533,sub)
    c.setStrokeColor(HexColor('#9eaaa2')); c.line(32,509,388,509)
    c.setFont('Times-Roman',9); c.drawRightString(388,20,f'{num} / 3')

def lines(x,y,items,size=14):
    c.setFillColor(HexColor('#263a30')); c.setFont('Times-Roman',size)
    for line in items:
        c.drawString(x,y,line); y -= 20

base('Make room for ideas','A quiet place to read, think and return.',1)
c.setFont('Times-Bold',21); c.setFillColor(HexColor('#34755e')); c.drawString(32,465,'01')
c.setFillColor(HexColor('#263a30')); c.drawString(76,465,'Keep your place')
lines(76,432,['Pick up where you left off, anytime.','Your reading position is saved automatically,','so you can easily continue later.'],13)
for x,label,desc in [(65,'Read',['A clean, focused','reading experience.']),(205,'Find',['Locate content','with a keyword.']),(345,'Return',['Come back right','where you were.'])]:
    c.setStrokeColor(HexColor('#34755e')); c.setLineWidth(1.2)
    c.roundRect(x-18,282,36,42,3,stroke=1,fill=0)
    c.line(x-11,311,x+11,311); c.line(x-11,303,x+7,303)
    c.setFillColor(HexColor('#263a30')); c.setFont('Times-Roman',18); c.drawCentredString(x,255,label)
    c.setFont('Times-Roman',11)
    for i,s in enumerate(desc):
        c.drawCentredString(x,233-i*15,s)
c.setStrokeColor(HexColor('#9eaaa2')); c.line(32,190,388,190)
c.setFont('Times-Bold',21); c.setFillColor(HexColor('#34755e')); c.drawString(32,155,'02')
c.setFillColor(HexColor('#263a30')); c.drawString(76,155,'Look a little closer')
lines(76,122,['Zoom in to see details in a diagram,','a table or a small note.','Return to fit width whenever you need.'],13)
c.showPage()
base('Find what matters','Read carefully, then follow a useful idea.',2)
lines(32,466,['SEARCH TARGET: quiet reading','A searchable PDF contains a text layer.','Search each page without changing the original.','','Use a page number to jump to a detail.','Your place is kept on this device.','','This synthetic file has three pages.'],16)
c.bookmarkPage('chapter-two'); c.addOutlineEntry('Find what matters','chapter-two',level=0)
c.showPage()
base('Return with an idea','The original file stays exactly as it was.',3)
lines(32,465,['A quiet reading workflow should be predictable.','Read, find and return without editing the PDF.'],15)
c.setFont('MobileCJK',19); c.drawString(32,365,'中文检索：安静阅读，记住这一页。')
c.setFont('MobileCJK',15); c.drawString(32,327,'页面文字按提取顺序显示，保留原 PDF。')
c.setFont('Times-Roman',12); c.drawString(32,230,'End of the synthetic LongEdit reading guide.')
c.save()
print(f'{out}: {out.stat().st_size} bytes')
