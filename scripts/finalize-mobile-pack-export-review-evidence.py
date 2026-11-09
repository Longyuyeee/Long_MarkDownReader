"""Validate the final app/fixture distinction, immutable designs, archive bytes and source identity."""
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

out = Path('docs/evidence/mobile-pack-export-review-2026-10-29')
runs = Path('docs/evidence/mobile-0.1.0')
inputs = {
    'browser': ('pack-export-review-1793261656694', 6),
    'replies': ('pack-export-review-replies-1793261657132', 4),
    'export-layers': ('export-layers-browser-1793261656434', 11),
    'portable-pack': ('portable-pack-browser-1793261656362', 6),
    'source-retry': ('pack-source-retry-1793261763351', 6),
    'source-replies': ('pack-source-replies-1793261763543', 4),
    'record-read': ('pack-record-read-1793261763376', 6),
    'record-replies': ('pack-record-replies-1793261763615', 4),
}
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
digest = lambda b: sha256(b).hexdigest()
assert not (out/'browser-report.json').exists(), 'Final evidence exists; create a new version.'
copies, reports, outputs = [], {}, {}
for name, (folder, count) in inputs.items():
    p = runs/folder/'report.json'; r = read(p)
    assert r['passed'] and not r.get('failure') and not r.get('errors') and not r.get('externalRequests') and len(r['checks']) == count, name
    reports[name] = r; copies.append((p, out/(name+'-report.json')))
for name, folder in {'editor-session-revision-assumption': 'pack-export-review-1793261014231', 'result-trigger-unmounted': 'export-layers-browser-1793261356542'}.items():
    p = runs/folder
    assert read(p/'report.json').get('failure') and not read(p/'report.json').get('passed')
    copies.extend([(p/'report.json', out/('first-failure-'+name+'.json')), (p/'failure.png', out/('first-failure-'+name+'.png'))])
assert read(out/'before/report.json')['captured']
for version in range(1, 5):
    for file, expected in read(out/f'design-freeze-v{version}.json')['files'].items(): assert digest(Path(file).read_bytes()) == expected, file
candidate, component = runs/inputs['browser'][0], runs/inputs['replies'][0]
report, freeze = reports['browser'], read(out/'design-freeze-v4.json')
assert len(report['screens']) == 16 and len(freeze['states']) == 14
for name in report['screens']:
    for suffix in ('.png', '-geometry.json'): copies.append((candidate/(name+suffix), out/('actual-'+name+suffix)))
for suffix in ('.png', '-geometry.json'): copies.append((component/('native-cancelled'+suffix), out/('component-native-cancelled'+suffix)))
comparison = {'scope': '13 browser-App states plus one explicitly injected native cancellation component state; all recorded visible names, coordinates, dimensions, font sizes, line heights and colors. No Android UI or pixel-equality claim.', 'states': {}, 'maxCoordinateDelta': 0, 'differences': []}
for name, state in freeze['states'].items():
    folder = component if state['kind'] == 'injected-native-component' else candidate
    expected, actual = state['geometry'], read(folder/(name+'-geometry.json'))
    assert len(expected) == len(actual), name
    count = 0
    for a, b in zip(expected, actual):
        for key, value in a.items():
            if isinstance(value, (int, float)):
                comparison['maxCoordinateDelta'] = max(comparison['maxCoordinateDelta'], abs(value-b[key])); count += 1
            if value != b[key]: comparison['differences'].append([name, a['tag'], key, value, b[key]])
    comparison['states'][name] = {'kind': state['kind'], 'elements': len(actual), 'coordinates': count}
assert not comparison['differences'], comparison['differences']
outputs['visual-comparison.json'] = comparison
prototype = Path('docs/design/mobile-pack-export-review-v4/PackExportReviewPrototype.vue').read_text(encoding='utf-8').replace("from '../../../src/mobile/", "from './")
assert prototype == Path('src/mobile/PortableExport.vue').read_text(encoding='utf-8')
outputs['prototype-runtime-match.json'] = {'matches': True, 'adaptations': ['Module import paths only']}
outputs['visual-review.json'] = {'browserRawImagesViewedIndividually': report['screens'], 'injectedNativeComponentImageViewed': 'native-cancelled', 'baselineImagesViewed': ['review', 'failure', 'success', 'short-success'], 'designReview': 'All 13 v1 PNGs viewed. Seven changed v2 PNGs viewed, six unchanged. v3 adds removed-result, viewed; preceding 13 identical to v2. All 14 v4 images identical to v3.', 'imageEdits': False, 'fontSubstitution': False, 'nativeAndroidTest': False}

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
                background = colors['effectiveBackground']; assert not background.startswith('rgba') and colors['opacity'] == '1'
                a, b = sorted([luminance(colors['foreground']), luminance(background)]); ratio = (b+.05)/(a+.05)
                assert ratio >= 4.5
                manual.append({'state': scan['name'], 'targets': node['targets'], 'reason': node['summary'], **colors, 'ratio': round(ratio, 3), 'required': 4.5})
assert len(manual) == 1
outputs['contrast-review.json'] = {'method': 'Retain the axe overlap incomplete verbatim. Inspect raw result-failure image and calculate contrast from the recorded foreground and painted ancestor. This is a manual supplement, not an axe-resolved claim.', 'rawImage': 'actual-result-failure.png', 'checks': manual}
archives = []
expected_text = '未保存的想法😀\r\n\ufeff# 行程笔记😀\r\n[费用](<assets/001-cost.bin>)\r尾行\n'.encode('utf-8')
for source, name in [(candidate/'complete.textpack', 'complete.textpack'), (candidate/'record-retry.textpack', 'record-retry.textpack'), (candidate/'short-complete.textpack', 'short-complete.textpack'), (runs/inputs['export-layers'][0]/'retried.textpack', 'legacy-retried.textpack'), (runs/inputs['portable-pack'][0]/'exported.textpack', 'legacy-exported.textpack')]:
    with zipfile.ZipFile(source) as archive:
        assert archive.testzip() is None
        members = {n: {'bytes': len(archive.read(n)), 'sha256': digest(archive.read(n))} for n in archive.namelist()}
        if name in ('complete.textpack', 'record-retry.textpack', 'short-complete.textpack'):
            assert archive.read('note.textbundle/text.markdown') == expected_text
            assert archive.read('note.textbundle/assets/001-cost.bin') == bytes([0, 1, 255, 0])
            assert source.read_bytes() == (candidate/'complete.textpack').read_bytes()
    archives.append({'file': name, 'rawSha256': digest(source.read_bytes()), 'zipCrcPassed': True, 'members': members})
    copies.append((source, out/name))
outputs['archive-content-review.json'] = {'currentHistoryAndShortDownloadsByteIdentical': True, 'wholePreparedTextMatches': True, 'BOM': True, 'mixedCRLF_CR_LF': True, 'emoji': True, 'binaryExact': True, 'archives': archives}
provenance = {'capturedAt': datetime.now(timezone.utc).isoformat(), 'baseHead': '1b2e93e52', 'candidate': str(candidate), 'componentFixture': str(component), 'files': {}, 'unchangedEngines': {}, 'servedAssets': {}}
for file in ['src/mobile/PortableExport.vue', 'src/mobile/MobileApp.vue', 'src/mobile/mobile.scss', 'scripts/capture-mobile-pack-export-review-baseline.mjs', 'scripts/freeze-mobile-pack-export-review-design.mjs', 'scripts/mobile-pack-navigation.mjs', 'scripts/test-mobile-pack-export-review-browser.mjs', 'scripts/test-mobile-pack-export-review-replies-browser.mjs', 'scripts/finalize-mobile-pack-export-review-evidence.py', 'scripts/test-mobile-export-layers-browser.mjs', 'scripts/test-mobile-portable-pack-browser.mjs', 'scripts/test-mobile-pack-source-retry-browser.mjs', 'scripts/test-mobile-pack-source-replies-browser.mjs', 'scripts/test-mobile-pack-record-read-browser.mjs', 'scripts/test-mobile-pack-record-replies-browser.mjs']:
    b = Path(file).read_bytes(); provenance['files'][file] = {'bytesSha256': digest(b), 'gitLfSha256': digest(b.replace(b'\r\n', b'\n'))}
for file in ['src/mobile/storage.ts', 'src/mobile/portablePack.ts', 'src/mobile/storedZip.ts', 'src/mobile/textExport.ts', 'src/mobile/taskPosition.ts', 'src/mobile/RecoverySource.vue', 'src/mobile/SourceReader.vue', 'src/mobile/MobileEditor.vue', 'src/mobile/MobileConfirmation.vue', 'src/mobile/RecoveryCenter.vue', 'src/mobile/TextExport.vue', 'src-tauri/plugins/mobile-storage/android/src/main/java/StoragePlugin.kt']:
    b = Path(file).read_bytes().replace(b'\r\n', b'\n'); assert b == subprocess.check_output(['git', 'show', '1b2e93e52:'+file]), file
    provenance['unchangedEngines'][file] = digest(b)
app = subprocess.check_output(['git', 'show', '1b2e93e52:src/mobile/MobileApp.vue']).decode('utf-8')
app = app.replace("'pack-record-read-sheet':packPanel && packExportView?.recordTask,", "'pack-record-read-sheet':packPanel && packExportView?.recordTask,'pack-review-task-sheet':packPanel && packExportView?.reviewTask,")
app = app.replace("packPanel&&packExportView?.sourceCheck?'返回文档':", "packPanel?packExportView?.backLabel||'返回上一层':")
app = app.replace(':snapshot="packSnapshot" @busy="packBusy = $event"', ':snapshot="packSnapshot" @busy="packBusy = $event" @close="closeSheet"')
assert app == Path('src/mobile/MobileApp.vue').read_text(encoding='utf-8')
base_css = subprocess.check_output(['git', 'show', '1b2e93e52:src/mobile/mobile.scss']).decode('utf-8')
assert base_css+'\n'+Path('docs/design/mobile-pack-export-review-v4/task-shell.css').read_text(encoding='utf-8') == Path('src/mobile/mobile.scss').read_text(encoding='utf-8')
for label in ('replies', 'source-replies', 'record-replies'): assert reports[label]['componentSha256'] == provenance['files']['src/mobile/PortableExport.vue']['bytesSha256']
for file in re.findall(r'(?:src|href)="(\./assets/[^\"]+)"', Path('dist/mobile.html').read_text(encoding='utf-8')):
    expected = Path('dist', file).read_bytes()
    with urllib.request.urlopen('http://127.0.0.1:9012/'+file.removeprefix('./'), timeout=10) as response: assert expected == response.read(), file
    provenance['servedAssets'][file] = digest(expected)
assert provenance['servedAssets']
outputs['provenance.json'] = provenance
outputs['research-sources.json'] = {'accessed': '2026-10-29', 'method': 'Official pages read through web open. No competitor installed or recorded. Complete-text caching, result ownership, retry and precise Back are project design/verification decisions.', 'sources': [
    {'title': 'Notion: Export your content', 'url': 'https://www.notion.com/help/export-your-content', 'finding': 'Mobile exports start from the page menu, choose a format, then open the phone share menu. Supports deliberate review and handoff; does not prove private package caching or exact Back/retry behavior. No silent format fallback was added here.'},
    {'title': 'Acrobat mobile: Save a copy', 'url': 'https://helpx.adobe.com/acrobat/mobile/view-manage-files/save-copy.html', 'finding': 'Choose the file location, file action, then destination and name. Supports explicit object/output identity before saving, not a recovery-record protocol.'},
    {'title': 'Obsidian: Mobile app', 'url': 'https://obsidian.md/help/mobile', 'finding': 'Back/Forward and menu access replace exposing the desktop Ribbon. Supports contextual actions and separate tasks, not an inferred attachment-export result screen.'}
]}
for source, target in copies: assert source.is_file() and source.stat().st_size, source

# Publish only after every input has been validated.
for source, target in copies: shutil.copyfile(source, target)
for name, value in outputs.items(): (out/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
cards = ''
for name, state in freeze['states'].items():
    injected = state['kind'] == 'injected-native-component'
    label = '生产组件／注入原生取消回复（非系统界面）' if injected else '正式浏览器App'
    actual = 'component-native-cancelled.png' if injected else 'actual-'+name+'.png'
    cards += f'<article><h2>{html.escape(name)}</h2><div class="pair"><figure><figcaption>冻结设计 v4</figcaption><img src="design-v4-{name}.png" alt="{name}设计"></figure><figure><figcaption>{label}</figcaption><img src="{actual}" alt="{name}实测"></figure></div></article>'
extras = ''.join(f'<figure><figcaption>{html.escape(n)}</figcaption><img src="actual-{n}.png" alt="{n}"></figure>' for n in report['screens'] if n not in freeze['states'])
(out/'comparison.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>附件包核对、预览与结果：设计和实页</title><style>body{margin:24px;font:16px/1.7 system-ui;background:#f6f7f3;color:#203d31}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:20px}.pair{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0 0 20px}img{display:block;max-width:min(390px,90vw);height:auto;border:1px solid #dbe4d8}article{border-top:1px solid #dbe4d8;padding-top:12px}a{color:#246847}</style><main><h1>先核对完整内容，再完成这次附件包导出</h1><p>核对、完整正文、附件清单和结果各自一层。当前导出与历史包结果分别保存；返回恢复实际入口，完成回原文。主动移除记录后更新结果中的保留状态。</p><p>14参考状态对应13种浏览器App状态与1种注入原生取消组件状态；16张浏览器实页及1张组件图已逐张审阅。布局、名称、字号和颜色差异0；保留原图和焦点，不声明整图像素相同。35组浏览器、12组延迟回复通过。新专项4次axe无违规，失败文字背景重叠一处未决已人工补查。</p><p>注入原生回复不是Android系统保存界面；浏览器短屏不代表实际IME。SAF、真实授权、系统／预测性返回、TalkBack和进程恢复仍待原生验收。</p><p><a href="before/report.json">改前实测</a> · <a href="visual-comparison.json">14状态核对</a> · <a href="browser-report.json">6组专项</a> · <a href="replies-report.json">原生回复组件</a> · <a href="archive-content-review.json">完整正文与二进制包</a> · <a href="contrast-review.json">颜色补查</a> · <a href="provenance.json">源码与服务</a> · <a href="research-sources.json">竞品依据</a></p><article><h2>改前／改后</h2><div class="pair"><figure><figcaption>改前：核对页没有完整正文入口</figcaption><img src="before/review.png" alt="改前核对"></figure><figure><figcaption>改后：按需查看完整正文和附件清单</figcaption><img src="actual-review.png" alt="改后核对"></figure><figure><figcaption>改前：短屏滚动后看不到下载结果</figcaption><img src="before/short-success.png" alt="改前短屏"></figure><figure><figcaption>改后：结果和固定完成动作</figcaption><img src="actual-short-result-success.png" alt="改后短屏结果"></figure></div></article>''' + cards + '<article><h2>跨记录返回、滚动和长文现场</h2><div class="pair">'+extras+'</div></article></main></html>', encoding='utf-8')
for folder in ['portable-pack-browser-1793261356541', 'portable-pack-browser-1793261656362']:
    (runs/folder/'.gitignore').write_text('*\n', encoding='utf-8')
print(json.dumps({'referenceStates': len(freeze['states']), 'appImages': len(report['screens']), 'injectedNativeImages': 1, 'maxCoordinateDelta': comparison['maxCoordinateDelta'], 'browserGroups': 35, 'injectedGroups': 12, 'manualContrast': manual}))
