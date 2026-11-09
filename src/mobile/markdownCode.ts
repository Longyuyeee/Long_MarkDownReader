import {highlightTree,tagHighlighter,tags} from '@lezer/highlight'
import {StreamLanguage} from '@codemirror/language'
import {jsonLanguage} from '@codemirror/lang-json'
import {yamlLanguage} from '@codemirror/lang-yaml'
import {xmlLanguage} from '@codemirror/lang-xml'
import {toml} from '@codemirror/legacy-modes/mode/toml'
import {codeLanguage} from './codeLanguage'
import {codeFormats} from './codeFormats'

export const escapeCode=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const aliases:Record<string,string>={js:'javascript',ts:'typescript',py:'python',rs:'rust',kt:'kotlin','c++':'cpp','c#':'csharp',sh:'shell',bash:'shell',ps1:'powershell',yml:'yaml',text:'plaintext',txt:'plaintext'}
const extra:Record<string,string>={json:'JSON',yaml:'YAML',xml:'XML',toml:'TOML',plaintext:'纯文本'}
export function markdownCodeLanguage(info:string){const raw=info.trim().split(/\s+/)[0]?.slice(0,32)||'',id=aliases[raw.toLowerCase()]||raw.toLowerCase(),format=codeFormats.find(f=>f.language===id||(f.extensions as readonly string[]).includes(id));return {id:format?.language||id,label:format?.label||extra[id]||raw||'代码',highlight:!!format?.highlight||['json','yaml','xml','toml'].includes(id)}}
const colors=tagHighlighter([{tag:[tags.keyword,tags.tagName,tags.bool,tags.null],class:'reader-syntax-keyword'},{tag:tags.string,class:'reader-syntax-string'},{tag:tags.number,class:'reader-syntax-number'},{tag:tags.comment,class:'reader-syntax-comment'},{tag:[tags.function(tags.variableName),tags.function(tags.propertyName),tags.definition(tags.variableName)],class:'reader-syntax-function'},{tag:[tags.operator,tags.punctuation,tags.typeName],class:'reader-syntax-symbol'}])
/** Runs only inside the cancellable preparation worker. The output is also
 * sanitized by the parent; all source text is escaped, never executed. */
export function renderMarkdownCode(text:string,info:string,remaining:number){
 const language=markdownCodeLanguage(info),plain=escapeCode(text)+'\n'
 if(!language.highlight||text.length>32768||text.length>remaining)return {html:plain,used:0,highlighted:false}
 const parser=language.id==='json'?jsonLanguage.parser:language.id==='yaml'?yamlLanguage.parser:language.id==='xml'?xmlLanguage.parser:language.id==='toml'?StreamLanguage.define(toml).parser:codeLanguage(language.id as Parameters<typeof codeLanguage>[0])
 if(Array.isArray(parser))return {html:plain,used:0,highlighted:false}
 const tree='parse' in parser?parser.parse(text):parser.parser.parse(text),ranges:{from:number;to:number;css:string}[]=[]
 highlightTree(tree,colors,(from,to,css)=>{if(ranges.length<4001)ranges.push({from,to,css})})
 if(ranges.length>4000)return {html:plain,used:0,highlighted:false}
 let html='',at=0
 for(const range of ranges){html+=escapeCode(text.slice(at,range.from))+`<span class="${range.css}">${escapeCode(text.slice(range.from,range.to))}</span>`;at=range.to}
 html+=escapeCode(text.slice(at))+'\n'
 return {html,used:text.length,highlighted:true}
}
