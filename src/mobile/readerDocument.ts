import bridgeSource from './readerBridge.js?raw'
import { createSafeHtmlPreview } from '../utils/safeHtmlPreview'
import {decorateMarkdown,markdownReaderStyle} from './markdownPresentation'
import {plainTextReaderStyle} from './plainTextPresentation'
import {sourceCodeReaderStyle} from './codePresentation'
import {sourceFileInfo} from './codeFormats'
import { relativeImagePath } from './readingState'
import { parseMobilePdfReference, type MobilePdfReference } from './pdfReference'

export const READER_BRIDGE_HASH = 'PQIc6YPh1EhPC7jJPbcKmHvn6eksn6Gc+uhlnJFziVM='
export const readerBridgeSource = bridgeSource.replace(/\r\n/g, '\n')
export interface ReaderImage { index: number; path: string }
export function prepareReaderDocument(html: string, documentPath: string, dark: boolean, channel: string, rootId='local',fontData='',wrap=true) {
  const markdown=/\.md$/i.test(documentPath)
  const plainText=/\.txt$/i.test(documentPath)
  const sourceCode=!!sourceFileInfo(documentPath)
  if(!/^data:font\/woff2;base64,[A-Za-z0-9+/=]+$/.test(fontData))fontData=''
  const source = new DOMParser().parseFromString(html, 'text/html')
  source.querySelectorAll('plaintext').forEach(element => element.replaceWith(source.createTextNode(element.textContent || '')))
  source.querySelectorAll('*').forEach(element => { for (const attr of [...element.attributes]) if (attr.name.startsWith('data-longedit-')) element.removeAttribute(attr.name) })
  const sourceReferences:MobilePdfReference[]=[]
  source.querySelectorAll('a[href]').forEach(link=>{
    const target=parseMobilePdfReference(link.getAttribute('href')||'',rootId)
    if(target && sourceReferences.length<200){link.setAttribute('data-longedit-pdf-source',String(sourceReferences.length));sourceReferences.push(target)}
  })
  const originalSources = [...source.querySelectorAll('img')].map((image, index) => { image.dataset.longeditSource = String(index); return image.getAttribute('src') || '' })
  const parsed = new DOMParser().parseFromString(createSafeHtmlPreview(source.body.innerHTML), 'text/html')
  parsed.documentElement.lang='zh-CN'
  parsed.title=documentPath.split('/').pop()||'文档阅读'
  const imageSources = new Map([...parsed.body.querySelectorAll('img')].map(image => [image, originalSources[Number(image.dataset.longeditSource)] || '']))
  const links=new Map([...parsed.body.querySelectorAll('a[data-longedit-pdf-source]')].map(link=>[link,sourceReferences[Number(link.getAttribute('data-longedit-pdf-source'))]]))
  // Source styles and internal-looking attributes cannot affect our controller.
  parsed.querySelectorAll('style').forEach(element => element.remove())
  parsed.body.querySelectorAll('*').forEach(element => {
    for (const attr of [...element.attributes]) if (attr.name === 'style' || attr.name === 'id' || attr.name === 'name' || attr.name.startsWith('data-longedit-')) element.removeAttribute(attr.name)
  })
  const references:MobilePdfReference[]=[]
  for(const [link,target] of links) if(target && parsed.body.contains(link)) {
    link.setAttribute('href','#');link.setAttribute('data-longedit-pdf',String(references.length));link.classList.add('pdf-reference-link');references.push(target)
  }
  const images: ReaderImage[] = []
  parsed.body.querySelectorAll('img').forEach((image, index) => {
    // The shared sanitizer removes relative URLs. Only validated identities,
    // never source URLs, reach the native adapter or the live frame.
    const path = relativeImagePath(documentPath, imageSources.get(image) || '')
    const target = parsed.createElement('span'); target.className = 'image-placeholder'
    target.dataset.longeditImage = String(index); target.dataset.alt = image.getAttribute('alt') || path?.split('/').pop() || '图片'
    target.setAttribute('role', 'img'); target.setAttribute('aria-label', target.dataset.alt)
    target.textContent = !path ? `图片未加载：仅支持资料库内的 PNG、JPEG、WebP 相对图片（${target.dataset.alt}）` : images.length >= 12 ? '本页先加载前 12 张相对图片' : `正在读取图片：${target.dataset.alt}`
    target.setAttribute('aria-label', target.textContent)
    if (path && images.length < 12) images.push({ index, path })
    image.replaceWith(target)
  })
  const wrapper = parsed.createElement('article'); wrapper.id = 'longedit-reader-content'
  wrapper.append(...parsed.body.childNodes); parsed.body.append(wrapper)
  const codes=markdown?decorateMarkdown(wrapper,parsed):[]
  if(markdown)wrapper.dataset.longeditMarkdown='true'
  if(sourceCode)wrapper.querySelectorAll('.reader-source-line').forEach((line,index)=>{
    line.setAttribute('data-longedit-code-line',String(index+1))
    const gutter=line.querySelector<HTMLElement>('.reader-source-gutter'),text=line.querySelector<HTMLElement>('.reader-source-text')
    if(gutter){gutter.dataset.longeditDecoration='true';gutter.setAttribute('aria-hidden','true')}
    if(text){const leading=/^[\t ]*/.exec((text.textContent||'').replace(/^\uFEFF/,''))?.[0]||'';text.style.setProperty('--reader-indent',String(Math.min(96,leading.replace(/\t/g,'  ').length)))}
  })
  if(sourceCode){wrapper.dataset.longeditCode='true';wrapper.dataset.longeditWrap=String(wrap)}
  const csp = parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')!
  csp.setAttribute('content', `default-src 'none'; script-src 'sha256-${READER_BRIDGE_HASH}'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src ${markdown && fontData?'data:':"'none'"}; media-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`)
  const style = parsed.createElement('style')
  style.textContent = sourceCode ? sourceCodeReaderStyle(wrap) : plainText ? plainTextReaderStyle(dark) : markdown ? markdownReaderStyle(dark,fontData) : `:root{color-scheme:${dark ? 'dark' : 'light'}}*{box-sizing:border-box}html{overflow-wrap:anywhere;scroll-behavior:auto}body{font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;margin:0;padding:28px 24px 64px;line-height:1.95;font-size:1rem;background:${dark ? '#202722' : '#fcfcf8'};color:${dark ? '#e2e8e0' : '#283830'}}article{max-width:740px;margin:auto}h1{font-size:1.6875rem;line-height:1.45}h2{font-size:1.3125rem;margin-top:1.8em}blockquote{margin:24px 0;padding:4px 18px;border-left:3px solid #6c9b83}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{display:block;overflow:auto}img{max-width:100%;height:auto}a{color:inherit}mark{background:#f4df91;color:#25372a;border-radius:2px}mark.current-hit{background:#e7ad45;outline:2px solid #a06e22}.image-placeholder{display:block;padding:20px;margin:12px 0;border:1px dashed #8b9c8a;border-radius:10px;font-size:0.8125rem;line-height:1.7}`
  parsed.head.append(style)
  const script = parsed.createElement('script'); script.dataset.channel = channel; script.textContent = readerBridgeSource
  parsed.body.append(script)
  return { html: `<!doctype html>\n${parsed.documentElement.outerHTML}`, images, references, codes, blocks:wrapper.children.length }
}
