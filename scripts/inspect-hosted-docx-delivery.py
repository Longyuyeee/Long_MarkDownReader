"""Independent ZIP/XML readback of owned native DOCX outputs, not Office visual acceptance."""
import hashlib, json, os, sys, zipfile
from pathlib import Path
from defusedxml import ElementTree
for key, expected in {'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted','RUNNER_OS':'Windows','LONGEDIT_R5I_DISPOSABLE':'1'}.items():
    assert os.environ.get(key) == expected
owner, request, output = map(lambda value: Path(value).resolve(), sys.argv[1:])
assert owner.is_relative_to(Path('C:/LongEditR5ILibrary').resolve()) and (owner/'.v119-installed-owner').is_file()
assert request.is_relative_to(owner) and not output.exists()
sha = lambda data: hashlib.sha256(data).hexdigest()
results = []
for case in json.loads(request.read_text(encoding='utf-8')):
    files = {key:(owner/case[key]).resolve() for key in ['before','source','copy']}
    assert all(file.is_relative_to(owner) and file.suffix == '.docx' and file.stat().st_size < 64*1024*1024 for file in files.values())
    with zipfile.ZipFile(files['before']) as before:
        assert before.testzip() is None
        original = {name:before.read(name) for name in before.namelist()}
    outcomes = {}
    for key in ['source','copy']:
        with zipfile.ZipFile(files[key]) as saved:
            assert saved.testzip() is None and sorted(saved.namelist()) == sorted(original)
            preserved = []
            for name, content in original.items():
                if name != 'word/document.xml':
                    assert saved.read(name) == content, name
                    preserved.append({'part':name,'sha256':sha(content)})
            root = ElementTree.fromstring(saved.read('word/document.xml'))
            paragraphs = [''.join(p.itertext()) for p in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p')]
            for expected in case['sourceEdits'] + (case['copyEdits'] if key == 'copy' else []):
                assert any(expected in text for text in paragraphs), expected
            outcomes[key] = {'sha256':sha(files[key].read_bytes()),'preservedParts':preserved,'expectedTextVerified':True}
    results.append({'producerId':case['producerId'],'beforeSha256':sha(files['before'].read_bytes()),**outcomes})
assert sorted(result['producerId'] for result in results) == ['libreoffice-writer','microsoft-word-16','wps-writer']
output.write_text(json.dumps({'status':'passed','reader':'defusedxml-0.7.1-and-stdlib-zipfile','nativeBridgeMocked':False,'officeVisualAcceptance':False,'cases':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
