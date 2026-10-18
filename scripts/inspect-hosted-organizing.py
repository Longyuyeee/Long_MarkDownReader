"""Independent readers of actual installer outputs, never a mock IPC receipt."""
import hashlib, json, pathlib, sys
from defusedxml import ElementTree as ET
root, destination = map(pathlib.Path, sys.argv[1:])
names = ['installed-v1119-canvas-saved.canvas','installed-v1119-opml-saved.opml','installed-v1119-opml-original.opml','installed-v1119-opml-copy.opml','installed-v1119-unselected.md']
canvas = json.loads((root/names[0]).read_text(encoding='utf-8'))
assert canvas['vendor'] == {'preserve':'unknown root field'}
assert next(n for n in canvas['nodes'] if n['id']=='a')['text'] == '用户保存的画布内容'
assert next(n for n in canvas['nodes'] if n['id']=='a')['custom'] == {'keep':'不要丢失'}
assert next(n for n in canvas['nodes'] if n['id']=='f')['file'].endswith('/notes/接续来源.md')
saved = ET.fromstring((root/names[1]).read_bytes())
assert saved.find('body/outline').attrib['_note'] == '用户保存的脑图备注'
assert saved.find('head/ownerName').text == ' 保留头部空白 '
original = (root/names[2]).read_bytes()
assert b'<!--keep-original-comment-->' in original
assert ET.fromstring(original).find('head/{urn:vendor}state').text == 'must survive original'
copy = ET.fromstring((root/names[3]).read_bytes())
assert copy.find('body/outline').attrib['_note'] == '另存兼容副本的备注'
assert copy.find('head/{urn:vendor}state') is None
assert (root/names[4]).read_text(encoding='utf-8') == '其他文件不能改变\n'
outputs=[]
for name in names:
    data=(root/name).read_bytes()
    outputs.append(dict(fileName=name,sizeBytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
destination.write_text(json.dumps(dict(status='passed',reader='stdlib-json-and-defusedxml-0.7.1',nativeBridgeMocked=False,outputs=outputs),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
