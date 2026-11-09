import json, hashlib, sys
from pathlib import Path
from PIL import Image, ImageChops
folder=sys.argv[2] if len(sys.argv)>2 else 'browser-cancel-final'
root=Path(sys.argv[1]);design=Path('docs/design/mobile-native-text-position-v1');report={'scope':'Original app-viewport PNGs, no screenshot post-processing. Error prototype body is illustrative. Initial placement difference is retained; revised component placement is compared below.','normal':[],'components':[]}
for name in ['reading','menu']:
    reference=design/f'reference-{name}.png';actual=root/folder/f'reference-{name}.png';a,b=Image.open(reference).convert('RGBA'),Image.open(actual).convert('RGBA');assert a.size==b.size
    changed=sum(bool(any(px)) for px in ImageChops.difference(a,b).getdata());assert changed==0
    report['normal'].append({'name':name,'reference':str(reference),'actual':str(actual),'size':a.size,'changedPixels':changed,'totalPixels':a.width*a.height,'referenceSha256':hashlib.sha256(reference.read_bytes()).hexdigest(),'actualSha256':hashlib.sha256(actual.read_bytes()).hexdigest()})
frozen=json.loads((design/('revision-short-action/component-freeze.json' if folder=='browser-short-action' else 'revision-placement/component-freeze.json')).read_text('utf8'));actual=json.loads((root/'browser-cancel-final/report.json').read_text('utf8'))
for item in frozen['screens']:
    observed=next(s for s in actual['screens'] if s['name']==item['kind']+'-error');p=observed['error'];e=item['geometry'];assert p['rect']['height']==e['rect']['height'];assert p['rect']['width']==e['rect']['width'];assert p['color']==e['color'];assert p['font']==e['font'];assert p['rect']['y']-observed['clip']['y']==e['rect']['y']
    report['components'].append({'name':item['kind'],'width':p['rect']['width'],'height':p['rect']['height'],'top':p['rect']['y']-observed['clip']['y'],'font':p['font'],'color':p['color'],'note':'Revised top placement matches component geometry; illustrative paper and simplified header/footer are not whole-page pixel references.'})
(root/('alignment-short-action.json' if folder=='browser-short-action' else 'alignment-final.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
