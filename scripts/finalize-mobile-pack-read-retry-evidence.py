"""Keep original screenshots and verify the frozen pack-retry design against the production app."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import html
import json
import re
import shutil
import subprocess
import sys
import urllib.request

out = Path('docs/evidence/mobile-pack-read-retry-2026-10-28')
candidate, replies, basic, incoming = map(Path, sys.argv[1:5])
assert not (out / 'browser-report.json').exists(), 'Final evidence exists; preserve it and create a new version.'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
digest = lambda b: sha256(b).hexdigest()
def save(name, data):
    (out / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
freeze = read(out / 'design-freeze-v1.json')
for file, expected in freeze['files'].items():
    assert digest(Path(file).read_bytes()) == expected, file
report = read(candidate / 'report.json')
assert len(report['checks']) == 7 and not report.get('failure') and not report['errors'] and not report['externalRequests']
assert all(not r['violations'] for r in report['accessibility'])
save('browser-report.json', report)
for name, folder in [('replies', replies), ('pack-import', basic), ('incoming', incoming)]:
    data = read(folder / 'report.json'); assert data['passed'] and not data.get('failure') and not data.get('errors'), name
    save(name + '-report.json', data)
for screen in report['screens']:
    name = screen['name']
    shutil.copyfile(candidate / (name + '.png'), out / ('actual-' + name + '.png'))
    shutil.copyfile(candidate / (name + '-geometry.json'), out / ('actual-' + name + '-geometry.json'))
before = Path(freeze['baseline'])
save('before-report.json', read(before / 'report.json'))
for name in ('initial-failure', 'detail-failure', 'package-unavailable', 'removal-warning'):
    shutil.copyfile(before / (name + '.png'), out / ('before-' + name + '.png'))
for name, folder in {
    'test-assumed-settings-return': Path('docs/evidence/mobile-0.1.0/pack-read-retry-candidate-1793184683236'),
    'legacy-incoming-route': Path('docs/evidence/mobile-0.1.0/pack-incoming-browser-1793184717454'),
}.items():
    save('first-failure-' + name + '.json', read(folder / 'report.json'))
    if (folder / 'failure.png').exists(): shutil.copyfile(folder / 'failure.png', out / ('first-failure-' + name + '.png'))
save('build-notes.json', {'firstAttemptPassed': False, 'diagnostic': "src/mobile/PackImportPanel.vue(87,41): error TS2345: Argument of type '() => Promise<boolean>' is not assignable to parameter of type '() => Promise<void>'.", 'repair': 'Refresh awaits the boolean-returning loader inside a void task callback.', 'subsequentBuildPassed': True, 'remainingWarning': 'Existing bundle chunks above 750 kB.'})

comparison = {'scope': 'All nine settled states; screenshots remain original, including real scroll position and focus.', 'states': {}, 'maxCoordinateDelta': 0, 'differences': []}
for name, expected in freeze['geometry'].items():
    actual = read(candidate / (name + '-geometry.json')); assert len(expected) == len(actual), name
    coordinates = 0
    for a, b in zip(expected, actual):
        for field in a:
            if isinstance(a[field], (int, float)):
                delta = abs(a[field] - b[field]); comparison['maxCoordinateDelta'] = max(comparison['maxCoordinateDelta'], delta); coordinates += 1
                if delta > 0.1: comparison['differences'].append([name, a['tag'], a['name'], field, a[field], b[field]])
            elif a[field] != b[field]: comparison['differences'].append([name, a['tag'], a['name'], field, a[field], b[field]])
    comparison['states'][name] = {'elements': len(actual), 'coordinates': coordinates}
save('visual-comparison.json', comparison); assert not comparison['differences'], comparison['differences']

provenance = {'capturedAt': datetime.now(timezone.utc).isoformat(), 'baseHead': '09e99b9f5', 'candidate': str(candidate), 'files': {}, 'unchangedEngines': {}, 'servedAssets': {}}
for file in ('src/mobile/PackImportPanel.vue', 'scripts/test-mobile-pack-read-retry-browser.mjs', 'scripts/test-mobile-pack-read-replies-browser.mjs'):
    data = Path(file).read_bytes(); provenance['files'][file] = {'bytesSha256': digest(data), 'gitLfSha256': digest(data.replace(b'\r\n', b'\n'))}
for file in ('src/mobile/storage.ts', 'src/mobile/packImport.ts', 'src/mobile/taskPosition.ts', 'src/mobile/MobileApp.vue', 'src/mobile/IncomingCenter.vue', 'src/mobile/FileImportPanel.vue', 'src-tauri/plugins/mobile-storage/android/src/main/java/PackImports.kt', 'src-tauri/plugins/mobile-storage/android/src/main/java/PackageArchive.kt'):
    base = subprocess.check_output(['git', 'show', '09e99b9f5:' + file]); current = Path(file).read_bytes().replace(b'\r\n', b'\n'); assert base == current, file
    provenance['unchangedEngines'][file] = digest(current)
for file in re.findall(r'(?:src|href)="(\./assets/[^\"]+)"', Path('dist/mobile.html').read_text(encoding='utf-8')):
    expected = Path('dist', file).read_bytes()
    with urllib.request.urlopen('http://127.0.0.1:9012/' + file.removeprefix('./'), timeout=10) as response: served = response.read()
    assert expected == served, file; provenance['servedAssets'][file] = digest(expected)
save('provenance.json', provenance)
save('research-sources.json', {'accessed': '2026-10-28', 'method': 'Official help pages read with web search/open; no competitor installation or recording.', 'sources': [
    {'title': 'Bear: Import notes', 'url': 'https://bear.app/faq/import-your-notes/', 'finding': 'Supports TextBundle V2 and compressed TextPack; the iOS importer is reached from the sidebar menu. This supports a distinct mobile import task; the retry design here is ours.'},
    {'title': 'Joplin: Importing and exporting', 'url': 'https://joplinapp.org/help/apps/import_export/', 'finding': 'ENEX import includes text and resources; JEX preserves notes and metadata for reimport. These data-retention descriptions do not establish the current Android failure/retry UI.'}
]})
cards = ''.join(f'<article><h2>{html.escape(name)}</h2><div class="pair"><figure><figcaption>冻结设计 v1</figcaption><img src="design-v1-{name}.png" alt="{name}设计原图"></figure><figure><figcaption>正式App</figcaption><img src="actual-{name}.png" alt="{name}实页原图"></figure></div></article>' for name in freeze['states'])
(out / 'comparison.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>附件包读取失败与重试核对</title><style>body{margin:24px;background:#f6f7f3;color:#203d31;font:16px/1.7 system-ui}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:20px}.pair{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0 0 20px}img{display:block;max-width:min(390px,90vw);height:auto;border:1px solid #dbe4d8}article{border-top:1px solid #dbe4d8;padding-top:12px}a{color:#246847}</style><main><h1>附件包：读取失败后继续原任务</h1><p>区分空列表、旧列表、记录读取失败与原有包格式错误；重读沿用同一编号，确认存入之前不发布笔记和附件。错误、数据风险就地呈现，通用解释继续留在问号。</p><p>原图未经修改。大字短屏图是滚到重试按钮的位置，页头可以向上滚回；本轮未声称导入页面整体分层或固定页头已经完成。浏览器故障注入及组件延迟回复均不代表Android原生验收。</p><p><a href="visual-comparison.json">九状态外形核对</a> · <a href="design-freeze-v1.json">设计冻结</a> · <a href="browser-report.json">正式App专项</a> · <a href="replies-report.json">延迟回复组件专项</a> · <a href="contrast-followup.json">对比度未决补查</a> · <a href="provenance.json">来源核对</a> · <a href="research-sources.json">竞品资料</a></p>''' + cards + '</main></html>', encoding='utf-8')
for folder in (basic, Path('docs/evidence/mobile-0.1.0/pack-incoming-browser-1793184717454')):
    (folder / '.gitignore').write_text('*\n', encoding='utf-8')
print(json.dumps({'screens': len(report['screens']), 'coordinateDelta': comparison['maxCoordinateDelta'], 'coordinates': sum(s['coordinates'] for s in comparison['states'].values())}, ensure_ascii=True))
