"""Create a new version only; never replace frozen design inputs."""
from pathlib import Path
import json
import re

root = Path('docs/design/mobile-pdf-bookmark-task-v1')
root.mkdir(exist_ok=True)
assert not (root / 'index.html').exists(), 'Design source already exists'
base = Path('docs/design/mobile-pdf-navigation-v2/index.html').read_text(encoding='utf-8').split('</style>')[0]
settings = Path('src/mobile/MobilePdfSettings.vue').read_text(encoding='utf-8')
layer = settings[settings.index('.pdf-settings-layer {'):settings.index('</style>')].replace('pdf-settings', 'pdf-bookmark')
css = '''
/* bookmark-task */
.pdf-navigation-surface{display:flex;flex:1;flex-direction:column;min-height:0}
.pdf-bookmark-add{display:flex;gap:8px;font-size:1rem}
.pdf-bookmark-actions{border:0;padding:0}.pdf-bookmark-actions .icon-button{display:grid;place-items:center;min-width:48px;min-height:48px;width:48px;height:48px;border:0;background:transparent!important;color:var(--muted)}
.pdf-bookmark-title{margin:12px 0 8px}.pdf-bookmark-card{padding:8px}.pdf-bookmark-open{min-height:52px}
.pdf-bookmark-resume{display:flex;align-items:center;gap:12px;width:100%;text-align:left;margin:12px 0;padding:12px;border:1px solid var(--primary);border-radius:10px;background:var(--primary-soft);color:var(--ink)}.pdf-bookmark-resume span{flex:1;min-width:0;overflow-wrap:anywhere}.pdf-bookmark-resume strong,.pdf-bookmark-resume small{display:block;font-size:.875rem;line-height:1.6}.pdf-bookmark-resume small{color:var(--muted);font-weight:400}
''' + layer + '''
.pdf-bookmark-target{margin:0 0 16px;overflow-wrap:anywhere}.pdf-bookmark-target strong{display:block;font-size:1rem;line-height:1.5;font-weight:650}.pdf-bookmark-target small{display:block;margin-top:4px;color:var(--muted);font-size:.875rem;line-height:1.5}
.pdf-bookmark-choice{display:flex;align-items:center;gap:12px;min-height:56px;width:100%;padding:12px 4px;border:0;border-top:1px solid var(--line);background:transparent;color:var(--ink);font-size:1rem;text-align:left;overflow-wrap:anywhere}.pdf-bookmark-choice svg{flex:none}.pdf-bookmark-choice.danger{color:var(--warning-ink,#884632)}
.pdf-bookmark-rename label{display:block;font-size:1rem;line-height:1.5;margin-bottom:8px}.pdf-bookmark-rename input{display:block;min-height:48px;width:100%;min-width:0;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit}.pdf-bookmark-rename input:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.pdf-bookmark-confirm-copy{font-size:.875rem;line-height:1.6;margin:12px 0 0;overflow-wrap:anywhere}.pdf-bookmark-dialog-footer .danger-button{background:var(--warning-ink,#884632);border-color:var(--warning-ink,#884632);color:var(--bg)}
/* end bookmark-task */
'''
icons = {}
for key, file in {'more':'ellipsis','pencil':'pencil','trash':'trash-2','bookmark':'bookmark','help':'circle-question-mark','x':'x','chevron':'chevron-right','undo':'undo-2','back':'arrow-left'}.items():
    source = Path('node_modules/lucide-vue-next/dist/esm/icons/' + file + '.js').read_text(encoding='utf-8')
    nodes = re.findall(r'\[\s*"(path|circle|line|polyline|rect)"\s*,\s*\{\s*([^}]+)\s*\}\s*\]', source, re.S)
    assert len(nodes) == len(re.findall(r'\[\s*"(?:path|circle|line|polyline|rect)"', source)), file
    icons[key] = ''.join('<' + tag + ' ' + ' '.join(k+'="'+v+'"' for k,v in re.findall(r'(\w+):\s*"([^"]*)"', fields) if k != 'key') + ' />' for tag,fields in nodes)
script = r'''
const screen=new URLSearchParams(location.search).get('screen')||'list',icons=ICONS;
const icon=(name,size=22)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const layer=['menu','rename','delete','invalid'].includes(screen),removed=screen==='undo',empty=screen==='empty',pending=screen==='pending',items=empty?[]:[[1,'阅读从这里开始'],[3,'安静阅读'],[7,'复习与整理']].filter(([n])=>!removed||n!==1);
const card=([n,t])=>`<li class="pdf-bookmark-card ${n===3?'is-current':''}"><div class="pdf-bookmark-row"><button class="pdf-bookmark-open">${icon('bookmark',21).replace('fill="none"',n===3?'fill="currentColor"':'fill="none"')}<span><strong>${t}</strong><small>第 ${n} 页${n===3?' · <span>当前页</span>':''}</small></span></button><div class="pdf-bookmark-actions"><button class="icon-button">${icon('more')}</button></div></div></li>`;
const content=`<button class="button pdf-bookmark-add">${icon('bookmark',20)}${empty?'添加本页书签':'本页书签操作'}</button>${pending?`<button class="pdf-bookmark-resume"><span><strong>继续修改名称</strong><small>第 3 页 · 安静阅读</small></span>${icon('chevron',20)}</button>`:''}${removed?`<div class="pdf-bookmark-undo"><span>已删除「阅读从这里开始」</span><button class="text-button">${icon('undo',17)}撤销删除</button></div>`:''}<p class="pdf-bookmark-title">我的书签 · ${items.length} 枚</p>${empty?`<div class="pdf-bookmark-empty">${icon('bookmark',38)}<h3>还没有书签</h3></div>`:`<ol class="pdf-bookmark-list">${items.map(card).join('')}</ol>`}`;
const rename=['rename','invalid'].includes(screen),del=screen==='delete',title=rename?'重命名书签':del?'删除书签？':'书签操作';
const target=`<p class="pdf-bookmark-target"><strong>安静阅读</strong><small>第 3 页</small></p>`;
const dialog=`<div class="pdf-bookmark-layer"><section class="pdf-bookmark-dialog"><header class="pdf-bookmark-dialog-header"><h2>${title}</h2><button class="mobile-help-trigger">${icon('help',20)}</button><button class="pdf-bookmark-dialog-close">${icon('x')}</button></header><div class="pdf-bookmark-dialog-body">${target}${rename?`<form class="pdf-bookmark-rename"><label for="pdf-bookmark-name">书签名称</label><input id="pdf-bookmark-name" value="${screen==='invalid'?'':'带着想法回来😀'}" /></form>${screen==='invalid'?'<p class="pdf-bookmark-error">书签名称请填写 1 到 80 个字，不能包含控制字符。</p>':''}`:del?'<p class="pdf-bookmark-confirm-copy">删除这枚书签？原 PDF 和批注不会改变。</p>':`<button class="pdf-bookmark-choice">${icon('pencil',20)}重命名</button><button class="pdf-bookmark-choice danger">${icon('trash',20)}删除书签</button>`}</div><footer class="pdf-bookmark-dialog-footer">${rename?'<button class="button">取消修改</button><button class="button primary-button">保存名称</button>':del?'<button class="button">保留书签</button><button class="button danger-button">确认删除书签</button>':'<button class="button">返回书签</button>'}</footer></section></div>`;
document.querySelector('.phone').innerHTML=`<section class="pdf-navigation"><div class="pdf-navigation-surface"><header class="pdf-navigation-heading"><button class="pdf-navigation-back">${icon('back')}</button><h1>我的书签</h1><button class="mobile-help-trigger">${icon('help')}</button></header><div class="pdf-navigation-context"><p class="pdf-navigation-file">阅读导航.pdf</p><span class="pdf-navigation-count">共 9 页</span></div><div class="pdf-navigation-tabs">${[['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01','目录'],['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z|M14 2v6h6','页面'],['M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z','书签']].map(([d,t])=>`<button class="text-button" aria-pressed="${t==='书签'}"><span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d.split('|').map(p=>'<path d="'+p+'"/>').join('')}</svg>${t}${t==='书签'&&items.length?'<small>'+items.length+'</small>':''}</span></button>`).join('')}</div><div class="pdf-navigation-body"><section class="pdf-bookmarks">${content}</section></div><footer class="pdf-navigation-footer"><button class="button primary-button">继续阅读 · 第 3 页</button></footer></div>${layer?dialog:''}</section>`;
if(rename)document.querySelector('input').focus();
'''.replace('ICONS', json.dumps(icons, ensure_ascii=False))
(root / 'index.html').write_text(base + css + '</style><div class="phone"></div><script>' + script + '</script></html>', encoding='utf-8')

capture = Path('scripts/capture-mobile-pdf-settings-task-design.mjs').read_text(encoding='utf-8')
capture = capture.replace('pdf-settings-task','pdf-bookmark-task').replace("['reader','settings','mode','direction','zoom','zoom-edited','modified','text']", "['empty','list','menu','rename','pending','delete','undo','invalid']").replace('mobile-pdf-settings-v3','mobile-pdf-bookmark-task-v1').replace('design-freeze-v3','design-freeze-v1').replace('design-v3-','design-v1-').replace("'d70633220'", "'7cb25e276'")
capture = capture.replace("if(screen==='reader')await page.locator('img').evaluate(e=>e.decode());", '').replace("'docs/design/mobile-pdf-bookmark-task-v1/assets/page-3.png',", '')
a,b = capture.index('capture.geometry[screen]='),capture.index('\nfor(const file')
capture = capture[:a] + '''capture.geometry[screen]=await page.evaluate(()=>Object.fromEntries(['.pdf-navigation','.pdf-navigation-heading','.pdf-navigation-context','.pdf-navigation-tabs','.pdf-navigation-body','.pdf-bookmark-add','.pdf-bookmark-card','.pdf-bookmark-layer','.pdf-bookmark-dialog','.pdf-bookmark-dialog-header','.pdf-bookmark-dialog-body','.pdf-bookmark-dialog-footer','#pdf-bookmark-name','.pdf-navigation-footer'].map(s=>{const r=document.querySelector(s)?.getBoundingClientRect();return[s,r?{x:r.x-24,y:r.y-24,width:r.width,height:r.height}:null]})))}''' + capture[b:]
Path('scripts/capture-mobile-pdf-bookmark-task-design.mjs').write_text(capture, encoding='utf-8')
