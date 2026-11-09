"""Preserve unedited captures and verify design, source and served candidate identity."""
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

out = Path('docs/evidence/mobile-recovery-read-2026-10-28')
candidate, layers, write, replies = map(Path, sys.argv[1:5])
assert not (out/'browser-report.json').exists(), 'Final evidence exists; create a new version.'
for folder in (candidate, layers, write, replies):
    assert (folder/'report.json').is_file(), f'Missing input report: {folder}'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
digest = lambda b: sha256(b).hexdigest()


def save(name, value):
    (out/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


for version in (1, 2):
    for file, expected in read(out/f'design-freeze-v{version}.json')['files'].items():
        assert digest(Path(file).read_bytes()) == expected, file
for name, folder, count in [('browser', candidate, 8), ('recovery-layers', layers, 9), ('write-recovery', write, 6), ('replies', replies, 3)]:
    result = read(folder/'report.json')
    assert result['passed'] and not result.get('failure') and not result.get('errors') and len(result['checks']) == count, name
    save(name+'-report.json', result)
report = read(candidate/'report.json')
assert len(report['accessibility']) == 5 and all(not s['violations'] for s in report['accessibility'])
for name in report['screens']:
    for suffix in ('.png', '-geometry.json'):
        shutil.copyfile(candidate/(name+suffix), out/('actual-'+name+suffix))
failures = {'task-lifetime-assumption': 'recovery-read-1793195609401', 'old-global-recent': 'write-recovery-browser-1793195660484', 'old-return-label': 'write-recovery-browser-1793195823901'}
for name, folder in failures.items():
    p = Path('docs/evidence/mobile-0.1.0')/folder
    save('first-failure-'+name+'.json', read(p/'report.json'))
    if (p/'failure.png').exists():
        shutil.copyfile(p/'failure.png', out/('first-failure-'+name+'.png'))

freeze = read(out/'design-freeze-v2.json')
comparison = {'scope': '12 states: coordinates, dimensions, visible names, font sizes, line heights and colors. Native keyboard focus is retained; no pixel-equality claim.', 'states': {}, 'maxCoordinateDelta': 0, 'differences': []}
for name, state in freeze['states'].items():
    expected, actual = state['geometry'], read(candidate/(name+'-geometry.json'))
    assert len(expected) == len(actual), name
    count = 0
    for a, b in zip(expected, actual):
        for key, value in a.items():
            if isinstance(value, (int, float)):
                delta = abs(value-b[key]); count += 1
                comparison['maxCoordinateDelta'] = max(comparison['maxCoordinateDelta'], delta)
                if delta > .1:
                    comparison['differences'].append([name, a['tag'], key, value, b[key]])
            elif value != b[key]:
                comparison['differences'].append([name, a['tag'], key, value, b[key]])
    comparison['states'][name] = {'elements': len(actual), 'coordinates': count}
save('visual-comparison.json', comparison)
assert not comparison['differences'], comparison['differences']

prototype = Path('docs/design/mobile-recovery-read-v2/RecoveryReadPrototype.vue').read_text(encoding='utf-8').replace("from '../../../src/mobile/", "from './")
prototype = prototype.replace(' ref="errorElement"', '').replace(' ref="readErrorElement"', '').replace(', errorElement = ref<HTMLElement>(), readErrorElement = ref<HTMLElement>()', '')
prototype = prototype.replace('entries.value = entries.value.map(entry => entry.id === id ? { ...entry, ...result } : entry)', 'entries.value = entries.value.map(entry => entry.id === id ? { id: result.id, relativePath: result.relativePath, libraryName: result.libraryName, created: result.created, hasOriginal: result.hasOriginal, readable: result.readable, purpose: result.purpose } : entry)')
assert prototype == Path('src/mobile/RecoveryCenter.vue').read_text(encoding='utf-8')
save('prototype-runtime-match.json', {'matches': True, 'adaptations': ['Module import paths', 'Remove two unused bindings and static Vue refs, with no rendered layout/focus change', 'List cache stores summary fields instead of retaining full candidate/original content after Back']})

provenance = {'capturedAt': datetime.now(timezone.utc).isoformat(), 'baseHead': '4c9a3ab51', 'candidate': str(candidate), 'files': {}, 'unchangedEngines': {}, 'servedAssets': {}}
for file in ['src/mobile/RecoveryCenter.vue', 'src/mobile/MobileApp.vue', 'src/mobile/mobile.scss', 'scripts/test-mobile-recovery-read-browser.mjs', 'scripts/test-mobile-recovery-read-replies-browser.mjs', 'scripts/test-mobile-recovery-layers-browser.mjs', 'scripts/test-mobile-write-recovery-browser.mjs']:
    b = Path(file).read_bytes()
    provenance['files'][file] = {'bytesSha256': digest(b), 'gitLfSha256': digest(b.replace(b'\r\n', b'\n'))}
for file in ['src/mobile/storage.ts', 'src/mobile/RecoverySource.vue', 'src/mobile/SourceReader.vue', 'src/mobile/taskPosition.ts', 'src/mobile/TextExport.vue', 'src/mobile/ImageAttachments.vue', 'src-tauri/plugins/mobile-storage/android/src/main/java/StoragePlugin.kt']:
    b = Path(file).read_bytes().replace(b'\r\n', b'\n')
    assert b == subprocess.check_output(['git', 'show', '4c9a3ab51:'+file]), file
    provenance['unchangedEngines'][file] = digest(b)
for file in re.findall(r'(?:src|href)="(\./assets/[^\"]+)"', Path('dist/mobile.html').read_text(encoding='utf-8')):
    expected = Path('dist', file).read_bytes()
    with urllib.request.urlopen('http://127.0.0.1:9012/'+file.removeprefix('./'), timeout=10) as response:
        served = response.read()
    assert expected == served, file
    provenance['servedAssets'][file] = digest(expected)
save('provenance.json', provenance)
assert read(replies/'report.json')['componentSha256'] == provenance['files']['src/mobile/RecoveryCenter.vue']['bytesSha256']
previous = Path('docs/evidence/mobile-0.1.0/recovery-read-1793195823886')
save('visual-review-reuse.json', {'previouslyViewed': str(previous), 'identicalRawImages': [n for n in report['screens'] if (candidate/(n+'.png')).read_bytes() == (previous/(n+'.png')).read_bytes()], 'changedImages': [n for n in report['screens'] if (candidate/(n+'.png')).read_bytes() != (previous/(n+'.png')).read_bytes()], 'designV2': 'Eleven PNGs equal v1; the changed unknown-record title was separately viewed.'})


def luminance(color):
    c = [int(v)/255 for v in re.findall(r'\d+', color)[:3]]
    c = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in c]
    return sum(a*b for a, b in zip(c, (.2126, .7152, .0722)))


manual = []
for scan in report['accessibility']:
    for item in scan['incomplete']:
        assert item['id'] == 'color-contrast'
        for node in item['nodes']:
            for colors in node['colors']:
                a, b = sorted([luminance(colors['foreground']), luminance(colors['background'])])
                ratio = (b+.05)/(a+.05)
                assert ratio >= 3 and float(colors['fontSize'][:-2]) >= 24 and colors['opacity'] == '1'
                manual.append({'state': scan['name'], 'targets': node['targets'], 'reason': node['summary'], **colors, 'ratio': round(ratio, 3), 'required': 3})
assert len(manual) == 1
save('contrast-review.json', {'method': 'Retain the axe incomplete overlap report verbatim. Inspect raw short-failure PNG and calculate WCAG luminance from computed foreground/background. This is a manual supplement, not an axe-resolved claim.', 'checks': manual, 'rawImage': 'actual-short-failure.png'})
save('research-sources.json', {'accessed': '2026-10-28', 'method': 'Official pages read through web search/open; no competitor installed or recorded. Same-ID retry, fixed footer and Back details are project design judgments.', 'sources': [
    {'title': 'Notion: Delete and restore content', 'url': 'https://www.notion.com/help/duplicate-delete-and-restore-content', 'finding': 'On iOS and Android, Trash is reached through the sidebar menu; a deleted page can be opened to inspect its content before restoration. This supports contextual entry and inspection, not the private recovery protocol here.'},
    {'title': 'Joplin: Note History', 'url': 'https://joplinapp.org/help/apps/note_history/', 'finding': 'Revisions are retained across apps, but viewing is documented as desktop-only. Restoring copies into Restored Notes without replacing the current note. This supports independent-copy safety only; it is not evidence of mobile history UI.'}
]})
cards = ''.join(f'<article><h2>{html.escape(n)}</h2><div class="pair"><figure><figcaption>冻结设计 v2</figcaption><img src="design-v2-{n}.png" alt="{n}设计"></figure><figure><figcaption>正式App</figcaption><img src="actual-{n}.png" alt="{n}实页"></figure></div></article>' for n in freeze['states'])
extras = ''.join(f'<figure><figcaption>{html.escape(n)}</figcaption><img src="actual-{n}.png" alt="{n}"></figure>' for n in report['screens'] if n not in freeze['states'])
(out/'comparison.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>恢复记录读取：设计与实页</title><style>body{margin:24px;font:16px/1.7 system-ui;background:#f6f7f3;color:#203d31}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:20px}.pair{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0 0 20px}img{display:block;max-width:min(390px,90vw);height:auto;border:1px solid #dbe4d8}article{border-top:1px solid #dbe4d8;padding-top:12px}a{color:#246847}</style><main><h1>恢复记录读取失败：留在这次核对</h1><p>首次失败保留文件摘要和原编号，底部固定重读。不可读摘要仍可进入任务；缓存列表与完整版本保留，各自错误分别处理。读取不改原文或草稿。</p><p>原图未加工，键盘焦点保留。短屏标题有一处axe重叠未决，已补查原图和计算颜色。浏览器短视口与延迟回复组件不代表Android返回、IME、SAF、TalkBack或后台恢复验收。</p><p><a href="before/report.json">改前实测</a> · <a href="visual-comparison.json">12状态核对</a> · <a href="browser-report.json">8组专项</a> · <a href="replies-report.json">延迟回复</a> · <a href="contrast-review.json">对比度补查</a> · <a href="provenance.json">源码与服务</a> · <a href="research-sources.json">竞品依据</a></p><article><h2>改前／改后</h2><div class="pair"><figure><figcaption>改前：详情失败回到列表，只能刷新列表</figcaption><img src="before/detail-failure.png" alt="改前详情失败"></figure><figure><figcaption>改后：仍是这份文件，可原地重读</figcaption><img src="actual-detail-failure.png" alt="改后详情失败"></figure></div></article>''' + cards + '<article><h2>实际状态补充</h2><div class="pair">' + extras + '</div></article></main></html>', encoding='utf-8')
for folder in [write, Path('docs/evidence/mobile-0.1.0/write-recovery-browser-1793195660484'), Path('docs/evidence/mobile-0.1.0/write-recovery-browser-1793195823901'), Path('docs/evidence/mobile-0.1.0/write-recovery-browser-1793195923588')]:
    (folder/'.gitignore').write_text('*\n', encoding='utf-8')
print(json.dumps({'screens': len(report['screens']), 'coordinates': sum(s['coordinates'] for s in comparison['states'].values()), 'maxCoordinateDelta': comparison['maxCoordinateDelta'], 'manualContrast': manual}))
