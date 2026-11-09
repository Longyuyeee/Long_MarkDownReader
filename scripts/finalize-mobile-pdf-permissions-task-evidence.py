"""Preserve original browser evidence and compare it with the frozen permission designs."""
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

out = Path('docs/evidence/mobile-pdf-permissions-task-2026-10-28')
candidate, settings, help_run = map(Path, sys.argv[1:4])
assert not (out / 'browser-report.json').exists(), 'Final evidence already exists; preserve it in a new version.'
digest = lambda b: sha256(b).hexdigest()
read_json = lambda p: json.loads(p.read_text(encoding='utf-8'))
def write_json(name, value):
    (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

freeze = read_json(out / 'design-freeze-v1.json')
for file, expected in freeze['files'].items():
    assert digest(Path(file).read_bytes()) == expected, 'Frozen design changed: ' + file
report = read_json(candidate / 'report.json')
assert report['passed'] and len(report['checks']) == 8 and not report['errors'] and not report['externalRequests']
assert read_json(settings / 'report.json')['passed'] and len(read_json(settings / 'report.json')['checks']) == 7
assert read_json(help_run / 'result.json')['status'] == 'passed' and len(read_json(help_run / 'result.json')['checks']) == 14
copy_map = []
def preserve(source, name):
    target = out / name
    assert not target.exists(), 'Original evidence must not be overwritten: ' + str(target)
    shutil.copyfile(source, target)
    assert source.read_bytes() == target.read_bytes()
    copy_map.append({'source': source.as_posix(), 'target': target.as_posix(), 'sha256': digest(target.read_bytes())})

preserve(candidate / 'report.json', 'browser-report.json')
for screen in report['screens']:
    preserve(candidate / (screen['name'] + '.png'), 'actual-' + screen['name'] + '.png')
preserve(settings / 'report.json', 'settings-report.json')
preserve(help_run / 'result.json', 'help-report.json')
before = Path('docs/evidence/mobile-0.1.0/pdf-permissions-task-before-1793172002045')
preserve(before / 'report.json', 'before-report.json')
for name in ['overview', 'selection-return', 'unknown', 'short-320-200']:
    preserve(before / (name + '.png'), 'before-' + name + '.png')
for prefix, folder in [
    ('failed-script-init', '1793173187956'),
    ('failed-scroll-focus', '1793173211718'),
    ('failed-short-entry-test', '1793173323903'),
    ('before-color-fix', '1793173501153'),
    ('before-letter-spacing-fix', '1793173789515'),
]:
    source = Path('docs/evidence/mobile-0.1.0/pdf-permissions-task-candidate-' + folder)
    preserve(source / 'report.json', prefix + '-report.json')
    image = 'restricted-dark' if prefix == 'before-color-fix' else 'copy-detail' if prefix == 'before-letter-spacing-fix' else 'failure'
    preserve(source / (image + '.png'), prefix + '.png')
write_json('original-copy-map.json', copy_map)

inspection = read_json(out / 'design-inspection.json')
states = []
maximum = 0
for name, reference in freeze['geometry'].items():
    actual = report['geometry'][name]
    differences, coordinates, missing = [], 0, []
    for selector, bounds in reference.items():
        observed = actual[selector]
        if bool(bounds) != bool(observed):
            missing.append(selector)
        if not bounds or not observed:
            continue
        for prop, expected in bounds.items():
            delta = abs(observed[prop] - expected)
            maximum = max(maximum, delta)
            coordinates += 1
            if delta > .05:
                differences.append({'selector': selector, 'property': prop, 'expected': expected, 'actual': observed[prop]})
    typography = []
    for selector, expected in inspection['typography'][name].items():
        observed = report['typography'][name][selector]
        assert bool(expected) == bool(observed), (name, selector)
        if expected:
            typography.append(selector)
            assert expected == observed, (name, selector)
    assert not differences and not missing, name
    assert report['icons'][name] == inspection['icons'][name], name
    states.append({'screen': name, 'coordinatesCompared': coordinates, 'differences': differences, 'missingSelectors': missing, 'typographySelectorsMatched': typography, 'iconPrimitivesMatched': True})
comparison = {'reference': 'design-freeze-v1.json', 'maximumCoordinateDifferencePx': maximum, 'scope': '12 frozen states; root/header/card/rows/body/footer/detail/Settings rectangles where present, computed typography/colors and Lucide primitives. Original focus and selection remain. No claim of pixel-identical font rasterization or native Android verification.', 'states': states}
write_json('comparison.json', comparison)

base = '278c5acf8'
git = lambda *args: subprocess.check_output(['git', *args])
sources = {}
for file in ['src/mobile/MobilePdfPermissions.vue', 'src/mobile/MobilePdf.vue', 'src/mobile/MobilePdfSettings.vue', 'src/mobile/mobileHelp.ts']:
    data = Path(file).read_bytes()
    sources[file] = {'workingSha256': digest(data), 'gitLfSha256': digest(data.replace(b'\r\n', b'\n'))}
unchanged = {}
for file in ['src/mobile/pdfPermissions.ts', 'src/mobile/pdfDocument.ts', 'src/mobile/pdfPassword.ts', 'src/mobile/pdfReference.ts', 'src/mobile/storage.ts', 'src/mobile/pdfGestures.ts', 'src/mobile/pdfOrientation.ts']:
    data = Path(file).read_bytes().replace(b'\r\n', b'\n')
    assert data == git('show', base + ':' + file), 'Engine changed: ' + file
    unchanged[file] = digest(data)
assets, served = {}, {}
index = Path('dist/mobile.html')
files = [index, *[Path('dist') / ref.removeprefix('./') for ref in re.findall(r'(?:src|href)="([^"]+\.(?:js|css))"', index.read_text(encoding='utf-8'))], *Path('dist/assets').glob('pdf-*.js'), *Path('dist/assets').glob('pdf.worker.min-*.mjs')]
for file in files:
    local = file.read_bytes()
    url = 'http://127.0.0.1:9012/' + file.relative_to('dist').as_posix()
    remote = urllib.request.urlopen(url).read()
    assert remote == local, 'Served build mismatch: ' + url
    assets[file.as_posix()] = digest(local)
    served[file.as_posix()] = digest(remote)
write_json('build-provenance.json', {'baseHead': base, 'nativeAndroidTest': False, 'capturedAt': datetime.now(timezone.utc).isoformat(), 'buildCommand': 'npm run build:mobile', 'buildExit': 0, 'finalChange': 'Permission task, source selection and return-origin accessibility labels; final eight-group permission, seven-group Settings and fourteen-group Help suites verified on this production build.', 'sources': sources, 'unchangedEngines': unchanged, 'assets': assets, 'servedAssets': served})

titles = {'restricted': '限制复制和批注', 'no-copy': '仅限制复制', 'no-annotations': '仅限制批注', 'unknown': '权限未确认', 'allowed': '普通文档', 'source-folder': '文件夹来源', 'copy-detail': '复制详情', 'annotation-detail': '批注详情', 'reading-detail': '阅读详情', 'settings-entry': '设置入口', 'restricted-dark': '深色页面', 'detail-short-320-200': '320px／200%／短屏'}
sections = []
for name in freeze['geometry']:
    sections.append('<section id="' + name + '"><h2>' + html.escape(titles[name]) + '</h2><div class="pair"><figure><figcaption>冻结设计 v1</figcaption><a href="design-v1-' + name + '.png"><img src="design-v1-' + name + '.png" alt="' + html.escape(titles[name]) + '设计图"></a></figure><figure><figcaption>实际生产构建</figcaption><a href="actual-' + name + '.png"><img src="actual-' + name + '.png" alt="' + html.escape(titles[name]) + '实际页面"></a></figure></div></section>')
extra = [s['name'] for s in report['screens'] if s['name'] not in titles]
extra_html = ''.join('<figure><figcaption>' + html.escape(name) + '</figcaption><a href="actual-' + name + '.png"><img src="actual-' + name + '.png" alt="' + html.escape(name) + '"></a></figure>' for name in extra)
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDF 文档权限 · 设计与实页对照</title><style>body{font:16px/1.65 system-ui,sans-serif;margin:24px;background:#eef2eb;color:#263a30}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:21px}a{color:#256044}nav{display:flex;flex-wrap:wrap;gap:8px 18px}.pair,.extras{display:flex;gap:24px;flex-wrap:wrap}section{padding:12px 0 24px;border-bottom:1px solid #b8c8b5}figure{margin:0 0 18px;max-width:100%}figcaption{margin-bottom:8px}img{display:block;max-width:100%;height:auto;border:1px solid #c3cebd}p{max-width:950px}.note{padding:16px;background:white;border:1px solid #c3cebd;border-radius:12px}</style><main><h1>PDF 文档权限 · 设计与实页对照</h1><p class="note">12种设计在源码实施前冻结；21张最终实页保留原始字节。共同布局坐标最大差值0px，字体属性、颜色和Lucide图标路径分别核对。滚动区域会裁切当前视口之外的内容，点击图片可查看原图。保留实际焦点和原文选区；不声明字体逐像素一致或Android原生验收通过。</p><p><a href="comparison.json">布局／字体／图标测量</a> · <a href="design-freeze-v1.json">设计冻结</a> · <a href="browser-report.json">8组专项报告</a> · <a href="original-copy-map.json">原图来源</a> · <a href="build-provenance.json">构建来源</a> · <a href="../../Mobile_Pdf_Permissions_Task_2026-10-28.md">完整记录与竞品依据</a></p><nav>'''
page += ''.join('<a href="#' + name + '">' + html.escape(titles[name]) + '</a>' for name in titles) + '</nav>' + ''.join(sections) + '<h2>返回现场、说明、来源与保护</h2><div class="extras">' + extra_html + '</div><h2>修改前</h2><div class="extras"><figure><figcaption>旧权限面板</figcaption><a href="before-overview.png"><img src="before-overview.png" alt="修改前权限面板"></a></figure><figure><figcaption>旧短屏</figcaption><a href="before-short-320-200.png"><img src="before-short-320-200.png" alt="修改前短屏"></a></figure></div><p>范围：浏览器生产构建。系统返回、TalkBack、真实选择器与来源授权、原生选文菜单及生命周期仍需Android验收。本轮没有构建或发布APK。</p></main></html>'
(out / 'comparison.html').write_text(page, encoding='utf-8')

secrets = [s['publicTestPassword'] for s in read_json(Path('scripts/fixtures/mobile-pdf-permissions.json'))['samples'] if s.get('publicTestPassword')]
checked = []
for file in [*out.glob('*.json'), *out.glob('*.html'), Path('docs/design/mobile-pdf-permissions-task-v1/index.html'), Path('scripts/test-mobile-pdf-permissions-task-browser.mjs')]:
    data = file.read_text(encoding='utf-8')
    assert not any(secret in data for secret in secrets), 'Fixture credential in metadata: ' + str(file)
    checked.append(file.as_posix())
write_json('privacy-audit.json', {'nativeAndroidTest': False, 'fixtureCredentialsFound': False, 'filesChecked': checked, 'scope': 'Known public synthetic credentials checked in saved metadata and test source. Browser storage checked within all eight groups; screenshot helper refuses nonempty unmasked password inputs. Not a native autofill, memory-erasure or recent-tasks guarantee.'})
write_json('evidence-manifest.json', {p.name: digest(p.read_bytes()) for p in sorted(out.iterdir()) if p.is_file() and p.name != 'evidence-manifest.json'})
print(json.dumps({'copiedOriginals': len(copy_map), 'statesCompared': len(states), 'maximumCoordinateDifferencePx': maximum, 'sourceAndServedBuildVerified': True}))
