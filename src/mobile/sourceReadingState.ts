export const sourceReadingKey='longedit-mobile-source-reading-v1'
export type SourceRange={from:number;to:number;backward?:boolean}
export type QuerySelection={start:number;end:number;direction:'forward'|'backward'|'none'}
export interface SourceBookmark {fingerprint:string;offset:number;scroll:number;horizontal?:number;query?:string;querySelection?:QuerySelection|null;match?:SourceRange|null;selection?:SourceRange|null;anchor?:{from:number;fraction:number}|null;updated:number}
const integer=(v:unknown,max=4*1024*1024)=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=max
const range=(v:unknown)=>{const r=v as SourceRange;return !!r&&integer(r.from)&&integer(r.to)&&r.to>=r.from&&(r.backward===undefined||typeof r.backward==='boolean')}
export function validSourceBookmark(v:unknown):v is SourceBookmark {
 const p=v as SourceBookmark;if(!p||typeof p.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(p.fingerprint)||!integer(p.offset)||!Number.isFinite(p.scroll)||p.scroll<0||p.scroll>10_000_000||!Number.isFinite(p.updated))return false
 if(p.horizontal!==undefined&&(!Number.isFinite(p.horizontal)||p.horizontal<0||p.horizontal>1))return false
 if(p.query!==undefined&&(typeof p.query!=='string'||p.query.length>128))return false
 if(p.querySelection!=null){const q=p.querySelection;if(!integer(q.start,128)||!integer(q.end,128)||q.end<q.start||q.end>(p.query||'').length||!['forward','backward','none'].includes(q.direction))return false}
 if(p.match!=null&&!range(p.match)||p.selection!=null&&!range(p.selection))return false
 if(p.anchor!=null&&(!integer(p.anchor.from)||!Number.isFinite(p.anchor.fraction)||p.anchor.fraction<0||p.anchor.fraction>1))return false
 return true
}
