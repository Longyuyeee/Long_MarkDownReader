import json, hashlib, sys
from pathlib import Path
from PIL import Image, ImageChops
root=Path(sys.argv[1]); design=Path('docs/design/mobile-native-pdf-position-v1'); report={'scope':'Original PNG comparison only. No crop, mask, redraw or screenshot edits. Error prototype paper is illustrative; only component properties are compared there.','normal':[],'errors':[]}
for name in ['reader','mode']:
    reference=design/('reference-'+name+'.png'); actual=root/'regression-settings-final'/(name+'.png')
    a,b=Image.open(reference).convert('RGBA'),Image.open(actual).convert('RGBA'); assert a.size==b.size
    diff=ImageChops.difference(a,b); changed=sum(1 for px in diff.getdata() if any(px)); report['normal'].append({'name':name,'reference':str(reference),'actual':str(actual),'size':a.size,'changedPixels':changed,'totalPixels':a.width*a.height,'referenceSha256':hashlib.sha256(reference.read_bytes()).hexdigest(),'actualSha256':hashlib.sha256(actual.read_bytes()).hexdigest()})
freeze=json.loads((design/'revision-contrast/component-freeze.json').read_text('utf8')); actual=json.loads((root/'browser-final/report.json').read_text('utf8'))
for item in freeze['screens']:
    observed=next(s for s in actual['screens'] if s['name']==item['kind']+'-error'); p=observed['position']; expected=item['geometry']; assert p['rect']['height']==expected['rect']['height']; assert p['rect']['width']==expected['rect']['width']; assert p['color']==expected['color']; assert p['font']==expected['font']; report['errors'].append({'name':item['kind'],'width':p['rect']['width'],'height':p['rect']['height'],'font':p['font'],'color':p['color'],'topRelativeToPrototype':p['rect']['y']-observed['clip']['y']-expected['rect']['y'],'note':'Actual footer is 65px; illustrative prototype footer is 54px. Both retained without moving pixels.'})
(root/'alignment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8'); print(json.dumps(report,ensure_ascii=True))
