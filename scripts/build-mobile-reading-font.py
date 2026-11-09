"""Build the offline article-title font from a pinned, licensed source.

Python dependencies are task-local; never install fonts into the operating system.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--tools',type=Path,required=True)
args=parser.parse_args()
sys.path.insert(0,str(args.tools.resolve()))
import fontTools
import brotli
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

root=Path(__file__).resolve().parents[1]
target=root/'src/assets/fonts/reading-serif'
target.mkdir(parents=True,exist_ok=True)
source=args.source/'NotoSerifSC.ttf'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9'
assert hashlib.sha256((args.source/'OFL.txt').read_bytes()).hexdigest()=='5e0da210fb04058a8c0087985d2d456b931c2579811a49655721d3cf0c36b6d6'
font=TTFont(source,recalcTimestamp=False)
instantiateVariableFont(font,{'wght':700},inplace=True)
unicodes=set(range(0x20,0x100))|set(range(0x2000,0x2070))|set(range(0x3000,0x3040))|set(range(0xff00,0xfff0))
for lead in range(0xa1,0xf8):
    for trail in range(0xa1,0xff):
        try: unicodes.add(ord(bytes([lead,trail]).decode('gb2312')))
        except UnicodeDecodeError: pass
options=subset.Options()
options.name_IDs=[0,1,2,3,4,5,6,13,14,16,17]
options.name_languages=['*']
options.layout_features=['*']
subsetter=subset.Subsetter(options=options)
subsetter.populate(unicodes=unicodes)
subsetter.subset(font)
for id,value in {1:'LongEdit Reading Serif',2:'Bold',3:'LongEditReadingSerif-700-050080d9',4:'LongEdit Reading Serif Bold',6:'LongEditReadingSerif-Bold',16:'LongEdit Reading Serif',17:'Bold'}.items():
    for platform,encoding,language in [(3,1,0x409),(1,0,0)]:font['name'].setName(value,id,platform,encoding,language)
font.flavor='woff2'
font.recalcTimestamp=False
output=target/'LongEditReadingSerif-Bold.woff2'
font.save(output)
shutil.copyfile(args.source/'OFL.txt',target/'OFL.txt')
saved=TTFont(output)
coverage=set(saved.getBestCmap())
assert all(ord(char) in coverage for char in '在城市里，慢慢阅读')
provenance=json.loads((args.source/'source.json').read_text(encoding='utf-8'))
provenance.update({'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'output':output.name,'outputSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size,'family':'LongEdit Reading Serif','weight':700,'coverage':'GB2312, Latin-1 and common punctuation; other characters use the system fallback','codepoints':len(coverage),'fontTools':fontTools.__version__,'brotli':brotli.__version__,'license':'SIL Open Font License 1.1; full text in OFL.txt'})
(target/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf-8')
print(json.dumps(provenance))
