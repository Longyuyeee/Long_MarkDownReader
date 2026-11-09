"""Independent ZIP producers: no product parser/writer is imported.
Outputs only inside an explicitly requested NEW directory.
"""
import base64, hashlib, io, json, pathlib, struct, sys, zipfile

output = pathlib.Path(sys.argv[1]).resolve()
output.mkdir(exist_ok=False)
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMwSV3/HwAEYQJIOvJo2gAAAABJRU5ErkJggg==')
content = '\ufeff# 携带中文😀\r\n![图](assets/%E5%9B%BE%20%23.png)\r[资料](assets/a.pdf#page=2)\n[空文件](assets/empty.pdf)\r\n'
members = {'笔记.textbundle/info.json': b'{"version":2,"type":"net.daringfireball.markdown"}', '笔记.textbundle/text.markdown': content.encode(), '笔记.textbundle/assets/图 #.png': png, '笔记.textbundle/assets/a.pdf': bytes([0,1,255,0,10,13]), '笔记.textbundle/assets/empty.pdf': b''}

def zipped(files, compression=zipfile.ZIP_DEFLATED):
    result = io.BytesIO()
    with zipfile.ZipFile(result, 'w', compression=compression) as archive:
        for name, data in files.items(): archive.writestr(name, data)
    return result.getvalue()

fixtures = {'safe': zipped(members), 'same': zipped({**members, '笔记.textbundle/text.markdown': (content+'第二份同名笔记\r\n').encode()}), 'stored': zipped(members, zipfile.ZIP_STORED), 'traversal': zipped({**members, '../escape.txt': b'never write'}), 'missing': zipped({name:data for name,data in members.items() if not name.endswith('图 #.png')}), 'invalid': zipped({**members,'笔记.textbundle/text.markdown': b'\xff\xfeA\0'}), 'wrongtype': zipped(members), 'txt': zipped({'info.json':b'{"version":2,"type":"public.plain-text"}', 'text.txt':'\ufeff纯文字😀\r\n保留 CR\r尾行\n![literal](missing.png)'.encode()}), 'offline': zipped(members)}
bad = bytearray(fixtures['stored'])
with zipfile.ZipFile(io.BytesIO(bad)) as archive:
    member = archive.infolist()[0]
    start = member.header_offset + 30 + len(member.filename.encode()) + len(member.extra)
bad[start] ^= 1
fixtures['crc'] = bytes(bad)
bomb = bytearray(zipped({'info.json': b'{"version":2}', 'text.markdown': b'A'*(32*1024*1024)}))
central = struct.unpack_from('<I', bomb, len(bomb)-6)[0]
cursor = central
while bomb[cursor:cursor+4] == b'PK\x01\x02':
    name_length, extra_length, comment_length = struct.unpack_from('<HHH',bomb,cursor+28)
    if bomb[cursor+46:cursor+46+name_length] == b'text.markdown':
        local = struct.unpack_from('<I',bomb,cursor+42)[0]
        struct.pack_into('<I',bomb,cursor+24,1); struct.pack_into('<I',bomb,local+22,1)
    cursor += 46+name_length+extra_length+comment_length
fixtures['bomb'] = bytes(bomb)
symlink = io.BytesIO()
with zipfile.ZipFile(symlink,'w') as archive:
    for name, data in members.items(): archive.writestr(name,data)
    info = zipfile.ZipInfo('笔记.textbundle/assets/link'); info.create_system=3; info.external_attr=0xA1FF0000; archive.writestr(info,'../../outside')
fixtures['symlink'] = symlink.getvalue()
manifest = {}
for name,data in fixtures.items():
    (output/(name+'.textpack')).write_bytes(data)
    manifest[name] = {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
manifest['expected'] = {'content':content,'assets':{name.split('.textbundle/')[1]:{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'base64':base64.b64encode(data).decode()} for name,data in members.items() if '/assets/' in name}}
(output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(output)
