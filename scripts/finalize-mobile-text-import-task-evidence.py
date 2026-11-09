"""Freeze final raw captures and provenance; never alter a captured screenshot."""
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

out = Path('docs/evidence/mobile-text-import-task-2026-10-28')
candidate, basic, retry, incoming, layers, replies, pack = map(Path, sys.argv[1:8])
assert not (out / 'browser-report.json').exists(), 'Final evidence exists; create a new version.'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
digest = lambda b: sha256(b).hexdigest()


def save(name, value):
    (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


for version in (1, 2):
    for file, expected in read(out / f'design-freeze-v{version}.json')['files'].items():
        assert digest(Path(file).read_bytes()) == expected, file
report = read(candidate / 'report.json')
assert report['passed'] and len(report['checks']) == 8 and not report['errors'] and not report['externalRequests']
assert len(report['accessibility']) == 5
assert all(not r['violations'] and not r['incomplete'] for r in report['accessibility'])
save('browser-report.json', report)
for name, folder, count in [('text-import', basic, 12), ('read-retry', retry, 7), ('incoming', incoming, 14), ('task-layers', layers, 9), ('replies', replies, 3), ('pack-task', pack, 8)]:
    result = read(folder / 'report.json')
    assert not result.get('failure') and not result.get('errors') and len(result['checks']) == count, name
    save(name + '-report.json', result)
for name in report['screens']:
    for suffix in ('.png', '-geometry.json'):
        shutil.copyfile(candidate / (name + suffix), out / ('actual-' + name + suffix))

failures = {
    'light-warning-contrast': Path('docs/evidence/mobile-0.1.0/import-read-retry-candidate-1793191528394'),
    'old-header-metric': Path('docs/evidence/mobile-0.1.0/incoming-browser-1793191741479'),
    'rounded-preview-metric': Path('docs/evidence/mobile-0.1.0/incoming-browser-1793191774351'),
}
for name, folder in failures.items():
    save('first-failure-' + name + '.json', read(folder / 'report.json'))
    if (folder / 'failure.png').exists():
        shutil.copyfile(folder / 'failure.png', out / ('first-failure-' + name + '.png'))
for name in ('cached-failure', 'narrow-detail-failure'):
    shutil.copyfile(retry / (name + '.png'), out / ('contrast-' + name + '.png'))

freeze = read(out / 'design-freeze-v2.json')
comparison = {'scope': '11 states: names, coordinates, dimensions, font sizes, line heights and colors. Keyboard focus is retained. Raw received-review also contains a transient browser tap highlight from its caller; measurement equality is not a pixel-equality claim.', 'states': {}, 'maxCoordinateDelta': 0, 'differences': []}
for name, state in freeze['states'].items():
    expected, actual = state['geometry'], read(candidate / (name + '-geometry.json'))
    assert len(expected) == len(actual), name
    coordinates = 0
    for a, b in zip(expected, actual):
        for field in a:
            if isinstance(a[field], (int, float)):
                delta = abs(a[field] - b[field])
                coordinates += 1
                comparison['maxCoordinateDelta'] = max(comparison['maxCoordinateDelta'], delta)
                if delta > .1:
                    comparison['differences'].append([name, a['tag'], field, a[field], b[field]])
            elif a[field] != b[field]:
                comparison['differences'].append([name, a['tag'], field, a[field], b[field]])
    comparison['states'][name] = {'elements': len(actual), 'coordinates': coordinates}
save('visual-comparison.json', comparison)
assert not comparison['differences'], comparison['differences']

prototype = Path('docs/design/mobile-text-import-task-v2/TextImportPrototype.vue').read_text(encoding='utf-8').replace("'../../../src/mobile/", "'./")
prototype = prototype.replace('<section v-show="view === \'history\'" :inert="view !== \'history\'">', '<section v-show="view === \'history\' && !sourceTask" :inert="view !== \'history\' || sourceTask">')
prototype = prototype.replace("removing.value=false;view.value='history';await load();emit('updated')", "removing.value=false;if(!props.sourceTask)view.value='history';await load();emit('updated')")
assert prototype == Path('src/mobile/FileImportPanel.vue').read_text(encoding='utf-8')
save('prototype-runtime-match.json', {'matches': True, 'base': 'Frozen v2, adapted module paths, plus two source-task guards: never show global history during receipt removal; return directly to inbox. The actual task suite observes mutations to check this.'})

provenance = {'capturedAt': datetime.now(timezone.utc).isoformat(), 'baseHead': 'ca398d746', 'candidate': str(candidate), 'files': {}, 'unchangedEngines': {}, 'servedAssets': {}}
for file in ('src/mobile/FileImportPanel.vue', 'src/mobile/IncomingCenter.vue', 'src/mobile/MobileApp.vue', 'src/mobile/mobile.scss', 'src/mobile/mobileHelp.ts', 'scripts/test-mobile-text-import-task-browser.mjs', 'scripts/test-mobile-text-import-browser.mjs', 'scripts/test-mobile-import-read-retry-browser.mjs', 'scripts/test-mobile-import-read-replies-browser.mjs', 'scripts/test-mobile-incoming-browser.mjs', 'scripts/test-mobile-task-layers-browser.mjs', 'scripts/mobile-text-import-navigation.mjs'):
    b = Path(file).read_bytes()
    provenance['files'][file] = {'bytesSha256': digest(b), 'gitLfSha256': digest(b.replace(b'\r\n', b'\n'))}
for file in ('src/mobile/storage.ts', 'src/mobile/textImport.ts', 'src/mobile/packImport.ts', 'src/mobile/PackImportPanel.vue', 'src/mobile/taskPosition.ts', 'src/mobile/RecoverySource.vue', 'src/mobile/SourceReader.vue', 'src-tauri/plugins/mobile-storage/android/src/main/java/StoragePlugin.kt', 'src-tauri/plugins/mobile-storage/android/src/main/java/IncomingIntent.kt'):
    b = Path(file).read_bytes().replace(b'\r\n', b'\n')
    assert subprocess.check_output(['git', 'show', 'ca398d746:' + file]) == b, file
    provenance['unchangedEngines'][file] = digest(b)
for file in re.findall(r'(?:src|href)="(\./assets/[^\"]+)"', Path('dist/mobile.html').read_text(encoding='utf-8')):
    expected = Path('dist', file).read_bytes()
    with urllib.request.urlopen('http://127.0.0.1:9012/' + file.removeprefix('./'), timeout=10) as response:
        served = response.read()
    assert expected == served, file
    provenance['servedAssets'][file] = digest(expected)
save('provenance.json', provenance)
assert read(out / 'replies-report.json')['componentSha256'] == provenance['files']['src/mobile/FileImportPanel.vue']['bytesSha256']

previous = Path('docs/evidence/mobile-0.1.0/text-import-task-1793190803937')
save('before-contrast-correction-report.json', read(previous / 'report.json'))
same, changed = [], []
for name in report['screens']:
    (same if (previous / (name + '.png')).read_bytes() == (candidate / (name + '.png')).read_bytes() else changed).append(name)
    if name in ('failed-review', 'write-failure'):
        shutil.copyfile(previous / (name + '.png'), out / ('before-contrast-' + name + '.png'))
save('visual-review-reuse.json', {'previouslyViewed': str(previous), 'identicalRawScreenshots': same, 'changedRawScreenshotsViewedSeparately': changed, 'designV2': 'Ten original PNGs equal v1 byte for byte; failed-review has the reviewed contrast correction. Before captures and all 19 final actual states reviewed.'})


def contrast(fg, bg):
    def luminance(color):
        channels = [int(c) / 255 for c in re.findall(r'\d+', color)[:3]]
        linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels]
        return sum(a * b for a, b in zip(linear, (.2126, .7152, .0722)))
    a, b = sorted((luminance(fg), luminance(bg)))
    return (b + .05) / (a + .05)


manual = []
for scan in read(retry / 'report.json')['accessibility']:
    for item in scan['incomplete']:
        assert item['id'] == 'color-contrast'
        for node in item['nodes']:
            for colors in node['colors']:
                ratio = contrast(colors['foreground'], colors['background'])
                threshold = 3 if float(colors['fontSize'][:-2]) >= 24 else 4.5
                assert ratio >= threshold and colors['opacity'] == '1'
                manual.append({'state': scan['name'], 'targets': node['targets'], **colors, 'ratio': round(ratio, 3), 'required': threshold, 'reason': node['summary']})
save('contrast-review.json', {'method': 'Two axe incomplete overlap cases remain verbatim in the read-retry report. Inspect raw cached-failure and narrow-detail-failure PNGs and calculate WCAG luminance from recorded computed foreground/background. Not a claim that axe itself resolved those cases.', 'manualChecks': manual, 'rawScreens': ['contrast-cached-failure.png', 'contrast-narrow-detail-failure.png']})

save('research-sources.json', {'accessed': '2026-10-28', 'method': 'Official help pages read through web search/open. No competitor installed or recorded. Specific task nesting, footer, copy destination and preservation rules here are project design judgments.', 'sources': [
    {'title': 'Bear: Import your notes', 'url': 'https://bear.app/faq/import-your-notes/', 'finding': 'Supports text and Markdown import; iOS import is reached through the sidebar menu. This supports an intentional import entry, but does not establish our retry or multi-page task design.'},
    {'title': 'Obsidian: Mobile app', 'url': 'https://obsidian.md/help/mobile', 'finding': 'Provides back/forward navigation and a menu for ribbon actions. This supports reachable navigation and contextual actions; it does not document this importer.'}
]})
cards = ''.join(f'<article><h2>{html.escape(name)}</h2><div class="pair"><figure><figcaption>冻结设计 v2</figcaption><img src="design-v2-{name}.png" alt="{name}设计"></figure><figure><figcaption>正式App</figcaption><img src="actual-{name}.png" alt="{name}实页"></figure></div></article>' for name in freeze['states'])
extras = ''.join(f'<figure><figcaption>{html.escape(name)}</figcaption><img src="actual-{name}.png" alt="{name}"></figure>' for name in report['screens'] if name not in freeze['states'])
(out / 'comparison.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>文字导入：设计与实页</title><style>body{margin:24px;font:16px/1.7 system-ui;background:#f6f7f3;color:#203d31}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:20px}.pair{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0 0 20px}img{display:block;max-width:min(390px,90vw);height:auto;border:1px solid #dbe4d8}article{border-top:1px solid #dbe4d8;padding-top:12px}a{color:#246847}</style><main><h1>文字导入：核对后再存入</h1><p>首页确认文件身份和手机资料库去向，按需进入完整只读预览。返回与存入固定；文件夹是独立子层，返回保留原任务。</p><p>全部为未加工原图。接收页键盘路径保留原生标题焦点框，也记录了来自上一层的短暂浏览器触摸蓝块；触摸路径另有原图。测量对齐不等于像素完全相同。346px短视口不代表Android输入法或系统返回已验收。</p><p><a href="before/report.json">改前</a> · <a href="visual-comparison.json">11状态测量</a> · <a href="browser-report.json">8组专项</a> · <a href="contrast-review.json">对比度补查</a> · <a href="provenance.json">源码与服务</a> · <a href="research-sources.json">竞品依据</a> · <a href="design-freeze-v1.json">保留的v1</a> · <a href="design-freeze-v2.json">v2</a></p><article><h2>短屏改前／改后</h2><div class="pair"><figure><figcaption>改前：滚到动作时返回离开视口</figcaption><img src="before/short.png" alt="改前短屏"></figure><figure><figcaption>改后：相同浅色，接收入口复用任务框架</figcaption><img src="actual-received-short-review.png" alt="改后短屏"></figure></div></article>''' + cards + '<article><h2>实际状态补充</h2><div class="pair">' + extras + '</div></article><article><h2>浅色错误提示修正</h2><div class="pair"><figure><figcaption>首次失败</figcaption><img src="first-failure-light-warning-contrast.png" alt="首次对比度失败"></figure><figure><figcaption>修正后</figcaption><img src="actual-failed-review.png" alt="修正后错误提示"></figure></div></article></main></html>', encoding='utf-8')
for folder in (basic, Path('docs/evidence/mobile-0.1.0/text-import-browser-1793191503288')):
    (folder / '.gitignore').write_text('*\n', encoding='utf-8')
print(json.dumps({'screens': len(report['screens']), 'coordinates': sum(s['coordinates'] for s in comparison['states'].values()), 'maxCoordinateDelta': comparison['maxCoordinateDelta'], 'manualContrast': manual}))
