"""Own mixed-page PDF corpus; independent copy/annotation permissions, never overwrite."""
import hashlib,json
from pathlib import Path
from pypdf import PdfReader,PdfWriter
from pypdf.constants import UserAccessPermissions as P
root=Path(__file__).resolve().parent
source=root/'fixtures/mobile-pdf-orientation.pdf'
base=P(4294967292)
samples=[('restricted',False,False,''),('no-copy',False,True,''),('no-annotations',True,False,''),('password',False,False,'LongEdit-2026!')]
report={'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'samples':[]}
for name,copy,annotate,password in samples:
    target=root/f'fixtures/mobile-pdf-permissions-{name}.pdf'
    if target.exists(): raise RuntimeError(f'Refusing to overwrite {target}')
    flags=base
    if not copy: flags &= ~P.EXTRACT
    if not annotate: flags &= ~P.ADD_OR_MODIFY
    writer=PdfWriter(clone_from=PdfReader(source))
    parent=writer.add_outline_item('Mixed reading guide',0)
    writer.add_outline_item('Return to cropped source',4,parent=parent)
    writer.encrypt(password,'Owner-permissions-2026!',algorithm='AES-256',permissions_flag=flags)
    with target.open('wb') as f:writer.write(f)
    check=PdfReader(target);assert check.decrypt(password);assert len(check.pages)==6
    stored=int(check.trailer['/Encrypt']['/P']);assert bool(stored&int(P.EXTRACT))==copy;assert bool(stored&int(P.ADD_OR_MODIFY))==annotate
    report['samples'].append({'file':target.name,'copy':copy,'annotate':annotate,'publicTestPassword':password,'pages':6,'permissions':stored,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
(root/'fixtures/mobile-pdf-permissions.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
