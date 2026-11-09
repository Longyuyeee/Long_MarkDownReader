"""Preserve return-origin evidence and verify the frozen appearance and names."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import html
import json
import shutil
import subprocess
import sys
import urllib.request

out = Path('docs/evidence/mobile-document-return-2026-10-28')
candidate, recovery, password, text_export = map(Path, sys.argv[1:5])
assert not (out / 'browser-report.json').exists(), 'Preserve finalized evidence; use a new version.'
digest = lambda data: sha256(data).hexdigest()
read_json = lambda p: json.loads(p.read_text(encoding='utf-8'))
def save(name, value):
    (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

for version in [1, 2]:
    for file, value in read_json(out / f'design-freeze-v{version}.json')['files'].items():
        assert digest(Path(file).read_bytes()) == value, file
freeze = read_json(out / 'design-freeze-v2.json')
report = read_json(candidate / 'report.json')
assert report['passed'] and len(report['checks']) == 8 and not report['errors'] and not report['externalRequests']
for folder, count in [(recovery, 9), (password, 8), (text_export, 6)]:
    result = read_json(folder / 'report.json')
    assert result['passed'] and len(result['checks']) == count, str(folder)
copies = []
def preserve(source, name):
    target = out / name
    assert not target.exists(), name
    shutil.copyfile(source, target)
    assert source.read_bytes() == target.read_bytes()
    copies.append({'source': source.as_posix(), 'target': target.as_posix(), 'sha256': digest(target.read_bytes())})

preserve(candidate / 'report.json', 'browser-report.json')
for screen in report['screens']:
    preserve(candidate / (screen['name'] + '.png'), 'actual-' + screen['name'] + '.png')
for folder, name in [(recovery, 'recovery-report.json'), (password, 'password-report.json'), (text_export, 'text-export-report.json')]:
    preserve(folder / 'report.json', name)
before = Path('docs/evidence/mobile-0.1.0/document-return-before-1793178881338')
preserve(before / 'report.json', 'before-report.json')
for name in ['settings-copy', 'settings-return', 'recent-note', 'recent-return', 'search-copy', 'search-return', 'dark-settings', 'narrow-settings', 'password-recent']:
    preserve(before / (name + '.png'), 'before-' + name + '.png')
early = Path('docs/evidence/mobile-0.1.0/document-return-before-1793178675945')
preserve(early / 'report.json', 'early-capture-report.json')
preserve(early / 'search-copy.png', 'early-unready-search-copy.png')
failed = Path('docs/evidence/mobile-0.1.0/document-return-candidate-1793179619624')
preserve(failed / 'report.json', 'failed-search-entry-report.json')
preserve(failed / 'failure-test.png', 'failed-search-entry.png')
prior = Path('docs/evidence/mobile-0.1.0/document-return-candidate-1793180042944')
preserve(prior / 'report.json', 'before-capture-refinement-report.json')
preserve(prior / 'failed-admission.png', 'before-full-recovery-capture.png')
preserve(prior / 'pdf-note-source.png', 'before-pdf-source-ready.png')
save('original-copy-map.json', copies)

states, maximum = [], 0
for name, bounds in freeze['geometry'].items():
    actual, coordinates = report['geometry'][name], 0
    for selector, rectangle in bounds.items():
        assert bool(rectangle) == bool(actual[selector]), (name, selector)
        if rectangle:
            for prop, value in rectangle.items():
                delta = abs(actual[selector][prop] - value)
                maximum = max(maximum, delta)
                assert delta <= .05, (name, selector, prop, delta)
                coordinates += 1
    observed = next(row['buttons'] for row in report['labels'] if row['name'] == name)
    assert observed == freeze['labels'][name], name + ' return name'
    assert report['typography'][name] == freeze['typography'][name], name + ' typography'
    assert report['icons'][name] == freeze['icons'][name], name + ' icons'
    states.append({'screen': name, 'coordinatesCompared': coordinates, 'accessibleNamesMatch': True, 'computedTypographyMatches': True, 'iconPrimitivesMatch': True})
save('comparison.json', {'reference': 'design-freeze-v2.json', 'maximumCoordinateDifferencePx': maximum, 'states': states, 'scope': '6 retained appearance states and expected accessible names. Real generated copy IDs differ. No pixel-identical rasterization or native Android claim.'})
save('visual-review.json', {'recordedAt': datetime.now(timezone.utc).isoformat(), 'method': 'All six v1 references viewed; v2 changes only the narrow viewport image, separately viewed, while the other five PNGs are byte-identical. All 16 final App originals directly viewed with view_image; focus, selection, loading-before-ready and earlier clipped captures retained separately.', 'images': [{'file': 'actual-' + s['name'] + '.png', 'sha256': digest((out / ('actual-' + s['name'] + '.png')).read_bytes())} for s in report['screens']]})
save('research-sources.json', {'checkedOn': '2026-10-28', 'method': 'Search tool connection failed; official HTTPS pages were read directly. Obsidian publish page is a client shell, so its official documentation repository was read.', 'sources': [{'url': 'https://help.obsidian.md/mobile', 'source': 'https://github.com/obsidianmd/obsidian-help/blob/master/en/Getting%20started/Mobile%20app.md', 'finding': 'Mobile navigation offers back/forward; unavailable actions are disabled.'}, {'url': 'https://www.notion.com/help/notion-for-mobile', 'finding': 'Touch controls are visible without hover; desktop columns become a single mobile column.'}, {'url': 'https://developer.android.com/guide/navigation/backstack?hl=en', 'finding': 'Back stack is last-in first-out and a normal Back moves to the previous destination.'}], 'limit': 'Official documentation research only; competitors not installed or recorded. Destination names are this project’s design judgment.'})

git = lambda *args: subprocess.check_output(['git', *args])
sources, unchanged = {}, {}
for file in ['src/mobile/MobileApp.vue', 'src/mobile/MobilePdf.vue', 'src/mobile/MobilePdfPassword.vue']:
    data = Path(file).read_bytes()
    sources[file] = {'workingSha256': digest(data), 'gitLfSha256': digest(data.replace(b'\r\n', b'\n'))}
for file in ['src/mobile/viewHistory.ts', 'src/mobile/storage.ts', 'src/mobile/RecoveryCenter.vue', 'src/mobile/taskPosition.ts', 'src/mobile/pdfPassword.ts', 'src/mobile/pdfDocument.ts', 'src/mobile/pdfReference.ts', 'src/mobile/TextExport.vue']:
    data = Path(file).read_bytes().replace(b'\r\n', b'\n')
    assert data == git('show', 'bc8668b23:' + file), file
    unchanged[file] = digest(data)
assets, served = {}, {}
for file in [Path('dist/mobile.html'), *[p for p in Path('dist/assets').iterdir() if p.suffix in ['.js', '.css', '.mjs']]]:
    data = file.read_bytes()
    actual = urllib.request.urlopen('http://127.0.0.1:9012/' + file.relative_to('dist').as_posix()).read()
    assert actual == data, str(file)
    assets[file.as_posix()] = digest(data)
    served[file.as_posix()] = digest(actual)
save('build-provenance.json', {'baseHead': 'bc8668b23', 'buildCommand': 'npm run build:mobile', 'buildExit': 0, 'nativeAndroidTest': False, 'capturedAt': datetime.now(timezone.utc).isoformat(), 'sources': sources, 'unchangedModules': unchanged, 'assets': assets, 'servedAssets': served, 'scope': 'Final build: return tasks 8, recovery 9, password tasks 8, text export 6. Held animation frame and storage failures are browser injections, not OS Back or native IME tests.'})

titles = {'settings-copy': '恢复副本返回设置', 'recent-note': '返回最近打开', 'search-copy': '恢复副本返回搜索', 'dark-settings': '深色设置来源', 'narrow-settings': '320px／200%字号', 'password-recent': '密码取消返回最近'}
sections = []
for name in freeze['geometry']:
    labels = '；'.join(row['name'] for row in freeze['labels'][name])
    sections.append('<section id="' + name + '"><h2>' + html.escape(titles[name]) + '</h2><p>预期名称与实际名称一致：<strong>' + html.escape(labels) + '</strong></p><div class="pair"><figure><figcaption>冻结外形与返回规范 v2</figcaption><a href="design-v2-' + name + '.png"><img src="design-v2-' + name + '.png" alt="' + html.escape(titles[name]) + '设计参考"></a></figure><figure><figcaption>生产构建实页</figcaption><a href="actual-' + name + '.png"><img src="actual-' + name + '.png" alt="' + html.escape(titles[name]) + '实际页面"></a></figure></div></section>')
extras = ''.join('<figure><figcaption>' + html.escape(s['name']) + '</figcaption><a href="actual-' + s['name'] + '.png"><img src="actual-' + s['name'] + '.png" alt="' + html.escape(s['name']) + '"></a></figure>' for s in report['screens'] if s['name'] not in titles)
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文档返回 · 规则与实页对照</title><style>body{font:16px/1.65 system-ui,sans-serif;margin:24px;background:#eef2eb;color:#263a30}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:21px}a{color:#256044}nav{display:flex;flex-wrap:wrap;gap:8px 18px}.pair,.extras{display:flex;gap:24px;flex-wrap:wrap}section{padding:12px 0 24px;border-bottom:1px solid #b8c8b5}figure{margin:0 0 18px;max-width:100%}figcaption{margin-bottom:8px}img{display:block;max-width:100%;height:auto;border:1px solid #c3cebd}p{max-width:950px}.note{padding:16px;background:white;border:1px solid #c3cebd;border-radius:12px}</style><main><h1>文档返回 · 规则与实页对照</h1><p class="note">沿用原有箭头与页面外形，校准无障碍名称、处理中播报和焦点定位。6种参考在源码实施前冻结，16张最终实页原样保存。布局最大差值0px，字体／图标／预期名称分别核对；真实生成的副本标识不同，不声称逐像素一致。原型目标页是基线静态样本，正式主题、焦点与查询恢复以实际任务测试为准。</p><p><a href="comparison.json">布局与名称测量</a> · <a href="design-freeze-v2.json">v2冻结</a> · <a href="design-freeze-v1.json">保留的v1</a> · <a href="browser-report.json">8组返回专项</a> · <a href="original-copy-map.json">原图来源</a> · <a href="build-provenance.json">构建来源</a> · <a href="../../Mobile_Document_Return_2026-10-28.md">竞品、开发与限制</a></p><nav>'''
page += ''.join('<a href="#' + n + '">' + html.escape(titles[n]) + '</a>' for n in titles) + '</nav>' + ''.join(sections) + '<h2>实际返回结果、关闭保护与来源优先级</h2><div class="extras">' + extras + '</div><p>关闭中保留真实按钮焦点。失败输入、真实PDF与返回笔记、搜索子层分别验证；系统返回、预测性返回、TalkBack与生命周期仍需Android原生验收。本轮未构建、安装或发布APK。</p></main></html>'
(out / 'comparison.html').write_text(page, encoding='utf-8')
secrets = [s['publicTestPassword'] for s in read_json(Path('scripts/fixtures/mobile-pdf-permissions.json'))['samples'] if s.get('publicTestPassword')]
checked = [*out.glob('*.json'), *out.glob('*.html'), *Path('docs/design/mobile-document-return-v1').glob('*.html'), *Path('docs/design/mobile-document-return-v2').glob('*.html')]
for file in checked:
    assert not any(secret in file.read_text(encoding='utf-8') for secret in secrets), str(file)
save('privacy-audit.json', {'nativeAndroidTest': False, 'knownFixtureCredentialsFound': False, 'filesChecked': [p.as_posix() for p in checked], 'scope': 'Known public fixture credentials absent from evidence metadata and static DOM prototypes. Current return task never enters a PDF password and refuses visible nonempty password captures; regression test performs its own input/storage checks. Not a native memory or task-switcher guarantee.'})
save('evidence-manifest.json', {p.name: digest(p.read_bytes()) for p in sorted(out.iterdir()) if p.is_file() and p.name != 'evidence-manifest.json'})
print(json.dumps({'originalsCopied': len(copies), 'statesCompared': len(states), 'coordinatesCompared': sum(s['coordinatesCompared'] for s in states), 'maximumCoordinateDifferencePx': maximum}))
