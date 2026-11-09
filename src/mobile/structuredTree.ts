export interface StructuredNode {key:string;label:string;kind:string;value:string;children:string[];container:boolean;attributes?:string[]}
export interface StructuredRow {node:StructuredNode;depth:number;more?:true}
/** A bounded view over original parser IDs; never reparses or rewrites a file. */
export function structuredTreeRows(nodes:ReadonlyMap<string,StructuredNode>,roots:readonly string[],expanded:ReadonlySet<string>,limit=128):StructuredRow[]{
 const rows:StructuredRow[]=[],cap=Math.max(limit,roots.length+1)
 function visit(key:string,depth:number,reserved:number,ancestors:ReadonlySet<string>){
  const node=nodes.get(key);if(!node||ancestors.has(key))return
  rows.push({node,depth});if(!expanded.has(key)||!node.children.length)return
  const seen=new Set(ancestors).add(key)
  for(let n=0;n<node.children.length;n++){
   if(depth>=5||n>=30||rows.length+reserved+1>=cap){if(rows.length+reserved<cap)rows.push({node,depth:depth+1,more:true});break}
   visit(node.children[n]!,depth+1,reserved+1,seen)
  }
 }
 roots.forEach((key,n)=>visit(key,0,roots.length-n-1,new Set()));return rows
}
export function initialStructuredExpansion(nodes:ReadonlyMap<string,StructuredNode>,roots:readonly string[]):Set<string>{
 const result=new Set<string>()
 for(const key of roots.slice(0,6)){const node=nodes.get(key);if(!node?.children.length||node.children.length>8)continue;result.add(key);for(const child of node.children.slice(0,6)){const value=nodes.get(child);if(value?.container&&value.children.length>0&&value.children.length<=5)result.add(child)}}
 return result
}
