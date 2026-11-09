import {isJsonScalar,type JsonField} from './jsonStructure.ts'
export type JsonTreeRow={id:number;depth:number;more?:true}
/** A bounded view over source-range IDs, never a reconstructed JSON object. */
export function jsonTreeRows(fields:readonly JsonField[],ids:readonly number[],expanded:ReadonlySet<number>,limit=128):JsonTreeRow[]{
 const rows:JsonTreeRow[]=[],cap=Math.max(limit,ids.length+1)
 function visit(id:number,depth:number,reserved:number){
  const node=fields[id];if(!node)return
  rows.push({id,depth});if(!expanded.has(id)||isJsonScalar(node.kind)||!node.children.length)return
  for(let n=0;n<node.children.length;n++){
   if(depth>=5||n>=30||rows.length+reserved+1>=cap){if(rows.length+reserved<cap)rows.push({id,depth:depth+1,more:true});break}
   visit(node.children[n]!,depth+1,reserved+1)
  }
 }
 ids.forEach((id,n)=>visit(id,0,ids.length-n-1));return rows
}
export function initialJsonExpansion(fields:readonly JsonField[]):Set<number>{
 const children=fields[0]?.children.map(id=>fields[id]!)||[],result=new Set<number>()
 for(const kind of ['object','array']){const node=children.find(f=>f.kind===kind&&f.children.length>0&&f.children.length<=(kind==='array'?5:8));if(node)result.add(node.id)}
 return result
}
export const jsonTypeName=(kind:JsonField['kind'])=>({object:'Object',array:'Array',string:'String',number:'Number',boolean:'Boolean',null:'Null'})[kind]
