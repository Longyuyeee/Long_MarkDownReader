import {highlightTree,tagHighlighter,tags} from '@lezer/highlight'
import {codeLanguage} from './codeLanguage'
import type {CodeLanguage} from './codeFormats'
import {escapeCode} from './markdownCode'

const colors=tagHighlighter([{tag:[tags.keyword,tags.bool,tags.null],class:'reader-syntax-keyword'},{tag:tags.string,class:'reader-syntax-string'},{tag:tags.number,class:'reader-syntax-number'},{tag:tags.comment,class:'reader-syntax-comment'},{tag:[tags.function(tags.variableName),tags.function(tags.propertyName),tags.definition(tags.variableName)],class:'reader-syntax-function'},{tag:[tags.operator,tags.punctuation,tags.typeName],class:'reader-syntax-symbol'}])
const jsonColors=tagHighlighter([{tag:[tags.propertyName,tags.string],class:'reader-syntax-string'},{tag:[tags.bool,tags.null],class:'reader-syntax-keyword'},{tag:tags.number,class:'reader-syntax-number'}])
/** Only called in the cancellable preparation worker. Never executes source.
 * The same registered parsers as editing are used; mixed/plain and over-budget
 * syntax retain real text and line numbers without claiming a syntax parse. */
export function renderSourceCode(source:string,language:CodeLanguage){
 const text=source.replace(/\r\n?/g,'\n'),parser=codeLanguage(language),ranges:{from:number;to:number;css:string}[]=[]
 if(!Array.isArray(parser)&&text.length<=32768){highlightTree(parser.parser.parse(text),language==='json'?jsonColors:colors,(from,to,css)=>{if(ranges.length<2001)ranges.push({from,to,css})});if(ranges.length>2000)ranges.length=0}
 let offset=0,cursor=0
 const rows=text.split('\n').map((line,index)=>{
  const end=offset+line.length;let at=offset,html=''
  while(cursor<ranges.length&&ranges[cursor]!.to<=offset)cursor++
  for(let n=cursor;n<ranges.length&&ranges[n]!.from<end;n++){const r=ranges[n]!,from=Math.max(offset,r.from),to=Math.min(end,r.to);if(to<=from)continue;html+=escapeCode(text.slice(at,from))+`<span class="${r.css}">${escapeCode(text.slice(from,to))}</span>`;at=to}
  html+=escapeCode(text.slice(at,end));offset=end+1
  return `<span class="reader-source-line"><span class="reader-source-gutter" aria-hidden="true">${index+1}</span><span class="reader-source-text">${html}</span></span>`
 })
 return `<pre class="reader-source-code"><code>${rows.join('\n')}</code></pre>`
}

export function sourceCodeReaderStyle(wrap:boolean){return `
:root{color-scheme:dark}*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;background:#111f29;color:#eef5f5;font:0.875rem/1.8 ui-monospace,"SFMono-Regular",Consolas,monospace}article{min-width:100%}pre.reader-source-code{margin:0;padding:0 12px 32px 0;min-width:100%;${wrap?'width:auto':'width:max-content'};white-space:normal;font:inherit;tab-size:2}pre.reader-source-code>code{display:block;font:inherit}.reader-source-line{display:grid;grid-template-columns:max(40px,calc(3ch + 12px)) minmax(0,1fr);min-height:1.8em}.reader-source-line:first-child{padding-top:16px}.reader-source-gutter{padding-right:12px;text-align:right;font-size:.8125rem;color:#b0c2c9;user-select:none;-webkit-user-select:none}.reader-source-text{display:block;min-width:0;white-space:${wrap?'pre-wrap':'pre'};${wrap?'overflow-wrap:anywhere;':''}background-image:repeating-linear-gradient(to right,transparent 0,transparent calc(2ch - 1px),#9aafb533 calc(2ch - 1px),#9aafb533 2ch);background-size:calc(var(--reader-indent,0)*1ch) 100%;background-repeat:no-repeat}.reader-source-current{background:#254665;box-shadow:inset 3px 0 #8acbe0}.reader-syntax-keyword{color:#e5b5f0}.reader-syntax-string{color:#ffd479}.reader-syntax-number{color:#ffc784}.reader-syntax-comment{color:#8bcf8c}.reader-syntax-function{color:#8ad9ef}.reader-syntax-symbol{color:#c9e3eb}mark{background:#f4df91;color:#25372a;border-radius:2px}mark.current-hit{background:#e7ad45;outline:2px solid #a06e22}
`}
