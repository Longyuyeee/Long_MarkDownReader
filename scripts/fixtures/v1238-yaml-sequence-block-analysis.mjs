import {parseAllDocuments,isMap,isSeq,isScalar} from 'yaml'
import {fixtureYamlAnalysis as previous,fixtureYamlReplace as primitive} from './v1223-yaml-analysis.mjs'
// Simulated browser IPC only. Real Saphyr spans and byte preservation are Rust/native proof.
const byte=(s,n)=>new TextEncoder().encode(s.slice(0,n)).length
function nodes(content){const found=[],docs=parseAllDocuments(content);const visit=(n,blocked=false,key,sequence=false)=>{if(!n)return;blocked ||= !!n.anchor||!!n.tag;if(isMap(n)){const merged=n.items.some(p=>p.key?.value==='<<');for(const p of n.items)visit(p.value,blocked||merged||typeof p.key?.value!=='string',p.key)}else if(isSeq(n))n.items.forEach(v=>visit(v,blocked,undefined,true));else if(isScalar(n))found.push({n,key,blocked,sequence})};docs.forEach(d=>visit(d.contents,docs.length!==1));return found}
export function fixtureYamlSequenceBlockAnalysis(content){const a=previous(content);for(const{n,key,blocked,sequence}of nodes(content)){const e=a.outline.find(e=>e.start===byte(content,n.range[0])&&e.end===byte(content,n.range[1]));if(e&&(key||sequence)&&!blocked&&['BLOCK_LITERAL','BLOCK_FOLDED'].includes(n.type)){e.literal=n.type==='BLOCK_LITERAL';e.folded=n.type==='BLOCK_FOLDED';e.editable=true;e.editUnavailableReason=undefined}}return a}
function selected(args){return nodes(args.content).find(({n,key,blocked,sequence})=>(key||sequence)&&!blocked&&['BLOCK_LITERAL','BLOCK_FOLDED'].includes(n.type)&&byte(args.content,n.range[0])===args.start&&byte(args.content,n.range[1])===args.end)}
export function fixtureYamlSequenceBlockInspect(args){const target=selected(args);if(!target)throw Error('多行文字的位置已变化，草稿仍保留');return target.n.value}
export function fixtureYamlSequenceBlockReplace(args){
 const target=selected(args);if(!target)return primitive(args)
 const value=args.replacement.replaceAll('\r\n','\n');if(/[\u0000-\u0008\u000b-\u001f\u0085\u2028\u2029]/.test(value))throw Error('文字包含不支持的控制字符；输入与草稿仍保留')
 const {content}=args,{n,key}=target;if(n.value===value)return content
 const start=n.range[0],end=n.range[1]+(content.slice(n.range[1]).match(/^(?:[ \t]*\r?\n)+/)?.[0].length||0),headerEnd=content.indexOf('\n',start)+1,old=content.slice(start,headerEnd).match(/^[|>][-+1-9]*/)[0],raw=content.slice(headerEnd,end),keyIndent=key?key.range[0]-(content.lastIndexOf('\n',key.range[0]-1)+1):content.slice(content.lastIndexOf('\n',start-1)+1,start).match(/^ */)[0].length,digit=old.match(/[1-9]/)?.[0],indent=digit?Number(digit)+keyIndent:raw.split('\n').find(s=>s.trim())?.match(/^ */)[0].length||keyIndent+2
 const trailing=value.match(/\n*$/)[0].length,mode=trailing===0?'-':trailing>1||!value.replaceAll('\n','')||old.includes('+')?'+':''
 let marker=old.replace(/[+-]/g,'')+mode
 if(trailing===0&&old.includes('-')||trailing===1&&value.replaceAll('\n','')&&!old.includes('-')||trailing>1&&old.includes('+'))marker=old
 if(n.type==='BLOCK_FOLDED'&&!digit&&value.split('\n').find(l=>l.length)?.match(/^[ \t]/)){const width=indent-keyIndent;if(width<1||width>9)throw Error('当前缩进无法表达；输入仍保留');marker=marker[0]+width+marker.slice(1)}
 const lines=value.match(/[^\n]*\n|[^\n]+$/g)||[],encoded=n.type==='BLOCK_FOLDED'?lines.map((line,i)=>{const t=line.replace(/\n$/,'');const next=lines.slice(i+1).map(l=>l.replace(/\n$/,'')).find(l=>l.length);return line+(line.endsWith('\n')&&t.length&&!/^[ \t]/.test(t)&&next&&!/^[ \t]/.test(next)?'\n':'')}).join(''):value
 let body=encoded.split(/(?<=\n)/).filter(Boolean).map(line=>' '.repeat(indent)+line.replace(/\n$/,'')+'\n').join('')
 if(!old.includes('+')&&mode!=='+'){const lines=raw.match(/[^\n]*\n|[^\n]+$/g)||[];let suffix='';for(const l of lines.reverse()){if(l.trim())break;suffix=l+suffix}body+=suffix}
 return content.slice(0,start)+marker+content.slice(start+old.length,headerEnd)+body+content.slice(end)
}
