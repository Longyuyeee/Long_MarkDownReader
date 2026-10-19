"""Independent readers and exact untouched source checks, owned hosted fixtures only."""
import hashlib, json, re, sys, tomllib
from pathlib import Path
from defusedxml import ElementTree
root=Path(sys.argv[1]); report={"status":"passed","reader":"stdlib-json-tomllib-defusedxml-and-exact-yaml-bytes","nativeBridgeMocked":False,"outputs":[]}
templates={
    'json':'// 保留注释\r\n{"value":"原始内容","big":9007199254740993,"a/b~c":["保留路径"]}\r\n',
    'yaml':'# 保留注释\r\nvalue: 原始内容\r\nbase: &base 保留锚点\r\nalias: *base\r\n',
    'xml':'<root keep="原始属性">\r\n<!--保留注释--><value>原始内容</value>\r\n</root>\r\n',
    'toml':'# 保留注释\r\nvalue = "原始内容"\r\nbig = 9007199254740993\r\n',
}
for file in sorted(root.glob('installed-v1120-*')):
    if file.suffix not in ('.jsonc','.yaml','.xml','.toml','.md'): continue
    data=file.read_bytes(); text=data.decode('utf-8-sig')
    if file.suffix=='.jsonc':
        clean=re.sub(r'(?m)^\s*//[^\r\n]*','',text); value=json.loads(clean)
        assert value['big']==9007199254740993 and value['a/b~c'][0]=='保留路径'
        assert '// 保留注释' in text
    elif file.suffix=='.xml':
        value=ElementTree.fromstring(text); assert value.attrib['keep']=='原始属性'
        assert '<!--保留注释-->' in text
    elif file.suffix=='.toml':
        value=tomllib.loads(text); assert value['big']==9007199254740993
        assert '# 保留注释' in text
    elif file.suffix=='.yaml':
        # The exact-byte assertion covers this entire controlled YAML document,
        # including anchors/aliases; do not claim a new YAML semantic reader.
        assert '# 保留注释\n' in text.replace('\r\n','\n') and 'alias: *base\n' in text.replace('\r\n','\n')
    if file.suffix!='.md':
        expected='保存内容' if '-saved.' in file.name else '我的冲突草稿'
        assert expected in text
        assert text.replace(expected,'原始内容').count('原始内容')==1
        mode=file.name.split('-')[2]
        original=templates[mode].replace('原始内容',expected)
        exact=('\ufeff'+original) if '-saved.' in file.name else original.replace('\r\n','\n')
        assert data==exact.encode('utf-8'), 'Untouched source bytes changed: '+file.name
    report['outputs'].append({'fileName':file.name,'sizeBytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
assert len(report['outputs'])==9
Path(sys.argv[2]).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
