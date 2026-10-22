"""Package full-window screenshots and measured layouts, without altering pixels."""
import html
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
private = root / '.release-secrets/ui-global-review'
destination = root / 'docs/design/full-window-review-2026-10-22'
destination.mkdir(parents=True, exist_ok=True)
images = destination / 'images'
images.mkdir(exist_ok=True)
pages = {}
for report_file in sorted(private.glob('*/report.json'), key=lambda p: p.stat().st_mtime):
    source = report_file.parent
    for page in json.loads(report_file.read_text(encoding='utf-8')):
        pages[page['id']] = (page, source)
assert len(pages) == 44
settings = ['编辑与保存', '外观', '格式与文件', '知识能力', '系统与更新', '隐私与诊断', 'AI']
notes = {
    'library': '小窗口保留正文与高频操作；重复快捷入口仍可在“更多”中使用。',
    'temp': '独立打开保留返回、保存与加入资料库入口。',
    'text': '格式状态与工具同行，编码与换行按需展开。',
    'docx': '删除重复返回入口，保留草稿状态、搜索和页面编辑。',
    'odf': '修正工具栏裁切；单元格编辑说明按需查看，草稿与另存副本保留。',
    'pptx': '修正窄窗口工具栏被截断；正文、放映、编辑和备注仍可访问。',
    'pdf': '内嵌工具栏压缩为两行；保留页码、阅读分组和未保存状态。',
    'table': '窄窗口工具保持一行横向浏览，四种数据视图保留。',
    'canvas': '缩放、适应内容、重新读取和保存移到页头。',
    'mindmap': '属性按需打开；缩窗后避免空白视野，缩放与帮助留在画布旁。',
    'drawio': '窄窗口用横向页面页签，节点属性按需展开。',
    'graph': '筛选与工具独立弹出；图例折叠后悬浮，缩窗保留视野中心与缩放。',
    'json': '属性栏按编辑区实际宽度收起，范围编辑必须显示的信息继续保留。',
    'yaml': '结构与问题按编辑区宽度收起，可用原按钮重新打开。',
    'xml': '元素导航按编辑区宽度收起，可用原按钮重新打开。',
    'toml': '配置分区按编辑区宽度收起，可用原按钮重新打开。',
    'diagram': '窄编辑区收起结构面板，保留源码、预览和结构编辑入口。',
    'sidebar-links': '长列表与错误内容可滚动，底部操作不会被截住。',
}
sections = []
links = []
summary = []
table = []
for key, (page, source) in pages.items():
    label = page['label']
    if key.startswith('settings-'):
        label = '设置：' + settings[int(key.split('-')[1]) - 1]
    for layout in page['layouts']:
        assert layout['overflow'] == 0 and not layout['clipControls'] and not layout['renderErrors'], (key, layout)
        assert not layout['alerts'], (key, layout['alerts'])
    assert not page['errors']
    for size in ['large', 'small', 'compact']:
        shutil.copyfile(source / f'{key}-{size}.png', images / f'{key}-{size}.png')
    links.append(f'<a href="#{key}">{html.escape(label)}</a>')
    note = notes.get(key, '保留现有操作，复查整窗布局、内容滚动和窄窗口下的可用空间。')
    figures = ''.join(f'<figure><figcaption>{caption}</figcaption><a href="images/{key}-{size}.png" target="_blank"><img loading="lazy" src="images/{key}-{size}.png" alt="{html.escape(label)} {caption}"></a></figure>' for size, caption in [('large','1920 × 1080'),('small','800 × 600')])
    sections.append(f'<section id="{key}"><h2>{html.escape(label)}</h2><p>{note}</p><div class="comparison">{figures}</div><details><summary>更小窗口：640 × 480</summary><a target="_blank" href="images/{key}-compact.png"><img loading="lazy" src="images/{key}-compact.png" alt="{html.escape(label)} 640 × 480"></a></details></section>')
    sizes = {row['size']: row['primary'] for row in page['layouts'] if row['style'] == 'minimal'}
    area = lambda size: f"{sizes[size]['width']}×{sizes[size]['height']}"
    table.append(f'| {label} | {area("large")} | {area("normal")} | {area("small")} | {area("compact")} | {note} |')
    summary.append({**page, 'label': label})
checks = json.loads((private / 'after/interactions.json').read_text(encoding='utf-8'))
layouts = sum(len(page['layouts']) for page, _ in pages.values())
page_html = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Long编辑 · 完整窗口界面复查</title><style>
*{box-sizing:border-box}body{margin:0;background:#edf1f6;color:#203049;font:15px/1.6 system-ui,"Microsoft YaHei",sans-serif}header,main{max-width:1720px;margin:auto;padding:24px}h1{margin:0;font-size:28px}header p{color:#53647b}nav{display:flex;flex-wrap:wrap;gap:7px}nav a{padding:4px 10px;background:#fff;border-radius:7px}a{color:#2359c6}section{scroll-margin-top:16px;margin-bottom:28px;background:white;border:1px solid #d6dfe9;border-radius:12px;padding:18px}h2{margin:0;font-size:21px}section>p{color:#53647b;margin:6px 0 14px}.comparison{display:grid;grid-template-columns:1.45fr 1fr;gap:16px;align-items:start}figure{margin:0}figcaption{font-size:13px;color:#53647b;margin-bottom:6px}img{display:block;width:100%;height:auto;border:1px solid #d6dfe9}details{margin-top:12px}details img{max-width:640px;margin-top:12px}summary{cursor:pointer;color:#2359c6}@media(max-width:950px){.comparison{grid-template-columns:1fr}header,main{padding:12px}section{padding:12px}}
</style><header><h1>完整窗口界面复查</h1>'''
page_html += f'<p>44 个页面与子页面 · {layouts} 组窗口与风格布局。截图包含真实应用外壳、导航、工具栏与内容区；使用模拟文件数据。点击图片查看原尺寸。正常窗口 1000 × 700 也参与检查。28 个主要页面覆盖全部六种风格，补充子页面另列检查。</p><nav>' + ''.join(links) + '</nav></header><main>' + ''.join(sections) + '</main></html>'
(destination / 'index.html').write_text(page_html, encoding='utf-8')
evidence = root / 'docs/evidence/ui-full-window-2026-10-22'
evidence.mkdir(parents=True, exist_ok=True)
(evidence / 'summary.json').write_text(json.dumps({'pages':len(pages),'layouts':layouts,'sizes':['1920×1080','1000×700','800×600','640×480'],'interactions':checks,'results':summary}, ensure_ascii=False, indent=2), encoding='utf-8')
(destination / 'page-inventory.md').write_text('# 完整窗口逐页复查\n\n尺寸为主要内容区的实测宽×高，不是截图裁切。小窗口中的侧栏按需打开，内容型列表可滚动。\n\n| 页面 | 1920×1080 | 1000×700 | 800×600 | 640×480 | 处理说明 |\n| --- | --- | --- | --- | --- | --- |\n' + '\n'.join(table) + '\n', encoding='utf-8')
print(json.dumps({'pages':len(pages),'layouts':layouts,'interactions':checks['passed'],'gallery':str(destination / 'index.html')}, ensure_ascii=False))
