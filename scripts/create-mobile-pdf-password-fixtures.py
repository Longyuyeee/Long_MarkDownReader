"""Own synthetic corpus: mixed pages, outline and four Standard encryption variants."""
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader, PdfWriter

root=Path(__file__).resolve().parent
source=root/'fixtures/mobile-pdf-orientation.pdf'
samples=[('aes256','AES-256','LongEdit-2026!'),('aes128','AES-128',' LongEdit 2026 '),('rc4128','RC4-128','Legacy-2026'),('owner-only','AES-256','')]
report={'kind':'synthetic-password-pdf-corpus','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'samples':[]}
for name,algorithm,password in samples:
    target=root/f'fixtures/mobile-pdf-password-{name}.pdf'
    writer=PdfWriter(clone_from=PdfReader(source))
    parent=writer.add_outline_item('Mixed page reading guide',0)
    writer.add_outline_item('Landscape and sideways text',1,parent=parent)
    writer.add_outline_item('Cropped source and image',4,parent=parent)
    writer.add_metadata({'/Title':'LongEdit encrypted mixed reading guide','/Author':'LongEdit synthetic regression corpus'})
    writer.encrypt(password,'Owner-LongEdit-2026!',algorithm=algorithm)
    if not target.exists():
        with target.open('wb') as handle: writer.write(handle)
    check=PdfReader(target)
    assert check.is_encrypted and check.decrypt(password)
    assert len(check.pages)==6 and len(check.outline)>=1
    assert check.pages[0].extract_text()==PdfReader(source).pages[0].extract_text()
    report['samples'].append({'file':target.name,'algorithm':algorithm,'publicTestPassword':password,'pages':6,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
(root/'fixtures/mobile-pdf-password.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
