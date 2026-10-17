import { normalizeDisplayPreferences, type DisplayPreferences } from '../config/displayPreferences'
export interface DeliveryImage { source: string; dataUri: string }
export interface DeliveryResources { images: DeliveryImage[]; warnings: string[] }
const escape = (s: string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const allowed = new Set('p div span h1 h2 h3 h4 h5 h6 pre code blockquote ul ol li table thead tbody tfoot tr th td a img strong b em i del s u hr br sup sub details summary mark kbd abbr'.split(' '))
const discard = new Set('script style link meta iframe object embed form textarea button select video audio source svg math'.split(' '))

/** Only static semantic content is delivered, not editor handlers/blob URLs. */
export function deliveryDocument(title: string, html: string, resources: DeliveryResources, preferences: DisplayPreferences) {
  const parsed = new DOMParser().parseFromString(html,'text/html'), warnings=[...resources.warnings]
  const images=new Map(resources.images.map(item=>[item.source,item.dataUri]))
  for (const element of Array.from(parsed.body.querySelectorAll('*')).reverse()) {
    const name=element.localName
    if(name==='input') { element.replaceWith(parsed.createTextNode(element.hasAttribute('checked')?'☑ ':'☐ '));continue }
    if(discard.has(name)) { if(!['script','style','link','meta'].includes(name))warnings.push(`未交付交互内容：${name}；请核对预览。`);element.remove();continue }
    if(!allowed.has(name)) {element.replaceWith(...element.childNodes);continue}
    const attrs=Object.fromEntries(Array.from(element.attributes).map(a=>[a.name,a.value]))
    for(const attr of Array.from(element.attributes))element.removeAttribute(attr.name)
    if(name==='img') {
      const original=attrs.src||'',data=images.get(original)
      if(data&&/^data:image\/(png|jpeg|gif|webp|bmp|x-icon);base64,[A-Za-z0-9+/=]+$/.test(data)) {
        element.setAttribute('src',data);element.setAttribute('alt',attrs.alt||'')
      } else {
        const line=parsed.createElement('p');line.textContent=`[图片未携带：${attrs.alt||original||'未知图片'}] ${/^https?:\/\//i.test(original)?original:''}`
        element.replaceWith(line);warnings.push(`图片未携带：${original||'未知图片'}`)
      }
    }
    if(name==='a'&&attrs.href) {
      if(/^(https?:|mailto:|longedit:|#)/i.test(attrs.href))element.setAttribute('href',attrs.href)
      else warnings.push(`相对或不安全链接未作为可点击链接交付：${attrs.href}`)
      if(/^longedit:/i.test(attrs.href))warnings.push('应用内来源链接需要原资料库与 Long编辑。')
    }
    if(['th','td'].includes(name))for(const key of ['colspan','rowspan'])if(/^\d{1,2}$/.test(attrs[key]||''))element.setAttribute(key,attrs[key])
    if(name==='ol'&&/^-?\d{1,6}$/.test(attrs.start||''))element.setAttribute('start',attrs.start)
    if(attrs.title)element.setAttribute('title',attrs.title)
  }
  const p=normalizeDisplayPreferences(preferences)
  const names:Record<string,string>={sans:'Microsoft YaHei',serif:'SimSun',mono:'Consolas',yahei:'Microsoft YaHei',simsun:'SimSun',kaiti:'KaiTi',fangsong:'FangSong',notoSans:'Noto Sans SC',notoSerif:'Noto Serif SC',consolas:'Consolas'}
  // CSS string escapes every non-letter, including <, quotes, slash and newline.
  const font=(p.documentFont==='custom'?p.documentCustomFont:names[p.documentFont]||'Microsoft YaHei').replace(/[^\p{L}\p{N} -]/gu,c=>'\\'+c.codePointAt(0)!.toString(16)+' ')
  const css=`@page{size:auto;margin:18mm}html{color-scheme:light}body{margin:0 auto;padding:24px;max-width:850px;background:#fff;color:#20242b;font-family:"${font}","Microsoft YaHei",sans-serif;font-size:${p.documentFontSize}px;line-height:${p.documentLineHeight};letter-spacing:${p.documentLetterSpacing}px;text-align:${p.documentTextAlign};overflow-wrap:anywhere}p{margin:${p.documentParagraphSpacing}em 0}img{max-width:100%;height:auto}h1,h2,h3,h4,h5,h6{break-after:avoid}img,tr,blockquote{break-inside:avoid}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f5f7;padding:12px}code{font-family:Consolas,monospace}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #ccd2dc;padding:6px 10px}thead{display:table-header-group}blockquote{border-left:3px solid #8794a8;margin-left:0;padding-left:16px}@media print{body{max-width:none;padding:0}a{color:inherit;text-decoration:underline}details>*{display:block}}`
  const document=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; base-uri 'none'; form-action 'none'"><title>${escape(title)}</title><style>${css}</style></head><body><main>${parsed.body.innerHTML}</main></body></html>`
  return {document,warnings:[...new Set(warnings)]}
}

export async function waitForDeliveryFrame(frame: HTMLIFrameElement) {
  const doc=frame.contentDocument
  if(!doc?.querySelector('main'))throw Error('交付预览尚未加载，请重试')
  await doc.fonts.ready
  await Promise.all(Array.from(doc.images).map(img=>img.complete?Promise.resolve():new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('预览图片加载超时，未开始打印')),10000)
    img.onload=()=>{clearTimeout(timer);resolve()};img.onerror=()=>{clearTimeout(timer);reject(Error('预览图片加载失败，未开始打印'))}
  })))
  if(Array.from(doc.images).some(img=>!img.naturalWidth))throw Error('预览有图片加载失败，请先修复图片')
}
