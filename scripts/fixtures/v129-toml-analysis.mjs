// Browser fixture only. Production ranges and validation are provided by Rust.
export function fixtureTomlAnalysis(content){
 const outline=[],byte=i=>new TextEncoder().encode(content.slice(0,i)).length;let parent='',counts={}
 let offset=0
 for(const line of content.split('\n')){
  const t=line.trim(),array=t.match(/^\[\[([^\]]+)\]\]$/),table=t.match(/^\[([^\]]+)\]$/)
  if(array){const p=array[1];parent=p+'['+(counts[p]??0)+']';counts[p]=(counts[p]??0)+1}
  else if(table)parent=table[1]
  else{
   const m=line.match(/^\s*("[^"\n]+"|[\w-]+)\s*=\s*(.*)$/)
   if(m){const key=m[1],p=key.startsWith('"')?'['+key+']':(parent?parent+'.':'')+key,raw=m[2].replace(/\s+#.*$/,'').trimEnd(),index=line.indexOf(m[2]),start=byte(offset+index),end=byte(offset+index+raw.length),editable=!raw.startsWith('[')&&!raw.startsWith('{')&&!/^\d{4}-\d{2}-/.test(raw);outline.push({path:p,label:key.replaceAll('"',''),kind:'value',depth:parent?1:0,preview:raw,start,end,line:outline.length+1,column:index+1,editable,editUnavailableReason:editable?undefined:'数组、内联表和日期时间请在源码中修改，其他内容会保留'})}
  }
  offset+=line.length+1
 }
 return{valid:!content.includes('INVALID'),outline,outlineTruncated:false,diagnostics:[],tableCount:2,arrayOfTablesCount:2,valueCount:outline.length,maxDepth:1}
}
export function fixtureTomlReplace(args){
 const v=args.replacement.trim()
 if(!/^(?:'(?:[^']*)'|"(?:\\.|[^"\\])*"|true|false|[+-]?(?:\d[\d_]*(?:\.\d+)?|inf|nan))$/.test(v))throw Error('请输入合法的 TOML 字符串、布尔或数字字面量；字符串需要引号')
 const b=new TextEncoder().encode(args.content),dec=b=>new TextDecoder().decode(b)
 return dec(b.slice(0,args.start))+v+dec(b.slice(args.end))
}
