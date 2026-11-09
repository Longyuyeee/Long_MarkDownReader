"""Preserve raw captures, frozen prototypes and measurements of the production import task."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import json
import re
import shutil
import subprocess
import sys
import urllib.request
import html

out=Path('docs/evidence/mobile-pack-review-task-2026-10-28')
candidate,basic,incoming,retry,layers,replies=map(Path,sys.argv[1:7])
assert not (out/'browser-report.json').exists(),'Final evidence exists; create a new version.'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
digest=lambda b:sha256(b).hexdigest()
def save(name,value):
    (out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for v in ('1','2'):
    for file,expected in read(out/f'design-freeze-v{v}.json')['files'].items():assert digest(Path(file).read_bytes())==expected,file
report=read(candidate/'report.json');assert report['passed'] and len(report['checks'])==8 and not report['errors'] and not report['externalRequests']
assert all(not r['violations'] and not r['incomplete'] for r in report['accessibility'])
save('browser-report.json',report)
for name,folder,count in [('pack-import',basic,10),('incoming',incoming,14),('read-retry',retry,7),('task-layers',layers,9),('replies',replies,4)]:
    r=read(folder/'report.json');assert not r.get('failure') and not r.get('errors') and len(r['checks'])==count,name
    save(name+'-report.json',r)
for name in report['screens']:
    for suffix in ('.png','-geometry.json'):shutil.copyfile(candidate/(name+suffix),out/('actual-'+name+suffix))
failures={'unscoped-return-selector':Path('docs/evidence/mobile-0.1.0/pack-review-task-1793186985548'),'old-inline-preview-setup':Path('docs/evidence/mobile-0.1.0/incoming-browser-1793187454012')}
for name,folder in failures.items():
    save('first-failure-'+name+'.json',read(folder/'report.json'))
    if (folder/'failure.png').exists():shutil.copyfile(folder/'failure.png',out/('first-failure-'+name+'.png'))
shutil.copyfile(Path('docs/evidence/mobile-0.1.0/pack-review-task-1793187026818/source-confirmation.png'),out/'before-source-confirmation-inset.png')
shutil.copyfile(Path('docs/evidence/mobile-0.1.0/pack-review-task-1793187598121/deep-assets.png'),out/'before-insufficient-deep-fixture.png')
save('before-insufficient-deep-fixture-report.json',read(Path('docs/evidence/mobile-0.1.0/pack-review-task-1793187598121/report.json')))

freeze=read(out/'design-freeze-v2.json');comparison={'scope':'Ten frozen ordinary states; measured positions, sizes, font sizes, line heights, colors and names. Confirmation background fixtures differ and are not pixel-equality claims.','states':{},'maxCoordinateDelta':0,'differences':[]}
for name,state in freeze['states'].items():
    expected=state['geometry'];actual=read(candidate/(name+'-geometry.json'));assert len(expected)==len(actual),name;coordinates=0
    for a,b in zip(expected,actual):
        for field in a:
            if isinstance(a[field],(int,float)):
                delta=abs(a[field]-b[field]);coordinates+=1;comparison['maxCoordinateDelta']=max(comparison['maxCoordinateDelta'],delta)
                if delta>.1:comparison['differences'].append([name,a['tag'],field,a[field],b[field]])
            elif a[field]!=b[field]:comparison['differences'].append([name,a['tag'],field,a[field],b[field]])
    comparison['states'][name]={'elements':len(actual),'coordinates':coordinates}
save('visual-comparison.json',comparison);assert not comparison['differences'],comparison['differences']
provenance={'capturedAt':datetime.now(timezone.utc).isoformat(),'baseHead':'80139a8b7','candidate':str(candidate),'files':{},'unchangedEngines':{},'servedAssets':{}}
for file in ('src/mobile/PackImportPanel.vue','src/mobile/MobileApp.vue','src/mobile/IncomingCenter.vue','src/mobile/mobile.scss','scripts/test-mobile-pack-review-task-browser.mjs'):
    b=Path(file).read_bytes();provenance['files'][file]={'bytesSha256':digest(b),'gitLfSha256':digest(b.replace(b'\r\n',b'\n'))}
for file in ('src/mobile/storage.ts','src/mobile/packImport.ts','src/mobile/taskPosition.ts','src/mobile/RecoverySource.vue','src/mobile/SourceReader.vue','src/mobile/FileImportPanel.vue','src-tauri/plugins/mobile-storage/android/src/main/java/PackImports.kt','src-tauri/plugins/mobile-storage/android/src/main/java/PackageArchive.kt'):
    b=Path(file).read_bytes().replace(b'\r\n',b'\n');assert subprocess.check_output(['git','show','80139a8b7:'+file])==b,file;provenance['unchangedEngines'][file]=digest(b)
for file in re.findall(r'(?:src|href)="(\./assets/[^\"]+)"',Path('dist/mobile.html').read_text(encoding='utf-8')):
    expected=Path('dist',file).read_bytes()
    with urllib.request.urlopen('http://127.0.0.1:9012/'+file.removeprefix('./'),timeout=10)as response:served=response.read()
    assert expected==served,file;provenance['servedAssets'][file]=digest(expected)
save('provenance.json',provenance)
prototype=Path('docs/design/mobile-pack-review-task-v2/PackReviewPrototype.vue').read_text(encoding='utf-8').replace("'../../../src/mobile/","'./")
focus_rule='.pack-import-body:focus-visible{outline:2px solid var(--primary);outline-offset:-4px}\n'
assert prototype.replace('</style>',focus_rule+'</style>')==Path('src/mobile/PackImportPanel.vue').read_text(encoding='utf-8')
assert read(out/'replies-report.json')['componentSha256']==provenance['files']['src/mobile/PackImportPanel.vue']['bytesSha256']
save('prototype-runtime-match.json',{'matches':True,'base':'Frozen v2 prototype; only import paths are adapted and a keyboard focus-visible rule is added.','focusRule':focus_rule})
viewed=Path('docs/evidence/mobile-0.1.0/pack-review-task-1793187598121')
same=[];changed=[]
for name in report['screens']:
    previous=viewed/(name+'.png');current=candidate/(name+'.png')
    (same if previous.exists() and digest(previous.read_bytes())==digest(current.read_bytes()) else changed).append(name)
save('visual-review-reuse.json',{'previouslyViewed':str(viewed),'identicalOriginalScreenshots':same,'newOrChangedScreenshotsReviewedSeparately':changed})
save('research-sources.json',{'accessed':'2026-10-28','method':'Official help pages read via web search/open; no competitor installed or recorded. Specific import nesting, copy and preservation rules here are project design judgments.','sources':[
    {'title':'Bear: Working with attachments','url':'https://bear.app/faq/working-with-photos-gifs-pdfs-and-other-attachments/','finding':'On iOS, tapping a PDF opens it for reading; image adjustments are reached through contextual interactions. This supports entering content tasks as needed, not spreading every control on a single overview.'},
    {'title':'Obsidian: Mobile app','url':'https://obsidian.md/help/mobile','finding':'Mobile navigation provides back/forward and a menu for ribbon actions. It supports a reachable navigation entry and contextual task organization, but does not establish the importer design used here.'}
]})
cards=[]
for name in freeze['states']:
    cards.append(f'<article><h2>{html.escape(name)}</h2><div class="pair"><figure><figcaption>冻结设计 v2</figcaption><img src="design-v2-{name}.png" alt="{name}设计"></figure><figure><figcaption>正式App</figcaption><img src="actual-{name}.png" alt="{name}实页"></figure></div></article>')
extras=''.join(f'<figure><figcaption>{html.escape(name)}</figcaption><img src="actual-{name}.png" alt="{name}"></figure>'for name in report['screens']if name not in freeze['states'])
(out/'comparison.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>附件包手机核对任务：设计与实页</title><style>body{margin:24px;font:16px/1.7 system-ui;background:#f6f7f3;color:#203d31}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:20px}.pair{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0 0 20px}img{display:block;max-width:min(390px,90vw);height:auto;border:1px solid #dbe4d8}article{border-top:1px solid #dbe4d8;padding-top:12px}a{color:#246847}</style><main><h1>附件包：核对后再存入</h1><p>首页交代文件身份、去向和两个查看入口。正文、附件清单、图片分别进入，顶部返回与底部操作固定；返回保留各层现场。存储和整包保护继续复用。</p><p>原图未加工。短屏图为浏览器视口模拟，不能替代Android系统键盘、返回、授权或TalkBack验证。1×1图片为真实解码的测试位图，不是照片展示样本；确认弹窗背景使用不同合成资料。</p><p><a href="before/report.json">改前测量</a> · <a href="visual-comparison.json">十状态外形核对</a> · <a href="browser-report.json">正式App专项</a> · <a href="replies-report.json">延迟回复组件回归</a> · <a href="provenance.json">源码与服务核对</a> · <a href="research-sources.json">竞品依据</a> · <a href="design-freeze-v1.json">保留的v1</a> · <a href="design-freeze-v2.json">正式v2</a></p><article><h2>短屏改前／改后</h2><div class="pair"><figure><figcaption>改前：滚到主操作时顶部返回已离开视口</figcaption><img src="before/short.png" alt="改前短屏"></figure><figure><figcaption>改后：同为浅色，接收入口共享固定任务框架</figcaption><img src="actual-source-short-review.png" alt="改后短屏"></figure></div></article>'''+''.join(cards)+'<article><h2>实际状态补充</h2><div class="pair">'+extras+'</div></article></main></html>',encoding='utf-8')
for folder in (basic,Path('docs/evidence/mobile-0.1.0/pack-import-browser-1793187453952')):
    (folder/'.gitignore').write_text('*\n',encoding='utf-8')
print(json.dumps({'screens':len(report['screens']),'coordinates':sum(s['coordinates']for s in comparison['states'].values()),'maxCoordinateDelta':comparison['maxCoordinateDelta']}))
