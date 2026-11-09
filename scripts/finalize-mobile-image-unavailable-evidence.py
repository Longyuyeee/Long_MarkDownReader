"""Collect raw evidence and verify the frozen design, source and served bundle."""
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

out = Path('docs/evidence/mobile-image-unavailable-2026-10-28')
candidate, layers, attachments, replies = map(Path, sys.argv[1:5])
assert not (out/'browser-report.json').exists(), 'Final evidence exists; create a new version.'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
digest = lambda b: sha256(b).hexdigest()


def save(name, data):
    (out/name).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


for version in (1, 2, 3):
    for file, expected in read(out/f'design-freeze-v{version}.json')['files'].items():
        assert digest(Path(file).read_bytes()) == expected, file
for name, folder, count in [('browser', candidate, 8), ('image-layers', layers, 12), ('attachments', attachments, 7), ('picker-replies', replies, 3)]:
    report = read(folder/'report.json')
    assert report['passed'] and not report.get('failure') and not report.get('errors') and len(report['checks']) == count, name
    save(name+'-report.json', report)
report = read(candidate/'report.json')
assert len(report['accessibility']) == 5 and all(not a['violations'] and not a['incomplete'] for a in report['accessibility'])
for name in report['screens']:
    for suffix in ('.png', '-geometry.json'):
        shutil.copyfile(candidate/(name+suffix), out/('actual-'+name+suffix))

failures = {
    'root-navigation-setup': 'image-unavailable-1793193290944',
    'resume-draft-setup': 'image-unavailable-1793193372597',
    'stale-dialog-label': 'image-layers-browser-1793193372626',
    'old-undo-status': 'attachments-browser-1793193372636',
    'old-library-scope': 'attachments-browser-1793193728605',
    'old-document-return': 'attachments-browser-1793193804213',
    'unscoped-record-name': 'image-picker-replies-1793193728728',
}
for name, folder in failures.items():
    p = Path('docs/evidence/mobile-0.1.0')/folder
    save('first-failure-'+name+'.json', read(p/'report.json'))
    if (p/'failure.png').exists():
        shutil.copyfile(p/'failure.png', out/('first-failure-'+name+'.png'))
shutil.copyfile(Path('docs/evidence/mobile-0.1.0/image-unavailable-1793193372597/missing-recovery.png'), out/'before-misleading-recovery-error.png')
previous = Path('docs/evidence/mobile-0.1.0/image-unavailable-1793193728585')
shutil.copyfile(previous/'short-keyboard-focus.png', out/'before-insufficient-keyboard-focus.png')
save('before-insufficient-keyboard-focus-report.json', read(previous/'report.json'))
save('visual-review-reuse.json', {'previouslyViewed': str(previous), 'identicalRawImages': [n for n in report['screens'] if (candidate/(n+'.png')).read_bytes() == (previous/(n+'.png')).read_bytes()], 'changedImageReviewedSeparately': 'short-keyboard-focus', 'correction': 'First capture used programmatic focus and did not demonstrate a visible keyboard ring. Final test uses real Tab, asserts :focus-visible and active element, and its raw image shows the outline.', 'designVersions': 'All v2 PNGs equal v1; ten v3 PNGs equal v2. The changed missing-recovery image was separately viewed.'})

freeze = read(out/'design-freeze-v3.json')
comparison = {'scope': '11 states, visible element names, coordinates, dimensions, font sizes, line heights and colors. Closed location details are measured by summary, not hidden variable paths. Native keyboard focus remains in actual captures; no pixel-equality claim.', 'states': {}, 'differences': [], 'maxCoordinateDelta': 0}
for name, state in freeze['states'].items():
    expected, actual = state['geometry'], read(candidate/(name+'-geometry.json'))
    assert len(expected) == len(actual), name
    coordinates = 0
    for a, b in zip(expected, actual):
        for key, value in a.items():
            if isinstance(value, (int, float)):
                delta = abs(value-b[key]); coordinates += 1
                comparison['maxCoordinateDelta'] = max(comparison['maxCoordinateDelta'], delta)
                if delta > .1:
                    comparison['differences'].append([name, a['tag'], key, value, b[key]])
            elif value != b[key]:
                comparison['differences'].append([name, a['tag'], key, value, b[key]])
    comparison['states'][name] = {'elements': len(actual), 'coordinates': coordinates}
save('visual-comparison.json', comparison)
assert not comparison['differences'], comparison['differences']
prototype = Path('docs/design/mobile-image-unavailable-v3/ImageUnavailablePrototype.vue').read_text(encoding='utf-8').replace("from '../../../src/mobile/", "from './")
assert prototype == Path('src/mobile/ImageAttachments.vue').read_text(encoding='utf-8')
save('prototype-runtime-match.json', {'matches': True, 'onlyDifference': 'Module import paths adapted from frozen v3 to the runtime component.'})

provenance = {'capturedAt': datetime.now(timezone.utc).isoformat(), 'baseHead': 'd4b0180df', 'candidate': str(candidate), 'files': {}, 'unchangedEngines': {}, 'servedAssets': {}}
files = ['src/mobile/ImageAttachments.vue', 'src/mobile/MobileApp.vue', 'src/mobile/mobile.scss', 'src/mobile/mobileHelp.ts', 'src/mobile/storage.ts', 'scripts/test-mobile-image-unavailable-browser.mjs', 'scripts/test-mobile-image-picker-replies-browser.mjs', 'scripts/test-mobile-image-layers-browser.mjs', 'scripts/test-mobile-attachments-browser.mjs']
for file in files:
    b = Path(file).read_bytes()
    provenance['files'][file] = {'bytesSha256': digest(b), 'gitLfSha256': digest(b.replace(b'\r\n', b'\n'))}
for file in ['src/mobile/imageFile.ts', 'src/mobile/imageReferences.ts', 'src/mobile/taskPosition.ts', 'src/mobile/FileImportPanel.vue', 'src/mobile/PackImportPanel.vue', 'src-tauri/plugins/mobile-storage/android/src/main/java/StoragePlugin.kt', 'src-tauri/plugins/mobile-storage/android/src/main/java/IncomingIntent.kt']:
    b = Path(file).read_bytes().replace(b'\r\n', b'\n')
    assert subprocess.check_output(['git', 'show', 'd4b0180df:'+file]) == b, file
    provenance['unchangedEngines'][file] = digest(b)
storage = Path('src/mobile/storage.ts').read_text(encoding='utf-8')
guard = "    if (record.status !== 'ready' && !record.candidate) throw new Error('图片恢复数据不可读，请重新选择原图')\n"
assert storage.count(guard) == 1
assert storage.replace(guard, '').encode() == subprocess.check_output(['git', 'show', 'd4b0180df:src/mobile/storage.ts'])
provenance['storageChange'] = 'One browser preview guard distinguishes a missing unconfirmed recovery copy from an invalid filename. Native storage and write/retry engine are unchanged.'
for file in re.findall(r'(?:src|href)="(\./assets/[^\"]+)"', Path('dist/mobile.html').read_text(encoding='utf-8')):
    expected = Path('dist', file).read_bytes()
    with urllib.request.urlopen('http://127.0.0.1:9012/'+file.removeprefix('./'), timeout=10) as response:
        served = response.read()
    assert served == expected, file
    provenance['servedAssets'][file] = digest(expected)
save('provenance.json', provenance)
assert read(replies/'report.json')['componentSha256'] == provenance['files']['src/mobile/ImageAttachments.vue']['bytesSha256']
save('attachment-logic-summary.json', {'kind': 'Transcribed summary of observed execution output; not a redirected raw log', 'command': 'node --experimental-strip-types --test scripts/test-mobile-attachments.mjs', 'exitCode': 0, 'passed': 7, 'failed': 0})
save('research-sources.json', {'accessed': '2026-10-28', 'method': 'Official pages read via web search/open. No competitor installed or recorded. Recovery branching, local reselection and state preservation are project design decisions.', 'sources': [
    {'title': 'Bear: How to insert attachments', 'url': 'https://bear.app/faq/insert-attachments/', 'finding': 'iOS provides camera/attachment actions in the editing keyboard; image and PDF attachments have previews. Supports contextual addition and content preview, not our retry details.'},
    {'title': 'Joplin: Attachments', 'url': 'https://joplinapp.org/help/apps/attachments/', 'finding': 'Attachment availability can be always downloaded, manually downloaded by clicking, or downloaded when opening a note. Supports distinguishing availability from document editing, not a claim about its unavailable-image retry UI.'}
]})
cards = ''.join(f'<article><h2>{html.escape(n)}</h2><div class="pair"><figure><figcaption>冻结设计 v3</figcaption><img src="design-v3-{n}.png" alt="{n}设计"></figure><figure><figcaption>正式App</figcaption><img src="actual-{n}.png" alt="{n}实页"></figure></div></article>' for n in freeze['states'])
extras = ''.join(f'<figure><figcaption>{html.escape(n)}</figcaption><img src="actual-{n}.png" alt="{n}"></figure>' for n in report['screens'] if n not in freeze['states'])
(out/'comparison.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>图片不可用：设计与实页</title><style>body{margin:24px;font:16px/1.7 system-ui;background:#f6f7f3;color:#203d31}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:20px}.pair{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0 0 20px}img{display:block;max-width:min(390px,90vw);height:auto;border:1px solid #dbe4d8}article{border-top:1px solid #dbe4d8;padding-top:12px}a{color:#246847}</style><main><h1>图片不可用：读取、重新选择与恢复</h1><p>无法读取时，底部固定重新读取；当前笔记另可重新选择。可读恢复副本继续在原位置重试。取消保留原详情，新图片也需明确确认才更新草稿。</p><p>原图未加工。真实键盘焦点和用户选择保留，测量一致不等于像素完全相同。346px短视口与延迟回复组件验证均不能替代Android系统键盘、返回、SAF、来源授权及TalkBack。</p><p><a href="before-v2/report.json">改前实测</a> · <a href="visual-comparison.json">11状态测量</a> · <a href="browser-report.json">8组专项</a> · <a href="picker-replies-report.json">延迟回复</a> · <a href="provenance.json">来源核对</a> · <a href="research-sources.json">竞品依据</a> · <a href="first-build-failure.json">首次构建失败</a></p><article><h2>改前／改后</h2><div class="pair"><figure><figcaption>改前：不可读恢复副本仍提供写入重试</figcaption><img src="before-v2/missing-recovery.png" alt="改前恢复失败"></figure><figure><figcaption>改后：明确重读或重新选择</figcaption><img src="actual-missing-recovery.png" alt="改后恢复失败"></figure></div></article>''' + cards + '<article><h2>实际状态补充</h2><div class="pair">' + extras + '</div></article></main></html>', encoding='utf-8')
for folder in [attachments, *[Path('docs/evidence/mobile-0.1.0')/failures[n] for n in ('old-undo-status', 'old-library-scope', 'old-document-return')]]:
    (folder/'.gitignore').write_text('*\n', encoding='utf-8')
print(json.dumps({'screens': len(report['screens']), 'coordinates': sum(s['coordinates'] for s in comparison['states'].values()), 'maxCoordinateDelta': comparison['maxCoordinateDelta']}))
