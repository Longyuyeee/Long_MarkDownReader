"""Preflight frozen designs, raw reports, production sources and archive bytes before publication."""
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

out = Path('docs/evidence/mobile-pack-source-retry-2026-10-28')
runs = Path('docs/evidence/mobile-0.1.0')
inputs = {
    'browser': ('pack-source-retry-1793200339512', 6),
    'export-layers': ('export-layers-browser-1793200280936', 11),
    'portable-pack': ('portable-pack-browser-1793200280946', 6),
    'replies': ('pack-source-replies-1793200281069', 4),
}
failures = {
    'editor-fixture-api': 'pack-source-retry-1793199681757',
    'light-warning-contrast': 'pack-source-retry-1793199757019',
    'history-trigger-unmounted': 'pack-source-retry-1793199900995',
    'keyboard-scroll-before-frame': 'pack-source-retry-1793200280931',
    'fixture-sandbox-frame': 'pack-source-retry-1793200310821',
}
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
digest = lambda b: sha256(b).hexdigest()
assert not (out/'browser-report.json').exists(), 'Evidence exists; create a new version.'
copies, outputs, results = [], {}, {}
for name, (folder, count) in inputs.items():
    p = runs/folder/'report.json'; result = read(p)
    assert result['passed'] and not result.get('failure') and not result.get('errors') and not result.get('externalRequests') and len(result['checks']) == count, name
    copies.append((p, out/(name+'-report.json'))); results[name] = result
for name, folder in failures.items():
    p = runs/folder
    assert read(p/'report.json').get('failure') and not read(p/'report.json').get('passed'), name
    for source, target in [(p/'report.json', out/('first-failure-'+name+'.json')), (p/'failure.png', out/('first-failure-'+name+'.png'))]:
        copies.append((source, target))
for v in range(1, 6):
    for file, expected in read(out/f'design-freeze-v{v}.json')['files'].items():
        assert digest(Path(file).read_bytes()) == expected, file
candidate = runs/inputs['browser'][0]
report, freeze = results['browser'], read(out/'design-freeze-v5.json')
assert len(report['screens']) == 12 and len(freeze['states']) == 10
for name in report['screens']:
    for suffix in ('.png', '-geometry.json'):
        copies.append((candidate/(name+suffix), out/('actual-'+name+suffix)))
comparison = {'scope': 'Ten states: every recorded element name, coordinate, dimension, font size, line height and color. Native keyboard focus is retained. No pixel-equality claim.', 'states': {}, 'maxCoordinateDelta': 0, 'differences': []}
for name, state in freeze['states'].items():
    expected, actual = state['geometry'], read(candidate/(name+'-geometry.json'))
    assert len(expected) == len(actual), name
    count = 0
    for a, b in zip(expected, actual):
        for key, value in a.items():
            if isinstance(value, (int, float)):
                delta = abs(value-b[key]); count += 1
                comparison['maxCoordinateDelta'] = max(comparison['maxCoordinateDelta'], delta)
            if value != b[key]: comparison['differences'].append([name, a['tag'], key, value, b[key]])
    comparison['states'][name] = {'elements': len(actual), 'coordinates': count}
assert not comparison['differences'], comparison['differences']
outputs['visual-comparison.json'] = comparison
prototype = Path('docs/design/mobile-pack-source-retry-v5/PackSourcePrototype.vue').read_text(encoding='utf-8').replace("from '../../../src/mobile/", "from './")
assert prototype == Path('src/mobile/PortableExport.vue').read_text(encoding='utf-8')
outputs['prototype-runtime-match.json'] = {'matches': True, 'adaptations': ['Module import paths only']}
previous = runs/'pack-source-retry-1793200045416'
reused = ['source-failure', 'history', 'history-return', 'waiting']
for name in reused: assert (previous/(name+'.png')).read_bytes() == (candidate/(name+'.png')).read_bytes()
outputs['visual-review.json'] = {'rawImagesReviewed': report['screens'], 'previouslyViewedIdentical': {'run': str(previous), 'images': reused}, 'newFinalImagesViewed': [n for n in report['screens'] if n not in reused], 'baselineImagesViewed': ['source-failure', 'narrow-source-failure', 'short-source-failure', 'download-failure'], 'designReview': 'v1: all nine viewed. v2: seven changed images viewed, two unchanged. v3: five changed images viewed, four unchanged. v4: all nine identical to v3. v5: prepared and added download-failure viewed, eight identical to v4.', 'imageEdits': False}

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
                a, b = sorted([luminance(colors['foreground']), luminance(colors['background'])]); ratio = (b+.05)/(a+.05)
                assert ratio >= 4.5 and colors['opacity'] == '1'
                manual.append({'state': scan['name'], 'targets': node['targets'], 'reason': node['summary'], **colors, 'ratio': round(ratio, 3), 'required': 4.5})
assert len(manual) == 2
outputs['contrast-review.json'] = {'method': 'Preserve both axe overlap incomplete reports verbatim. Inspect the raw source-failure and download-failure images and compute WCAG contrast from recorded styles. This is a manual supplement, not an axe-resolved claim.', 'checks': manual}

archive_review = []
for source, name in [(candidate/'retried.textpack', 'retried.textpack'), (runs/inputs['portable-pack'][0]/'exported.textpack', 'legacy-exported.textpack'), (runs/inputs['export-layers'][0]/'retried.textpack', 'legacy-retried.textpack')]:
    with zipfile.ZipFile(source) as archive:
        assert archive.testzip() is None
        members = {n: {'bytes': len(archive.read(n)), 'sha256': digest(archive.read(n))} for n in archive.namelist()}
        if name == 'retried.textpack':
            assert archive.read('note.textbundle/assets/001-旅行路线与费用核对记录.bin') == bytes([0, 1, 255, 0])
            text = archive.read('note.textbundle/text.markdown').decode('utf-8')
            assert '未保存的想法😀' in text and '\ufeff# 行程笔记😀' in text and 'assets/001-' in text
    archive_review.append({'file': name, 'rawSha256': digest(source.read_bytes()), 'zipCrcPassed': True, 'members': members})
    copies.append((source, out/name))
outputs['archive-content-review.json'] = {'archives': archive_review, 'fullContentAssertions': 'Browser source test compares the entire rewritten captured draft, not a text fragment, plus exact protected archive identity and binary bytes. Existing portable regression covers clean source BOM and mixed CRLF/CR/LF without draft creation. No archive engines changed.'}

provenance = {'capturedAt': datetime.now(timezone.utc).isoformat(), 'baseHead': '7d9363e31', 'candidate': str(candidate), 'files': {}, 'unchangedEngines': {}, 'servedAssets': {}}
for file in ['src/mobile/PortableExport.vue', 'src/mobile/MobileApp.vue', 'src/mobile/mobile.scss', 'scripts/capture-mobile-pack-source-baseline.mjs', 'scripts/freeze-mobile-pack-source-retry-design.mjs', 'scripts/test-mobile-pack-source-retry-browser.mjs', 'scripts/test-mobile-pack-source-replies-browser.mjs', 'scripts/finalize-mobile-pack-source-retry-evidence.py', 'scripts/test-mobile-export-layers-browser.mjs', 'scripts/test-mobile-portable-pack-browser.mjs']:
    b = Path(file).read_bytes(); provenance['files'][file] = {'bytesSha256': digest(b), 'gitLfSha256': digest(b.replace(b'\r\n', b'\n'))}
for file in ['src/mobile/storage.ts', 'src/mobile/portablePack.ts', 'src/mobile/storedZip.ts', 'src/mobile/textExport.ts', 'src/mobile/taskPosition.ts', 'src/mobile/MobileEditor.vue', 'src/mobile/MobileConfirmation.vue', 'src/mobile/TextExport.vue', 'src/mobile/RecoveryCenter.vue', 'src-tauri/plugins/mobile-storage/android/src/main/java/StoragePlugin.kt']:
    b = Path(file).read_bytes().replace(b'\r\n', b'\n')
    assert b == subprocess.check_output(['git', 'show', '7d9363e31:'+file]), file
    provenance['unchangedEngines'][file] = digest(b)
app = subprocess.check_output(['git', 'show', '7d9363e31:src/mobile/MobileApp.vue']).decode('utf-8')
app = app.replace("'text-export-sheet':!!exportSnapshot,", "'text-export-sheet':!!exportSnapshot,'pack-source-check-sheet':packPanel && packExportView?.sourceCheck,").replace(":aria-label=\"exportSnapshot?textExportView?.backLabel||'返回文档':", ":aria-label=\"exportSnapshot?textExportView?.backLabel||'返回文档':packPanel&&packExportView?.sourceCheck?'返回文档':")
assert app == Path('src/mobile/MobileApp.vue').read_text(encoding='utf-8')
base_css = subprocess.check_output(['git', 'show', '7d9363e31:src/mobile/mobile.scss']).decode('utf-8')
assert base_css+'\n'+Path('docs/design/mobile-pack-source-retry-v5/task-shell.css').read_text(encoding='utf-8') == Path('src/mobile/mobile.scss').read_text(encoding='utf-8')
assert results['replies']['componentSha256'] == provenance['files']['src/mobile/PortableExport.vue']['bytesSha256']
for file in re.findall(r'(?:src|href)="(\./assets/[^\"]+)"', Path('dist/mobile.html').read_text(encoding='utf-8')):
    expected = Path('dist', file).read_bytes()
    with urllib.request.urlopen('http://127.0.0.1:9012/'+file.removeprefix('./'), timeout=10) as response: assert expected == response.read(), file
    provenance['servedAssets'][file] = digest(expected)
assert provenance['servedAssets']
outputs['provenance.json'] = provenance
outputs['research-sources.json'] = {'accessed': '2026-10-28', 'method': 'Official pages read through web open; competitors not installed or recorded. Fixed retry, snapshot retention and exact Back behavior are project judgments verified locally.', 'sources': [
    {'title': 'Adobe Acrobat mobile: Save a copy', 'url': 'https://helpx.adobe.com/acrobat/mobile/view-manage-files/save-copy.html', 'finding': 'Android/iOS start from Files and location, then file menu and Save a copy, then select the destination and name. This supports contextual task entry and destination decisions, not private package recovery protocols.'},
    {'title': 'Obsidian: Mobile app', 'url': 'https://obsidian.md/help/mobile', 'finding': 'Mobile has navigation Back/Forward and menu access for Ribbon actions; unavailable navigation is greyed out. This supports contextual navigation rather than listing all desktop actions.'},
    {'title': 'Obsidian: Attachments', 'url': 'https://obsidian.md/help/attachments', 'finding': 'Attachments are ordinary files; their location may be the vault, specified folder or a folder next to the note. Source location must remain understandable. This is not evidence of a mobile attachment export retry UI.'},
    {'title': 'Joplin: Importing and exporting', 'url': 'https://joplinapp.org/help/apps/import_export/', 'finding': 'JEX is a lossless archive format for notes/metadata. Page does not specify the exact mobile export, cancellation or retry UI; no such mobile claim is made.'}
]}
for source, target in copies: assert source.is_file() and source.stat().st_size, source

# Publish only after all reports, freezes, source and archive checks pass.
for source, target in copies: shutil.copyfile(source, target)
for name, value in outputs.items(): (out/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
cards = ''.join(f'<article><h2>{html.escape(n)}</h2><div class="pair"><figure><figcaption>冻结设计 v5</figcaption><img src="design-v5-{n}.png" alt="{n}设计"></figure><figure><figcaption>正式App</figcaption><img src="actual-{n}.png" alt="{n}实页"></figure></div></article>' for n in freeze['states'])
extras = ''.join(f'<figure><figcaption>{html.escape(n)}</figcaption><img src="actual-{n}.png" alt="{n}"></figure>' for n in report['screens'] if n not in freeze['states'])
(out/'comparison.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>导出附件检查：设计与实页</title><style>body{margin:24px;font:16px/1.7 system-ui;background:#f6f7f3;color:#203d31}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:20px}.pair{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0 0 20px}img{display:block;max-width:min(390px,90vw);height:auto;border:1px solid #dbe4d8}article{border-top:1px solid #dbe4d8;padding-top:12px}a{color:#246847}</style><main><h1>导出前检查附件：失败后留在这份笔记</h1><p>源笔记身份、准确缺失路径、固定重试与按需历史。短屏大字下正文单独滚动，返回历史恢复真实按钮和非零滚动。继续保护原文、草稿与已保留附件包。</p><p>10种参考与12张实页，布局、名称、字号和颜色差异为0；保留真实焦点，不声明整图像素相同。23组浏览器、4组延迟回复通过。4次专项axe无违规；两处背景重叠未决保留并人工核算颜色。浏览器与注入回复不代表Android系统返回、IME、SAF、授权、TalkBack或后台恢复验收。</p><p><a href="before/report.json">改前实测</a> · <a href="visual-comparison.json">设计核对</a> · <a href="browser-report.json">6组专项</a> · <a href="replies-report.json">延迟回复</a> · <a href="archive-content-review.json">完整包与ZIP检查</a> · <a href="contrast-review.json">对比度补查</a> · <a href="provenance.json">源码与服务</a> · <a href="research-sources.json">竞品依据</a></p><article><h2>改前／改后</h2><div class="pair"><figure><figcaption>改前：重试位于正文</figcaption><img src="before/source-failure.png" alt="改前检查失败"></figure><figure><figcaption>改后：清楚身份与固定重试</figcaption><img src="actual-source-failure.png" alt="改后检查失败"></figure><figure><figcaption>改前：短屏大字滚动后</figcaption><img src="before/short-source-failure.png" alt="改前短屏"></figure><figure><figcaption>改后：返回和重试固定，正文独立滚动</figcaption><img src="actual-short-source-failure.png" alt="改后短屏"></figure></div></article>''' + cards + '<article><h2>真实键盘与历史返回</h2><div class="pair">'+extras+'</div></article></main></html>', encoding='utf-8')
for folder in ['portable-pack-browser-1793199681755', 'portable-pack-browser-1793199900994', 'portable-pack-browser-1793200045442', 'portable-pack-browser-1793200280946']:
    (runs/folder/'.gitignore').write_text('*\n', encoding='utf-8')
print(json.dumps({'states': len(freeze['states']), 'screens': len(report['screens']), 'maxCoordinateDelta': comparison['maxCoordinateDelta'], 'browserGroups': 23, 'injectedGroups': 4, 'manualContrast': manual}))
