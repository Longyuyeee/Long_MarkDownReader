"""Preflight immutable references and final candidate identity, then preserve raw evidence."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import html
import json
import re
import shutil
import subprocess
import urllib.request
import zipfile

out = Path('docs/evidence/mobile-pack-record-read-2026-10-29')
runs = Path('docs/evidence/mobile-0.1.0')
inputs = {
    'browser': ('pack-record-read-1793259275032', 6),
    'export-layers': ('export-layers-browser-1793259184035', 11),
    'portable-pack': ('portable-pack-browser-1793259029916', 6),
    'source-retry': ('pack-source-retry-1793259029935', 6),
    'replies': ('pack-record-replies-1793259030114', 4),
    'source-replies': ('pack-source-replies-1793259030381', 4),
}
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
digest = lambda b: sha256(b).hexdigest()
assert not (out/'browser-report.json').exists(), 'Final evidence exists; create another version.'
copies, outputs, reports = [], {}, {}
for name, (folder, count) in inputs.items():
    p = runs/folder/'report.json'; r = read(p)
    assert r['passed'] and not r.get('failure') and not r.get('errors') and not r.get('externalRequests') and len(r['checks']) == count, name
    reports[name] = r; copies.append((p, out/(name+'-report.json')))
for name, folder in {'fixture-list-detail-isolation': 'pack-record-read-1793259029792', 'old-disabled-download': 'export-layers-browser-1793259030045'}.items():
    p = runs/folder
    assert read(p/'report.json').get('failure') and not read(p/'report.json').get('passed')
    copies.extend([(p/'report.json', out/('first-failure-'+name+'.json')), (p/'failure.png', out/('first-failure-'+name+'.png'))])
assert read(out/'before/report.json').get('failure') and not read(out/'before/report.json').get('captured')
assert read(out/'before-v2/report.json')['captured']
for version in range(1, 5):
    for file, expected in read(out/f'design-freeze-v{version}.json')['files'].items():
        assert digest(Path(file).read_bytes()) == expected, file
candidate, report, freeze = runs/inputs['browser'][0], reports['browser'], read(out/'design-freeze-v4.json')
assert len(report['screens']) == 13 and len(freeze['states']) == 10
for name in report['screens']:
    for suffix in ('.png', '-geometry.json'): copies.append((candidate/(name+suffix), out/('actual-'+name+suffix)))
comparison = {'scope': 'Ten states: all recorded names, coordinates, dimensions, font sizes, line heights and colors. Native keyboard focus is retained. No pixel-equality claim.', 'states': {}, 'maxCoordinateDelta': 0, 'differences': []}
for name, state in freeze['states'].items():
    expected, actual = state['geometry'], read(candidate/(name+'-geometry.json'))
    assert len(expected) == len(actual), name
    count = 0
    for a, b in zip(expected, actual):
        for key, value in a.items():
            if isinstance(value, (int, float)):
                comparison['maxCoordinateDelta'] = max(comparison['maxCoordinateDelta'], abs(value-b[key])); count += 1
            if value != b[key]: comparison['differences'].append([name, a['tag'], key, value, b[key]])
    comparison['states'][name] = {'elements': len(actual), 'coordinates': count}
assert not comparison['differences'], comparison['differences']
outputs['visual-comparison.json'] = comparison
prototype = Path('docs/design/mobile-pack-record-read-v4/PackRecordReadPrototype.vue').read_text(encoding='utf-8').replace("from '../../../src/mobile/", "from './")
assert prototype == Path('src/mobile/PortableExport.vue').read_text(encoding='utf-8')
outputs['prototype-runtime-match.json'] = {'matches': True, 'adaptations': ['Module import paths only']}
outputs['visual-review.json'] = {'rawFinalImagesViewedIndividually': report['screens'], 'baselineImagesViewed': ['list-failure', 'detail-failure', 'narrow-detail-failure', 'short-detail-failure', 'cached-list-lost'], 'designReview': 'All ten v1 PNGs viewed. Eight changed v2 PNGs viewed, two unchanged. Three changed v3 PNGs viewed, seven unchanged. One changed v4 PNG viewed, nine unchanged.', 'imageEdits': False, 'fontSubstitution': False}

def luminance(color):
    values = [int(v)/255 for v in re.findall(r'\d+', color)[:3]]
    values = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in values]
    return sum(a*b for a, b in zip(values, (.2126, .7152, .0722)))

manual = []
assert len(report['accessibility']) == 4
for scan in report['accessibility']:
    assert not scan['violations']
    for item in scan['incomplete']:
        assert item['id'] == 'color-contrast'
        for node in item['nodes']:
            for colors in node['colors']:
                background = colors.get('effectiveBackground', colors['background'])
                assert not background.startswith('rgba') and colors['opacity'] == '1'
                a, b = sorted([luminance(colors['foreground']), luminance(background)]); ratio = (b+.05)/(a+.05)
                assert ratio >= 3 and float(colors['fontSize'][:-2]) >= 24
                manual.append({'state': scan['name'], 'targets': node['targets'], 'reason': node['summary'], **colors, 'ratio': round(ratio, 3), 'required': 3})
assert len(manual) == 1
outputs['contrast-review.json'] = {'method': 'Preserve the axe overlap incomplete verbatim. Inspect raw short-list-failure PNG, record the transparent title and nearest painted ancestor background, and calculate WCAG contrast. This is a manual supplement, not an axe-resolved claim.', 'rawImage': 'actual-short-list-failure.png', 'checks': manual}

archives = []
for source, name in [(candidate/'retried.textpack', 'retried.textpack'), (runs/inputs['export-layers'][0]/'retried.textpack', 'legacy-retried.textpack'), (runs/inputs['portable-pack'][0]/'exported.textpack', 'legacy-exported.textpack')]:
    with zipfile.ZipFile(source) as archive:
        assert archive.testzip() is None
        members = {n: {'bytes': len(archive.read(n)), 'sha256': digest(archive.read(n))} for n in archive.namelist()}
        if name == 'retried.textpack':
            assert source.read_bytes() == Path('docs/evidence/mobile-pack-source-retry-2026-10-28/retried.textpack').read_bytes()
            assert archive.read('note.textbundle/assets/001-旅行路线与费用核对记录.bin') == bytes([0, 1, 255, 0])
    archives.append({'file': name, 'rawSha256': digest(source.read_bytes()), 'zipCrcPassed': True, 'members': members})
    copies.append((source, out/name))
outputs['archive-content-review.json'] = {'candidateEqualsPreviouslyProtectedWholeArchive': True, 'archives': archives, 'scope': 'Actual browser download after source-unavailable record retry; full protected archive byte equality plus independent ZIP/CRC and binary checks. Existing portable regression retains full clean/draft BOM and mixed CRLF/CR/LF assertions.'}
provenance = {'capturedAt': datetime.now(timezone.utc).isoformat(), 'baseHead': '6cbc5b500', 'candidate': str(candidate), 'files': {}, 'unchangedEngines': {}, 'servedAssets': {}}
for file in ['src/mobile/PortableExport.vue', 'src/mobile/MobileApp.vue', 'src/mobile/mobile.scss', 'scripts/capture-mobile-pack-record-read-baseline.mjs', 'scripts/freeze-mobile-pack-record-read-design.mjs', 'scripts/test-mobile-pack-record-read-browser.mjs', 'scripts/test-mobile-pack-record-replies-browser.mjs', 'scripts/finalize-mobile-pack-record-read-evidence.py', 'scripts/test-mobile-export-layers-browser.mjs', 'scripts/test-mobile-portable-pack-browser.mjs', 'scripts/test-mobile-pack-source-retry-browser.mjs', 'scripts/test-mobile-pack-source-replies-browser.mjs']:
    b = Path(file).read_bytes(); provenance['files'][file] = {'bytesSha256': digest(b), 'gitLfSha256': digest(b.replace(b'\r\n', b'\n'))}
for file in ['src/mobile/storage.ts', 'src/mobile/portablePack.ts', 'src/mobile/storedZip.ts', 'src/mobile/textExport.ts', 'src/mobile/taskPosition.ts', 'src/mobile/MobileEditor.vue', 'src/mobile/MobileConfirmation.vue', 'src/mobile/RecoveryCenter.vue', 'src/mobile/TextExport.vue', 'src-tauri/plugins/mobile-storage/android/src/main/java/StoragePlugin.kt']:
    b = Path(file).read_bytes().replace(b'\r\n', b'\n'); assert b == subprocess.check_output(['git', 'show', '6cbc5b500:'+file]), file
    provenance['unchangedEngines'][file] = digest(b)
app = subprocess.check_output(['git', 'show', '6cbc5b500:src/mobile/MobileApp.vue']).decode('utf-8')
app = app.replace("'pack-source-check-sheet':packPanel && packExportView?.sourceCheck,", "'pack-source-check-sheet':packPanel && packExportView?.sourceCheck,'pack-record-read-sheet':packPanel && packExportView?.recordTask,")
assert app == Path('src/mobile/MobileApp.vue').read_text(encoding='utf-8')
base_css = subprocess.check_output(['git', 'show', '6cbc5b500:src/mobile/mobile.scss']).decode('utf-8')
assert base_css+'\n'+Path('docs/design/mobile-pack-record-read-v4/task-shell.css').read_text(encoding='utf-8') == Path('src/mobile/mobile.scss').read_text(encoding='utf-8')
for label in ('replies', 'source-replies'): assert reports[label]['componentSha256'] == provenance['files']['src/mobile/PortableExport.vue']['bytesSha256']
for file in re.findall(r'(?:src|href)="(\./assets/[^\"]+)"', Path('dist/mobile.html').read_text(encoding='utf-8')):
    expected = Path('dist', file).read_bytes()
    with urllib.request.urlopen('http://127.0.0.1:9012/'+file.removeprefix('./'), timeout=10) as response: assert expected == response.read(), file
    provenance['servedAssets'][file] = digest(expected)
assert provenance['servedAssets']
outputs['provenance.json'] = provenance
outputs['research-sources.json'] = {'accessed': '2026-10-29', 'method': 'Official pages read via web open. No competitor installed or recorded. Fixed same-record retry, stale-list handling and local manifest cache are project choices verified locally.', 'sources': [
    {'title': 'Notion: Export your content', 'url': 'https://www.notion.com/help/export-your-content', 'finding': 'Mobile export starts from the page menu, chooses format and hands off to the phone share menu. Supports task entry and deliberate handoff, not private local record caching or exact Back/retry behavior.'},
    {'title': 'Obsidian: Mobile app', 'url': 'https://obsidian.md/help/mobile', 'finding': 'Mobile navigation supplies Back/Forward and menu access to desktop Ribbon actions. Unavailable navigation is greyed out. Supports contextual actions, not an inferred attachment-recovery UI.'},
    {'title': 'Acrobat mobile: Save a copy', 'url': 'https://helpx.adobe.com/acrobat/mobile/view-manage-files/save-copy.html', 'finding': 'Choose file location, then file action, then destination/name. Supports identifying the object before saving; does not prove this project record-read protocol.'}
]}
for source, target in copies: assert source.is_file() and source.stat().st_size, source

# Publish only after every input check succeeds.
for source, target in copies: shutil.copyfile(source, target)
for name, value in outputs.items(): (out/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
cards = ''.join(f'<article><h2>{html.escape(n)}</h2><div class="pair"><figure><figcaption>冻结设计 v4</figcaption><img src="design-v4-{n}.png" alt="{n}设计"></figure><figure><figcaption>正式App</figcaption><img src="actual-{n}.png" alt="{n}实页"></figure></div></article>' for n in freeze['states'])
extras = ''.join(f'<figure><figcaption>{html.escape(n)}</figcaption><img src="actual-{n}.png" alt="{n}"></figure>' for n in report['screens'] if n not in freeze['states'])
(out/'comparison.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>附件包记录读取：设计与实页</title><style>body{margin:24px;font:16px/1.7 system-ui;background:#f6f7f3;color:#203d31}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:20px}.pair{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0 0 20px}img{display:block;max-width:min(390px,90vw);height:auto;border:1px solid #dbe4d8}article{border-top:1px solid #dbe4d8;padding-top:12px}a{color:#246847}</style><main><h1>附件包记录暂时打不开：留在这份记录重试</h1><p>首次读取失败不显示假零记录；刷新失败保留旧列表，重读失败保留完整清单。固定一个主要动作，移除进入已有风险确认。短屏正文单独滚动，重试与返回恢复实际焦点。</p><p>10种设计与13张实页已审阅，名称、布局、字号和颜色差异为0；原图未加工，保留焦点，不声明整图像素相同。29组浏览器、8组延迟回复通过。四次新专项axe无违规；短屏标题一处背景重叠未决已人工补查。浏览器和注入回复不代表Android系统返回、IME、SAF、授权、TalkBack或进程恢复验收。</p><p><a href="before-v2/report.json">改前实测</a> · <a href="before/report.json">初次环境连接失败</a> · <a href="visual-comparison.json">设计核对</a> · <a href="browser-report.json">6组专项</a> · <a href="replies-report.json">记录延迟回复</a> · <a href="archive-content-review.json">完整归档</a> · <a href="contrast-review.json">颜色补查</a> · <a href="provenance.json">源码与服务</a> · <a href="research-sources.json">竞品依据</a></p><article><h2>改前／改后</h2><div class="pair"><figure><figcaption>改前：读取失败仍显示0条</figcaption><img src="before-v2/list-failure.png" alt="改前列表读取失败"></figure><figure><figcaption>改后：准确失败与固定重读</figcaption><img src="actual-list-failure.png" alt="改后列表读取失败"></figure><figure><figcaption>改前：再次读取失败清空清单</figcaption><img src="before-v2/cached-list-lost.png" alt="改前清单消失"></figure><figure><figcaption>改后：保留上次核对的完整清单</figcaption><img src="actual-cached-detail-failure.png" alt="改后完整清单保留"></figure></div></article>''' + cards + '<article><h2>空列表、深列表与缓存滚动</h2><div class="pair">'+extras+'</div></article></main></html>', encoding='utf-8')
(runs/inputs['portable-pack'][0]/'.gitignore').write_text('*\n', encoding='utf-8')
print(json.dumps({'states': len(freeze['states']), 'screens': len(report['screens']), 'maxCoordinateDelta': comparison['maxCoordinateDelta'], 'browserGroups': 29, 'injectedGroups': 8, 'manualContrast': manual}))
