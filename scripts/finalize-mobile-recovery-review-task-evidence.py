"""Validate every input before preserving raw recovery-task evidence; never rewrite a freeze."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import html
import json
import re
import shutil
import subprocess
import urllib.request

out = Path('docs/evidence/mobile-recovery-review-task-2026-10-28')
runs = Path('docs/evidence/mobile-0.1.0')
inputs = {
    'browser': ('recovery-review-task-1793198083566', 8),
    'recovery-read': ('recovery-read-1793198083593', 8),
    'recovery-layers': ('recovery-layers-browser-1793198083633', 9),
    'write-recovery': ('write-recovery-browser-1793198083636', 6),
    'replies': ('recovery-read-replies-1793198083808', 4),
}
failures = {
    'foreign-version-copy-error': 'recovery-review-task-1793197707587',
    'cached-copy-accessible-name': 'recovery-read-1793197885903',
    'old-export-exact-name': 'recovery-layers-browser-1793197885927',
    'old-inline-preview': 'write-recovery-browser-1793197885924',
}
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
digest = lambda b: sha256(b).hexdigest()
assert not (out/'browser-report.json').exists(), 'Final evidence exists; create another version.'
reports, copies = {}, []
for name, (folder, count) in inputs.items():
    result = read(runs/folder/'report.json')
    assert result['passed'] and not result.get('failure') and not result.get('errors') and not result.get('externalRequests') and len(result['checks']) == count, name
    reports[name+'-report.json'] = result
report = reports['browser-report.json']
assert len(report['accessibility']) == 4 and all(not s['violations'] and not s['incomplete'] for s in report['accessibility'])
candidate = runs/inputs['browser'][0]
assert len(report['screens']) == 20
for name in report['screens']:
    for suffix in ('.png', '-geometry.json'):
        copies.append((candidate/(name+suffix), out/('actual-'+name+suffix)))
for name, folder in failures.items():
    result = read(runs/folder/'report.json')
    assert not result.get('passed') and result.get('failure'), name
    reports['first-failure-'+name+'.json'] = result
    copies.append((runs/folder/'failure.png', out/('first-failure-'+name+'.png')))
for version in (1, 2, 3):
    for file, expected in read(out/f'design-freeze-v{version}.json')['files'].items():
        assert digest(Path(file).read_bytes()) == expected, file
for state in report['screens']:
    if state in read(out/'design-freeze-v2.json')['states']:
        assert (out/f'design-v2-{state}.png').read_bytes() == (out/f'design-v3-{state}.png').read_bytes()
baseline = Path('docs/evidence/mobile-recovery-task-2026-10-28/before')
assert read(baseline/'report.json')['baseHead'].startswith('775fe6351')
for file in baseline.iterdir():
    assert file.is_file()
    copies.append((file, out/'before'/file.name))

freeze = read(out/'design-freeze-v3.json')
comparison = {'scope': '14 states: coordinates, dimensions, visible names, font sizes, line heights and colors. Four states retain the real completed-download caption. Native focus is retained. No pixel-equality claim.', 'states': {}, 'maxCoordinateDelta': 0, 'differences': [], 'intentionalStatusDifferences': []}
status_states = {'read-failure', 'dark-review', 'narrow-review', 'short-review'}
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
                entry = [name, a['tag'], key, value, b[key]]
                if name in status_states and key == 'name' and a['tag'] in ('BUTTON', 'SMALL') and value in ('包含2份完整版本', '导出完整恢复记录包含2份完整版本') and b[key] == value.replace('包含2份完整版本', '已开始下载'):
                    comparison['intentionalStatusDifferences'].append(entry)
                else:
                    comparison['differences'].append(entry)
    comparison['states'][name] = {'elements': len(actual), 'coordinates': count}
assert not comparison['differences'], comparison['differences']
assert len(comparison['intentionalStatusDifferences']) == 8
assert comparison['maxCoordinateDelta'] == 0
reports['visual-comparison.json'] = comparison
prototype = Path('docs/design/mobile-recovery-review-task-v3/RecoveryReviewPrototype.vue').read_text(encoding='utf-8').replace("from '../../../src/mobile/", "from './")
assert prototype == Path('src/mobile/RecoveryCenter.vue').read_text(encoding='utf-8')
reports['prototype-runtime-match.json'] = {'matches': True, 'adaptations': ['Module import paths only']}

downloads = []
for filename in ('complete-recovery.json', 'retried-recovery.json'):
    file = candidate/filename
    data = read(file)
    assert data['original'] == '\ufeff# 行程核对😀\r\n原始路线\r尾行\n'
    assert data['candidate'] == '# 行程核对😀\r\n杭州 → 苏州\r保留这份输入\n'
    assert data['id'] == '00000000-0000-4000-8000-000000000801' and data['hasOriginal']
    downloads.append({'file': filename, 'rawSha256': digest(file.read_bytes()), 'originalUtf8Sha256': digest(data['original'].encode()), 'candidateUtf8Sha256': digest(data['candidate'].encode())})
    copies.append((file, out/filename))
assert (candidate/'complete-recovery.json').read_bytes() == (candidate/'retried-recovery.json').read_bytes()
reports['download-content-review.json'] = {'sameFullRecordOnRetry': True, 'BOM': True, 'mixedLineEndings': True, 'emoji': True, 'downloads': downloads}

provenance = {'capturedAt': datetime.now(timezone.utc).isoformat(), 'baseHead': '775fe6351', 'candidate': str(candidate), 'files': {}, 'unchangedEngines': {}, 'servedAssets': {}}
source_files = ['src/mobile/RecoveryCenter.vue', 'scripts/capture-mobile-recovery-task-baseline.mjs', 'scripts/freeze-mobile-recovery-review-task-design.mjs', 'scripts/mobile-recovery-navigation.mjs', 'scripts/test-mobile-recovery-review-task-browser.mjs', 'scripts/test-mobile-recovery-read-browser.mjs', 'scripts/test-mobile-recovery-read-replies-browser.mjs', 'scripts/test-mobile-recovery-layers-browser.mjs', 'scripts/test-mobile-write-recovery-browser.mjs', 'scripts/finalize-mobile-recovery-review-task-evidence.py']
for file in source_files:
    b = Path(file).read_bytes()
    provenance['files'][file] = {'bytesSha256': digest(b), 'gitLfSha256': digest(b.replace(b'\r\n', b'\n'))}
for file in ['src/mobile/storage.ts', 'src/mobile/MobileApp.vue', 'src/mobile/mobile.scss', 'src/mobile/RecoverySource.vue', 'src/mobile/SourceReader.vue', 'src/mobile/taskPosition.ts', 'src/mobile/TextExport.vue', 'src/mobile/ImageAttachments.vue', 'src-tauri/plugins/mobile-storage/android/src/main/java/StoragePlugin.kt']:
    b = Path(file).read_bytes().replace(b'\r\n', b'\n')
    assert b == subprocess.check_output(['git', 'show', '775fe6351:'+file]), file
    provenance['unchangedEngines'][file] = digest(b)
for file in re.findall(r'(?:src|href)="(\./assets/[^\"]+)"', Path('dist/mobile.html').read_text(encoding='utf-8')):
    expected = Path('dist', file).read_bytes()
    with urllib.request.urlopen('http://127.0.0.1:9012/'+file.removeprefix('./'), timeout=10) as response:
        assert expected == response.read(), file
    provenance['servedAssets'][file] = digest(expected)
assert provenance['servedAssets']
assert reports['replies-report.json']['componentSha256'] == provenance['files']['src/mobile/RecoveryCenter.vue']['bytesSha256']
reports['provenance.json'] = provenance

def luminance(color):
    values = [int(v)/255 for v in re.findall(r'\d+', color)[:3]]
    values = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in values]
    return sum(a*b for a, b in zip(values, (.2126, .7152, .0722)))

manual = []
for scan in reports['recovery-read-report.json']['accessibility']:
    assert not scan['violations']
    for item in scan['incomplete']:
        assert item['id'] == 'color-contrast'
        for node in item['nodes']:
            for colors in node['colors']:
                a, b = sorted([luminance(colors['foreground']), luminance(colors['background'])])
                ratio = (b+.05)/(a+.05)
                assert ratio >= 3 and float(colors['fontSize'][:-2]) >= 24 and colors['opacity'] == '1'
                manual.append({'state': scan['name'], 'targets': node['targets'], 'reason': node['summary'], **colors, 'ratio': round(ratio, 3), 'required': 3})
assert len(manual) == 1
copies.append((runs/inputs['recovery-read'][0]/'short-failure.png', out/'legacy-short-failure.png'))
reports['contrast-review.json'] = {'method': 'Legacy read regression retains one axe overlap incomplete. Raw PNG inspected and computed colors checked manually. This is not an axe-resolved result. All four new task scans have no violations/incomplete.', 'checks': manual, 'rawImage': 'legacy-short-failure.png'}
reports['visual-review.json'] = {'rawImagesViewedIndividually': report['screens'], 'baselineImagesViewed': ['review', 'narrow', 'short'], 'design': 'All 14 v1 PNGs viewed; four changed v2 PNGs viewed, ten identical to v1; all 14 v3 PNGs byte-identical to v2.', 'imageEdits': False, 'statusDifferences': 'Four actual review states retain a completed real download caption; no state was reset to fake equality.', 'nativeAndroidTest': False}
reports['research-sources.json'] = {'accessed': '2026-10-28', 'method': 'Official pages read through web open; no competitor installed or recorded. Layer choice, fixed actions, per-version retention and retry are project design judgments.', 'sources': [
    {'title': 'Notion: Delete and restore content', 'url': 'https://www.notion.com/help/duplicate-delete-and-restore-content', 'finding': 'Mobile Trash is reached from the sidebar menu. Open a deleted page before restoration. Page history selects a previous version before restore or copying specific blocks; detailed version comparison is unavailable on mobile.'},
    {'title': 'Obsidian: File recovery', 'url': 'https://obsidian.md/help/plugins/file-recovery', 'finding': 'Choose a file and snapshot; Copy and Restore are separate actions. Snapshots are local complete versions, not a backup. Documentation does not establish the exact mobile Back or retry behavior.'}
]}
for source, target in copies:
    assert source.is_file() and source.stat().st_size, source

# Publication begins only after every validation above succeeds.
for source, target in copies:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
for name, value in reports.items():
    (out/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
cards = ''.join(f'<article><h2>{html.escape(n)}</h2><div class="pair"><figure><figcaption>冻结设计 v3</figcaption><img src="design-v3-{n}.png" alt="{n}设计"></figure><figure><figcaption>正式App</figcaption><img src="actual-{n}.png" alt="{n}实页"></figure></div></article>' for n in freeze['states'])
extras = ''.join(f'<figure><figcaption>{html.escape(n)}</figcaption><img src="actual-{n}.png" alt="{n}"></figure>' for n in report['screens'] if n not in freeze['states'])
(out/'comparison.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>恢复核对：设计与实页</title><style>body{margin:24px;font:16px/1.7 system-ui;background:#f6f7f3;color:#203d31}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:20px}.pair{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0 0 20px}img{display:block;max-width:min(390px,90vw);height:auto;border:1px solid #dbe4d8}article{border-top:1px solid #dbe4d8;padding-top:12px}a{color:#246847}</style><main><h1>恢复核对：先查看，再决定如何取回</h1><p>核对页、版本短弹层、完整预览和导出结果分别处理。另存明确进入手机资料库，打开失败继续同一副本。逐版本保留选区、滚动和长文查询。</p><p>原图未加工，焦点保留。14状态布局／字号／颜色最大位置差0px；其中4个实页已真实下载，保留“已开始下载”，对应8个名称差异有单独记录；不声明整图像素或所有文案相同。</p><p>31组浏览器与4组延迟回复检查通过。新专项4次axe无违规或未决；旧重读回归保留1处标题重叠未决并补查颜色。浏览器短屏及注入回复不代表Android输入法、系统返回、SAF、TalkBack或后台恢复验收。</p><p><a href="before/report.json">改前实测</a> · <a href="visual-comparison.json">14状态核对</a> · <a href="browser-report.json">8组专项</a> · <a href="replies-report.json">延迟回复</a> · <a href="contrast-review.json">对比度补查</a> · <a href="download-content-review.json">完整下载内容</a> · <a href="provenance.json">源码与服务</a> · <a href="research-sources.json">竞品依据</a></p><article><h2>改前／改后</h2><div class="pair"><figure><figcaption>改前：全部展开，短屏大字需长距离滚动</figcaption><img src="before/review.png" alt="改前核对页"></figure><figure><figcaption>改后：按任务进入版本与完整预览</figcaption><img src="actual-review.png" alt="改后核对页"></figure></div></article>''' + cards + '<article><h2>实际状态补充</h2><div class="pair">' + extras + '</div></article></main></html>', encoding='utf-8')
for folder in ('write-recovery-browser-1793197885924', 'write-recovery-browser-1793198083636'):
    (runs/folder/'.gitignore').write_text('*\n', encoding='utf-8')
print(json.dumps({'screens': len(report['screens']), 'states': len(comparison['states']), 'maxCoordinateDelta': comparison['maxCoordinateDelta'], 'intentionalStatusDifferences': len(comparison['intentionalStatusDifferences']), 'browserGroups': 31, 'injectedGroups': 4, 'manualContrast': manual}))
