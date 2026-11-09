import {readFile,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const directory=process.argv[2]
if(!directory)throw new Error('Supply the native alignment evidence directory')
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Android 实页修正前后</title><style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#e9ede6;color:#263a30;font:14px "Microsoft YaHei",sans-serif}h1{font-size:19px;margin:0 0 10px}p{line-height:1.6}main{display:flex;gap:24px}figure{margin:0;width:390px}figcaption{margin-bottom:8px}img{display:block;width:390px;height:auto}footer{max-width:804px;margin-top:12px;line-height:1.6}</style><h1>Android · 同一份 PDF 第 3 页</h1><p>专用 API29 模拟器真实截图；两次均保留原有的三项待核对内容。</p><main><figure><figcaption>修正前 · 1002041</figcaption><img src="before-style.png" alt="修正前实际页面"></figure><figure><figcaption>修正后 · 1002042</figcaption><img src="outline.png" alt="修正后实际页面"></figure></main><footer>检查标题、关闭按钮、短下划线、父子字重、树状连接线、当前页卡片与继续阅读按钮。原始截图保持1080×2280，未裁剪、替换文字或修改应用内容；此处仅等宽显示。</footer></html>'
await writeFile(resolve(directory,'native-comparison.html'),html)
let rendered=html
for(const name of ['before-style.png','outline.png'])rendered=rendered.replace('src="'+name+'"','src="data:image/png;base64,'+(await readFile(resolve(directory,name))).toString('base64')+'"')
const browser=await chromium.launch({channel:'chrome',headless:true})
try {const page=await browser.newPage({viewport:{width:840,height:1100},deviceScaleFactor:1});await page.setContent(rendered);await page.evaluate(()=>Promise.all(Array.from(document.images).map(image=>image.decode())));await page.screenshot({path:resolve(directory,'native-comparison.png'),fullPage:true})}finally{await browser.close()}
console.log(directory+'/native-comparison.png')
