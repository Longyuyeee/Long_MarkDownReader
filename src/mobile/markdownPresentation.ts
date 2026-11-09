import {markdownCodeLanguage} from './markdownCode'
export interface ReaderCodeBlock{text:string;language:string}
/** Decorate sanitized content without changing the number or order of article
 * blocks, so existing paragraph bookmarks retain their source identities. */
export function decorateMarkdown(article:HTMLElement,document:Document):ReaderCodeBlock[]{
 const codes:ReaderCodeBlock[]=[]
 for(const pre of article.querySelectorAll('pre')){
  const code=pre.querySelector('code');if(!code||codes.length>=128)continue
  const index=codes.length,language=markdownCodeLanguage([...code.classList].find(c=>c.startsWith('language-'))?.slice(9)||'');codes.push({text:code.textContent||'',language:language.label})
  const block=document.createElement('div');block.className='reader-code-block';pre.replaceWith(block)
  const toolbar=document.createElement('div');toolbar.className='reader-code-toolbar';toolbar.dataset.longeditDecoration='true'
  const label=document.createElement('span');label.textContent=language.label
  const status=document.createElement('span');status.className='reader-code-status';status.dataset.longeditCopyStatus=String(index);status.setAttribute('role','status');status.setAttribute('aria-live','polite')
  const copy=document.createElement('button');copy.type='button';copy.dataset.longeditCopyCode=String(index);copy.setAttribute('aria-label',`复制第 ${index+1} 段代码`)
  copy.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>'
  toolbar.append(label,status,copy);block.append(toolbar,pre)
 }
 for(const table of article.querySelectorAll('table')){
  const wrapper=document.createElement('div');wrapper.className='reader-table-scroll';wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','表格，可横向滚动');table.replaceWith(wrapper);wrapper.append(table)
 }
 // Contain margins in one flow box per original block. Otherwise a bookmark
 // taken between paragraphs is clamped to the next paragraph's top on restore.
 for(const element of [...article.children]){
  const block=document.createElement('div');block.className='reader-paragraph-block';element.replaceWith(block);block.append(element)
 }
 return codes
}
export function markdownReaderStyle(dark:boolean,fontData=''){
 return `${fontData?`@font-face{font-family:LongEditReadingSerif;src:url("${fontData}") format("woff2");font-weight:700;font-style:normal;font-display:swap}`:''}
:root{color-scheme:${dark?'dark':'light'};--canvas:${dark?'#111c28':'#fafbf8'};--ink:${dark?'#eef5f5':'#172a24'};--muted:${dark?'#b0c2c9':'#5c6f65'};--accent:${dark?'#6cdda9':'#267458'};--line:${dark?'#3c545d':'#ccded6'};--quote:${dark?'#153535':'#eaf3ed'};--code:${dark?'#162a35':'#f4f8f5'};--code-bar:${dark?'#1d3540':'#e8f1eb'};--keyword:${dark?'#d2aff7':'#783caa'};--string:${dark?'#b6df9b':'#3c7524'};--number:${dark?'#efc57d':'#97601b'};--symbol:${dark?'#8bd6e5':'#24748b'};--function:${dark?'#f4d67e':'#946000'}}
*{box-sizing:border-box}html{overflow-wrap:anywhere;scroll-behavior:auto}body{margin:0;padding:0 24px;background:var(--canvas);color:var(--ink);font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;font-size:1rem;line-height:1.5}article{max-width:700px;margin:auto;min-width:0}.reader-paragraph-block{display:flow-root}.reader-paragraph-block:first-child{padding-top:16px}.reader-paragraph-block:first-child>:first-child{margin-top:0}.reader-paragraph-block:last-child{padding-bottom:80px}.reader-paragraph-block:last-child>:last-child{margin-bottom:0}
h1,h2,h3,h4,h5,h6{color:var(--ink);overflow-wrap:anywhere}h1{font-family:LongEditReadingSerif,"Noto Serif CJK SC","Songti SC",SimSun,serif;font-size:1.75rem;font-weight:700;line-height:1.4;margin:0 0 12px;letter-spacing:0}h2{font-size:1.3125rem;line-height:1.5;margin:28px 0 12px}h3{font-size:1.125rem;line-height:1.5;margin:24px 0 10px}h4,h5,h6{font-size:1rem;margin:20px 0 10px}p{margin:0 0 12px}strong{font-weight:650}a{color:var(--accent);text-underline-offset:3px}ul,ol{margin:0 0 16px;padding-left:1.6em}li{padding-left:2px;margin:5px 0}li>p{margin-bottom:6px}hr{border:0;border-top:1px solid var(--line);margin:24px 0}
blockquote{margin:0 0 12px;padding:9px 16px;border-left:3px solid var(--accent);border-radius:0 8px 8px 0;background:var(--quote);font-family:"Noto Serif CJK SC","Songti SC",SimSun,serif;font-style:italic;line-height:1.6}blockquote p:last-child{margin-bottom:0}blockquote blockquote{margin:10px 0 0}
code,pre{font-family:"SFMono-Regular",Consolas,monospace;tab-size:2}p code,li code,td code{padding:2px 5px;border-radius:4px;background:var(--quote);font-size:.875em;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.reader-code-block{margin:0 0 18px;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--code);break-inside:avoid}.reader-code-toolbar{display:flex;align-items:center;min-height:48px;gap:8px;padding:0 0 0 12px;background:var(--code-bar);font-family:system-ui,-apple-system,sans-serif;font-size:.8125rem;line-height:1.4}.reader-code-toolbar>span:first-child{flex:1;min-width:0;overflow-wrap:anywhere}.reader-code-status{max-width:45%;overflow-wrap:anywhere}.reader-code-toolbar>button{width:48px;min-width:48px;min-height:48px;align-self:stretch;border:0;background:none;color:var(--ink);display:grid;place-items:center;touch-action:manipulation}.reader-code-toolbar>button:active{background:var(--quote)}button:focus-visible,a:focus-visible,.reader-table-scroll:focus-visible{outline:2px solid var(--accent);outline-offset:-3px}.reader-code-block pre{margin:0;padding:10px 12px 12px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.875rem;line-height:1.5;color:var(--ink)}.reader-code-block code{font:inherit;white-space:inherit}pre:not(.reader-code-block pre){white-space:pre-wrap;overflow-wrap:anywhere}
.reader-syntax-keyword{color:var(--keyword);font-weight:600}.reader-syntax-string{color:var(--string)}.reader-syntax-number{color:var(--number)}.reader-syntax-comment{color:var(--muted)}.reader-syntax-symbol{color:var(--symbol)}.reader-syntax-function{color:var(--function)}
.reader-table-scroll{width:100%;overflow-x:auto;overscroll-behavior-x:contain;border:1px solid var(--line);border-radius:7px;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:.9375rem;line-height:1.55;white-space:normal}th,td{text-align:left;vertical-align:top;padding:4px 12px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);min-width:4em;overflow-wrap:normal}th{background:var(--quote);font-weight:650}tr:last-child td{border-bottom:0}th:last-child,td:last-child{border-right:0}img{display:block;max-width:100%;height:auto;border-radius:6px}mark{background:#f4df91;color:#25372a;border-radius:2px}mark.current-hit{background:#e7ad45;outline:2px solid #a06e22}.image-placeholder{display:block;padding:16px;margin:12px 0;border:1px dashed var(--muted);border-radius:8px;font-size:.8125rem;line-height:1.6}
@media(max-width:340px){body{padding-left:16px;padding-right:16px}th,td{padding-left:8px;padding-right:8px}}
`
}
