"""Independent readback of owned PPTX outputs; not Office visual acceptance."""
import hashlib, json, os, re, sys, zipfile
from pathlib import Path
from defusedxml import ElementTree
for key, value in {'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted','RUNNER_OS':'Windows','LONGEDIT_R5I_DISPOSABLE':'1'}.items():
    assert os.environ.get(key) == value
owner, request, output = (Path(v).resolve() for v in sys.argv[1:])
assert owner.is_relative_to(Path('C:/LongEditR5ILibrary').resolve()) and (owner/'.v119-installed-owner').is_file()
assert request.is_relative_to(owner) and not output.exists()
sha = lambda b: hashlib.sha256(b).hexdigest()
text_tag = '{http://schemas.openxmlformats.org/drawingml/2006/main}t'
def shape(node):
    return (node.tag, sorted(node.attrib.items()), None if node.tag == text_tag else node.text, node.tail, tuple(shape(child) for child in node))
results = []
for case in json.loads(request.read_text(encoding='utf-8')):
    files = {k:(owner/case[k]).resolve() for k in ['before','source','copy']}
    assert all(f.is_relative_to(owner) and f.suffix == '.pptx' and f.stat().st_size < 96*1024*1024 for f in files.values())
    with zipfile.ZipFile(files['before']) as archive:
        assert archive.testzip() is None
        original = {name:archive.read(name) for name in archive.namelist()}
    outcomes = {}
    for key in ['source','copy']:
        expected = case['sourceEdits' if key == 'source' else 'copyEdits']
        assert len(expected) == len(set(expected)) == 2
        with zipfile.ZipFile(files[key]) as saved:
            assert saved.testzip() is None and sorted(saved.namelist()) == sorted(original)
            changed, preserved, changed_text = [], [], []
            for name, before in original.items():
                after = saved.read(name)
                if after == before:
                    preserved.append({'part':name,'sha256':sha(before)})
                    continue
                assert re.fullmatch(r'ppt/(slides/slide|notesSlides/notesSlide)\d+\.xml', name), name
                old_root, new_root = ElementTree.fromstring(before), ElementTree.fromstring(after)
                assert shape(old_root) == shape(new_root), name
                for old, new in zip(old_root.iter(text_tag), new_root.iter(text_tag)):
                    if old.text != new.text:
                        assert new.text in expected, (name, new.text)
                        changed_text.append(new.text)
                changed.append(name)
            assert len(changed) == 2 and sorted(changed_text) == sorted(expected)
            outcomes[key] = {'sha256':sha(files[key].read_bytes()),'preservedParts':preserved,'changedParts':changed,'changedTextCount':len(changed_text),'expectedTextVerified':True,'unchangedStructureVerified':True}
    results.append({'producerId':case['producerId'],'beforeSha256':sha(files['before'].read_bytes()),**outcomes})
assert [c['producerId'] for c in results] == ['microsoft-powerpoint-16','wps-presentation','libreoffice-impress']
output.write_text(json.dumps({'status':'passed','reader':'defusedxml-0.7.1-and-stdlib-zipfile','nativeBridgeMocked':False,'officeVisualAcceptance':False,'cases':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
