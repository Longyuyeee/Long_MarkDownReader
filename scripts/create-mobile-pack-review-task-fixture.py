"""Independent ZIP fixture: long text, deep asset list and duplicate image basenames."""
from pathlib import Path
from hashlib import sha256
from urllib.parse import quote
import zipfile
import json

source=Path('E:/Android/BuildCache/LongEdit-PackImport-Valid-20261024/safe.textpack')
target=Path('scripts/fixtures/mobile-pack-review-task.textpack')
with zipfile.ZipFile(source) as z:
    files={name:z.read(name) for name in z.namelist()}
root=next(name[:-len('info.json')] for name in files if name.endswith('/info.json'))
text_name=root+'text.markdown'
content=files[text_name].decode('utf-8')+'\n'+''.join(f'第{i:04d}行：保留这份完整正文。\n' for i in range(2050))
image=next(value for name,value in files.items() if name.endswith('.png'))
for i in range(18):files[root+f'assets/资料清单/{i:02d}-核对资料.pdf']=f'fixture-{i}'.encode()
for folder in ('一','二'):
    path=f'assets/{folder}/同名图.png';files[root+path]=image;content+=f'![{folder}](<{quote(path)}>)\n'
content+='最后核对目标：完整尾行😀\r\n';files[text_name]=content.encode('utf-8')
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as z:
    for name,value in files.items():
        info=zipfile.ZipInfo(name,(2026,10,28,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,value)
meta={'sha256':sha256(target.read_bytes()).hexdigest(),'contentSha256':sha256(files[text_name]).hexdigest(),'content':content,'assets':{name[len(root):]:{'base64':__import__('base64').b64encode(value).decode()} for name,value in files.items() if name.startswith(root+'assets/')}}
target.with_suffix('.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'target':str(target),'bytes':target.stat().st_size,'assets':len(meta['assets']),'contentBytes':len(files[text_name])}))
