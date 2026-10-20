export interface TextSpan { from:number; to:number }
export interface FindOptions { query:string; caseSensitive:boolean; wholeWord:boolean; range?:TextSpan }
export interface FindResult { matches:TextSpan[]; reason:string }
export interface Replacement { content:string; changes:Array<TextSpan&{insert:string}>; range:TextSpan; last:TextSpan }
const word=/[\p{L}\p{N}\p{M}_]/u
const before=(text:string,at:number)=>text.slice(Math.max(0,at-2),at).match(/.$/u)?.[0]||''
const after=(text:string,at:number)=>text.slice(at,at+2).match(/^./u)?.[0]||''
export function findDocumentMatches(content:string,options:FindOptions):FindResult {
 if(!options.query)return {matches:[],reason:''}
 if(options.query.length>4096)return {matches:[],reason:'查找内容较长，请缩短到 4096 个字符以内。'}
 if(content.length>2*1024*1024)return {matches:[],reason:'正文较大，请使用原有查找；替换支持约 200 万字符以内的当前文档。'}
 const scope=options.range||{from:0,to:content.length}
 if(!Number.isInteger(scope.from)||!Number.isInteger(scope.to)||scope.from<0||scope.to>content.length||scope.from>scope.to)return {matches:[],reason:'选区已变化，请重新打开查找替换。'}
 const escaped=options.query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),regex=new RegExp(escaped,options.caseSensitive?'gu':'giu'),matches:TextSpan[]=[]
 regex.lastIndex=scope.from
 for(let match;(match=regex.exec(content));){const from=match.index,to=from+match[0].length;if(from<scope.from)continue;if(from>=scope.to||to>scope.to)break
  if(options.wholeWord&&(word.test(before(content,from))||word.test(after(content,to))))continue
  matches.push({from,to});if(matches.length>10000)return {matches:[],reason:'命中超过 10000 处，请缩小选区或补充关键词；不会部分替换。'}
 }
 return {matches,reason:''}
}
export function replaceDocumentMatches(content:string,matches:TextSpan[],insert:string,scope:TextSpan={from:0,to:content.length}):Replacement {
 if(!matches.length)throw Error('没有可替换的匹配。')
 if(!Number.isInteger(scope.from)||!Number.isInteger(scope.to)||scope.from<0||scope.to>content.length||scope.from>scope.to)throw Error('选区已变化，请重新查找。')
 let end=scope.from,delta=0;for(const match of matches){if(!Number.isInteger(match.from)||!Number.isInteger(match.to)||match.from<end||match.to<=match.from||match.to>scope.to)throw Error('匹配范围已变化，请重新查找。');delta+=insert.length-(match.to-match.from);end=match.to}
 if(content.length+delta>2*1024*1024)throw Error('替换后的正文过大，请缩小范围或减少替换内容；当前草稿未改动。')
 end=scope.from;let next='';for(const match of matches){next+=content.slice(end,match.from)+insert;end=match.to}
 const last=matches[matches.length-1],priorDelta=delta-insert.length+(last.to-last.from)
 return {content:content.slice(0,scope.from)+next+content.slice(end),changes:matches.map(match=>({...match,insert})),range:{from:scope.from,to:scope.to+delta},last:{from:last.from+priorDelta,to:last.from+priorDelta+insert.length}}
}
export interface FindDocumentSnapshot { path:string;content:string;owner:unknown;selection?:TextSpan;selectionReason?:string;label:string;readOnlyReason?:string }
