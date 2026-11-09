"""Save unchanged originals and compare the text export task with its frozen design."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import html
import json
import shutil
import subprocess
import sys
import urllib.request

out = Path('docs/evidence/mobile-text-export-task-2026-10-28')
candidate, replies, basic, recovery, help_run = map(Path, sys.argv[1:6])
assert not (out / 'browser-report.json').exists(), 'Keep existing final evidence; use a new version.'
hash_bytes = lambda b: sha256(b).hexdigest()
read_json = lambda p: json.loads(p.read_text(encoding='utf-8'))
def save(name, value):
    (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

freeze = read_json(out / 'design-freeze-v1.json')
for file, value in freeze['files'].items():
    assert hash_bytes(Path(file).read_bytes()) == value, file
report = read_json(candidate / 'report.json')
assert report['passed'] and len(report['checks']) == 8 and not report['errors'] and not report['externalRequests']
for folder, count in [(replies, 3), (basic, 6), (recovery, 9)]:
    result = read_json(folder / 'report.json')
    assert result['passed'] and len(result['checks']) == count, str(folder)
assert read_json(help_run / 'result.json')['status'] == 'passed'
assert len(read_json(help_run / 'result.json')['checks']) == 14
copy_map = []
def preserve(source, name):
    target = out / name
    assert not target.exists(), name
    shutil.copyfile(source, target)
    assert source.read_bytes() == target.read_bytes()
    copy_map.append({'source': source.as_posix(), 'target': target.as_posix(), 'sha256': hash_bytes(target.read_bytes())})

preserve(candidate / 'report.json', 'browser-report.json')
for screen in report['screens']:
    preserve(candidate / (screen['name'] + '.png'), 'actual-' + screen['name'] + '.png')
for folder, name, source in [(replies, 'component-replies-report.json', 'report.json'), (basic, 'text-export-regression-report.json', 'report.json'), (recovery, 'recovery-report.json', 'report.json'), (help_run, 'help-report.json', 'result.json')]:
    preserve(folder / source, name)
before = Path('docs/evidence/mobile-0.1.0/text-export-task-before-1793175056593')
preserve(before / 'report.json', 'before-report.json')
for name in ['review', 'failure', 'result', 'short-320-200']:
    preserve(before / (name + '.png'), 'before-' + name + '.png')
for suffix, name in [('1793175734676', 'failed-button-selector'), ('1793175961985', 'failed-background-selector'), ('1793176074280', 'failed-theme-entry'), ('1793176175893', 'incomplete-preview-contrast')]:
    folder = Path('docs/evidence/mobile-0.1.0/text-export-task-candidate-' + suffix)
    preserve(folder / 'report.json', name + '-report.json')
    preserve(folder / 'failure-test.png', name + '.png')
previous = Path('docs/evidence/mobile-0.1.0/text-export-task-candidate-1793176327695')
preserve(previous / 'report.json', 'before-tap-refinement-report.json')
for name in ['help', 'long-preview']:
    preserve(previous / (name + '.png'), 'before-tap-' + name + '.png')
for suffix in ['1793176131436', '1793176255625']:
    folder = Path('docs/evidence/mobile-0.1.0/text-export-browser-' + suffix)
    preserve(folder / 'report.json', 'legacy-text-regression-' + suffix + '.json')
folder = Path('docs/evidence/mobile-0.1.0/recovery-layers-browser-1793176131446')
preserve(folder / 'report.json', 'legacy-recovery-entry-report.json')
save('original-copy-map.json', copy_map)

states, maximum = [], 0
for name, reference in freeze['geometry'].items():
    observed = report['geometry'][name]
    count = 0
    for selector, bounds in reference.items():
        actual = observed[selector]
        assert bool(bounds) == bool(actual), (name, selector)
        if bounds:
            for prop, value in bounds.items():
                delta = abs(actual[prop] - value)
                maximum = max(maximum, delta)
                assert delta <= .05, (name, selector, prop, delta)
                count += 1
    assert report['typography'][name] == freeze['typography'][name], name + ' typography'
    assert report['icons'][name] == freeze['icons'][name], name + ' icons'
    states.append({'screen': name, 'coordinatesCompared': count, 'computedTypographyAndColorsMatch': True, 'lucidePrimitivesMatch': True})
save('comparison.json', {'reference': 'design-freeze-v1.json', 'maximumCoordinateDifferencePx': maximum, 'states': states, 'scope': '11 browser states: 390x844, 320x627 at 200%, and 320x273 at 200% with body scrolled to end. Geometry, computed typography/colors and icon primitives; no claim of pixel-identical rasterization or Android UI verification.'})
visual = []
for screen in report['screens']:
    name = screen['name']
    original, final = previous / (name + '.png'), out / ('actual-' + name + '.png')
    same = original.read_bytes() == final.read_bytes()
    visual.append({'file': final.as_posix(), 'sha256': hash_bytes(final.read_bytes()), 'identicalToViewedOriginal': original.as_posix() if same else None, 'requiresDirectFinalReview': not same})
save('visual-review.json', {'recordedAt': datetime.now(timezone.utc).isoformat(), 'scope': 'All 11 frozen reference PNGs and all 15 prior candidate PNGs directly viewed; final identical bytes inherit that review, changed originals must be separately viewed. Raw focus, selection and scrolled clipping retained; no image processing.', 'images': visual})

git = lambda *args: subprocess.check_output(['git', *args])
sources, unchanged = {}, {}
for file in ['src/mobile/TextExport.vue', 'src/mobile/MobileApp.vue', 'src/mobile/mobile.scss', 'src/mobile/mobileHelp.ts']:
    data = Path(file).read_bytes()
    sources[file] = {'workingSha256': hash_bytes(data), 'gitLfSha256': hash_bytes(data.replace(b'\r\n', b'\n'))}
for file in ['src/mobile/textExport.ts', 'src/mobile/storage.ts', 'src/mobile/documentBudget.ts', 'src/mobile/SourceReader.vue', 'src/mobile/RecoverySource.vue', 'src/mobile/RecoveryCenter.vue', 'src/mobile/taskPosition.ts', 'src/mobile/portablePack.ts']:
    data = Path(file).read_bytes().replace(b'\r\n', b'\n')
    assert data == git('show', '31e049ed1:' + file), file
    unchanged[file] = hash_bytes(data)
assets, served = {}, {}
for file in [Path('dist/mobile.html'), *[p for p in Path('dist/assets').iterdir() if p.suffix in ['.js', '.css', '.mjs']]]:
    data = file.read_bytes()
    response = urllib.request.urlopen('http://127.0.0.1:9012/' + file.relative_to('dist').as_posix()).read()
    assert response == data, str(file)
    assets[file.as_posix()] = hash_bytes(data)
    served[file.as_posix()] = hash_bytes(response)
save('build-provenance.json', {'baseHead': '31e049ed1', 'buildCommand': 'npm run build:mobile', 'buildExit': 0, 'capturedAt': datetime.now(timezone.utc).isoformat(), 'nativeAndroidTest': False, 'sources': sources, 'unchangedModules': unchanged, 'assets': assets, 'servedAssets': served, 'validation': 'Final production build: task 8 groups, isolated deferred storage reply component 3, text export regression 6, recovery 9, Help 14. Component reply tests are not native IPC or system picker tests.'})

titles = {'review': '核对导出', 'dirty': '包含未保存输入', 'preview': '完整文字预览', 'failure': '下载失败', 'result': '下载结果', 'retained': '恢复记录仍保留', 'review-dark': '深色核对页', 'failure-dark': '深色错误', 'preview-320-200': '320px／200%预览', 'short-failure-320-200': '短屏错误与重试', 'empty-preview': '空内容预览'}
sections = []
for name in freeze['geometry']:
    sections.append('<section id="' + name + '"><h2>' + html.escape(titles[name]) + '</h2><div class="pair"><figure><figcaption>冻结设计 v1</figcaption><a href="design-v1-' + name + '.png"><img src="design-v1-' + name + '.png" alt="' + html.escape(titles[name]) + '设计图"></a></figure><figure><figcaption>生产构建实页</figcaption><a href="actual-' + name + '.png"><img src="actual-' + name + '.png" alt="' + html.escape(titles[name]) + '实际页面"></a></figure></div></section>')
extras = ''.join('<figure><figcaption>' + html.escape(s['name']) + '</figcaption><a href="actual-' + s['name'] + '.png"><img src="actual-' + s['name'] + '.png" alt="' + html.escape(s['name']) + '"></a></figure>' for s in report['screens'] if s['name'] not in titles)
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文字导出 · 设计与实页对照</title><style>body{font:16px/1.65 system-ui,sans-serif;margin:24px;background:#eef2eb;color:#263a30}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:21px}a{color:#256044}nav{display:flex;flex-wrap:wrap;gap:8px 18px}.pair,.extras{display:flex;gap:24px;flex-wrap:wrap}section{padding:12px 0 24px;border-bottom:1px solid #b8c8b5}figure{margin:0 0 18px;max-width:100%}figcaption{margin-bottom:8px}img{display:block;max-width:100%;height:auto;border:1px solid #c3cebd}p{max-width:950px}.note{padding:16px;background:white;border:1px solid #c3cebd;border-radius:12px}</style><main><h1>文字导出 · 设计与实页对照</h1><p class="note">11种设计在源码修改前冻结；15张正式App浏览器实页保留原始字节。共同布局坐标最大差值0px，字体、颜色及Lucide图标路径匹配。保留真实焦点和滚动裁切，点击图片可看原图；不声明字体逐像素一致或Android系统验收通过。</p><p><a href="comparison.json">测量结果</a> · <a href="design-freeze-v1.json">冻结设计</a> · <a href="browser-report.json">8组专项</a> · <a href="component-replies-report.json">测试回调组件验证</a> · <a href="original-copy-map.json">原图来源</a> · <a href="build-provenance.json">构建来源</a> · <a href="../../Mobile_Text_Export_Task_2026-10-28.md">审计、竞品与开发记录</a></p><nav>'''
page += ''.join('<a href="#' + n + '">' + html.escape(titles[n]) + '</a>' for n in titles) + '</nav>' + ''.join(sections) + '<h2>长文、长名称、说明与保护失败</h2><div class="extras">' + extras + '</div><h2>改前原图</h2><div class="extras"><figure><figcaption>改前导出</figcaption><a href="before-review.png"><img src="before-review.png" alt="改前导出面板"></a></figure><figure><figcaption>改前短屏</figcaption><a href="before-short-320-200.png"><img src="before-short-320-200.png" alt="改前短屏"></a></figure></div><p>实际下载与原文／草稿保护在浏览器验证；模拟存储回调只验证组件分支。系统选择器、真实键盘、返回、TalkBack与生命周期仍需原生验收。本轮没有构建、安装或发布APK。</p></main></html>'
(out / 'comparison.html').write_text(page, encoding='utf-8')
save('evidence-manifest.json', {p.name: hash_bytes(p.read_bytes()) for p in sorted(out.iterdir()) if p.is_file() and p.name != 'evidence-manifest.json'})
print(json.dumps({'copiedOriginals': len(copy_map), 'statesCompared': len(states), 'coordinatesCompared': sum(s['coordinatesCompared'] for s in states), 'maximumCoordinateDifferencePx': maximum, 'changedFinalScreens': [p['file'] for p in visual if p['requiresDirectFinalReview']]}))
