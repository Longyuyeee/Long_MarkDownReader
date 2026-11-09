"""Preserve raw evidence and compare production pages with the frozen references."""
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

out = Path('docs/evidence/mobile-import-read-retry-2026-10-28')
candidate, replies, basic, incoming, layers = map(Path, sys.argv[1:6])
assert not (out / 'browser-report.json').exists(), 'Final evidence already exists; use a new version.'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
digest = lambda b: sha256(b).hexdigest()
def save(name, data):
    (out / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
for version in ('v1', 'v2'):
    frozen = read(out / ('design-freeze-' + version + '.json'))
    for file, expected in frozen['files'].items():
        assert digest(Path(file).read_bytes()) == expected, file
for file, expected in read(out / 'confirmation-freeze.json')['files'].items():
    assert digest(Path(file).read_bytes()) == expected, file
report = read(candidate / 'report.json')
assert len(report['checks']) == 7 and not report.get('failure') and not report['errors'] and not report['externalRequests']
assert all(not r['violations'] for r in report['accessibility'])
save('browser-report.json', report)
for name, folder in [('replies', replies), ('text-import', basic), ('incoming', incoming), ('task-layers', layers)]:
    data = read(folder / 'report.json')
    assert not data.get('failure') and not data.get('errors'), name
    save(name + '-report.json', data)
for screen in report['screens']:
    name = screen['name']
    shutil.copyfile(candidate / (name + '.png'), out / ('actual-' + name + '.png'))
    shutil.copyfile(candidate / (name + '-geometry.json'), out / ('actual-' + name + '-geometry.json'))
before = Path('docs/evidence/mobile-0.1.0/import-read-retry-before-v2-2026-10-28')
save('before-report.json', read(before / 'report.json'))
for name in ('initial-failure', 'list-recovered', 'detail-failure'):
    shutil.copyfile(before / (name + '.png'), out / ('before-' + name + '.png'))
first_failures = {
    'deferred-retry-button-disappeared': Path('docs/evidence/mobile-0.1.0/import-read-replies-1793183028892'),
    'incoming-obsolete-button-name': Path('docs/evidence/mobile-0.1.0/incoming-browser-1793182969478'),
    'task-layers-obsolete-confirmation-role': Path('docs/evidence/mobile-0.1.0/task-layers-browser-1793183273190'),
}
for name, folder in first_failures.items():
    save('first-failure-' + name + '.json', read(folder / 'report.json'))

comparison = {'scope': 'Seven final settled states; raw screenshots are not edited. Textarea content is verified through inputValue in the browser report.', 'states': {}, 'maxCoordinateDelta': 0, 'differences': []}
freeze = read(out / 'design-freeze-v2.json')
for name, expected in freeze['geometry'].items():
    actual = read(candidate / (name + '-geometry.json'))
    assert len(expected) == len(actual), name
    count = 0
    for a, b in zip(expected, actual):
        for field in a:
            if a['tag'] == 'TEXTAREA' and field == 'name':
                continue  # Vue binds .value, while the static reference serializes the text node.
            if isinstance(a[field], (int, float)):
                delta = abs(a[field] - b[field]); comparison['maxCoordinateDelta'] = max(comparison['maxCoordinateDelta'], delta); count += 1
                if delta > 0.1: comparison['differences'].append([name, a['tag'], a['name'], field, a[field], b[field]])
            elif a[field] != b[field]: comparison['differences'].append([name, a['tag'], a['name'], field, a[field], b[field]])
    comparison['states'][name] = {'elements': len(actual), 'coordinates': count}
save('visual-comparison.json', comparison)
assert not comparison['differences'], comparison['differences']

provenance = {'capturedAt': datetime.now(timezone.utc).isoformat(), 'baseHead': 'af65ae76b', 'candidate': str(candidate), 'files': {}, 'unchangedEngines': {}, 'servedAssets': {}}
for file in ('src/mobile/FileImportPanel.vue', 'scripts/test-mobile-import-read-retry-browser.mjs', 'scripts/test-mobile-import-read-replies-browser.mjs'):
    data = Path(file).read_bytes(); provenance['files'][file] = {'bytesSha256': digest(data), 'gitLfSha256': digest(data.replace(b'\r\n', b'\n'))}
for file in ('src/mobile/storage.ts', 'src/mobile/textImport.ts', 'src/mobile/taskPosition.ts', 'src/mobile/MobileApp.vue', 'src/mobile/IncomingCenter.vue'):
    base = subprocess.check_output(['git', 'show', 'af65ae76b:' + file]); current = Path(file).read_bytes().replace(b'\r\n', b'\n')
    assert base == current, file
    provenance['unchangedEngines'][file] = digest(current)
for file in re.findall(r'(?:src|href)="(\./assets/[^\"]+)"', Path('dist/mobile.html').read_text(encoding='utf-8')):
    expected = Path('dist', file).read_bytes()
    with urllib.request.urlopen('http://127.0.0.1:9012/' + file.removeprefix('./'), timeout=10) as response:
        served = response.read()
    assert expected == served, file
    provenance['servedAssets'][file] = digest(expected)
save('provenance.json', provenance)
save('research-sources.json', {'accessed': '2026-10-28', 'method': 'Official documentation read using web search and open; no competitor installed or recorded', 'sources': [
    {'title': 'Notion: Import data', 'url': 'https://www.notion.com/help/import-data-into-notion', 'finding': 'Imports are documented for desktop and web, not mobile. Their mobile failure/retry interaction cannot be inferred from this page.'},
    {'title': 'Joplin: Attachments', 'url': 'https://joplinapp.org/help/apps/attachments/', 'finding': 'Attachment content can be downloaded always, manually, or on opening a note. A record/link and currently available content are distinct states; the local retry wording here is our design judgment.'}
]})
cards = []
for name in list(freeze['states']) + ['read-failure-confirm']:
    cards.append(f'<article><h2>{html.escape(name)}</h2><div class="pair"><figure><figcaption>冻结设计 v2</figcaption><img src="design-v2-{name}.png" alt="{name} 设计原图"></figure><figure><figcaption>正式 App</figcaption><img src="actual-{name}.png" alt="{name} 实页原图"></figure></div></article>')
(out / 'comparison.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>文字导入读取失败与重试核对</title><style>body{margin:24px;font:16px/1.7 system-ui;background:#f6f7f3;color:#203d31}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:20px}.pair{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0 0 20px}img{display:block;max-width:min(390px,90vw);height:auto;border:1px solid #dbe4d8}a{color:#246847}article{padding-top:12px;border-top:1px solid #dbe4d8}</style><main><h1>文字导入：读取失败后继续原任务</h1><p>先区分空列表、读取失败和上次列表，再提供同编号重读；确认存入之前不创建笔记。普通说明留在问号，保留有效错误和数据风险提示。</p><p>下方均为原始截图。大字短屏展示滚到重试按钮的位置，页头可向上滚回；确认弹窗两侧背景使用不同合成资料，比较范围为确认层。浏览器与延迟回复组件测试均不代表 Android 原生验收。</p><p><a href="visual-comparison.json">七状态坐标／字体核对</a> · <a href="browser-report.json">正式App专项</a> · <a href="replies-report.json">延迟回复组件专项</a> · <a href="provenance.json">来源核对</a> · <a href="research-sources.json">竞品官方资料</a> · <a href="design-freeze-v1.json">第一版冻结</a> · <a href="design-freeze-v2.json">第二版冻结</a></p>''' + ''.join(cards) + '</main></html>', encoding='utf-8')
print(json.dumps({'screens': len(report['screens']), 'coordinateDelta': comparison['maxCoordinateDelta'], 'states': comparison['states']}, ensure_ascii=True))
